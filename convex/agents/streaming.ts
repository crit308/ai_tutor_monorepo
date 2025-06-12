import { requireAuth } from "../auth/middleware";
import { internalAction, internalMutation, mutation, query } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { Agent, vStreamArgs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { WHITEBOARD_SKILLS_PROMPT } from "./whiteboard_agent";

// Extra guidance so the LLM emits a pure JSON skill call when drawing is needed
const JSON_SKILL_INSTRUCTION = `\n\nIf you want to create or modify something on the whiteboard, output ONE and only ONE JSON object with this exact shape:\n{ "skill_name": "<string>", "skill_args": { ... } }\nDo NOT wrap it in markdown fences, do NOT add any explanation before or after. If no drawing is required, just answer normally.`;

// Create the AI Tutor Agent using the Convex Agent component
const tutorAgent = new Agent(components.agent, {
  name: "AI Tutor",
  chat: openai("gpt-4"),
  textEmbedding: openai.embedding("text-embedding-3-small"),
  instructions: "You are a helpful AI tutor. Provide clear, educational responses that help students learn effectively.",
});



/**
 * Get or create session thread
 */
export const getOrCreateSessionThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Get the session
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Access denied: Session not found or not owned by user");
    }
    
    // Check if thread already exists
    const existingThreadId = session.context_data?.agent_thread_id;
    if (existingThreadId) {
      return existingThreadId;
    }
    
    // Create new thread
    const { threadId } = await tutorAgent.createThread(ctx, { userId });
    
    // Update session with thread ID
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
      }
    });
    
    return threadId;
  },
});

/**
 * List thread messages with streaming support
 */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    streams: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    // Verify user has access to this thread by checking if they own a session with this thread
    const sessionWithThread = await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.eq(q.field("user_id"), userId),
          q.eq(q.field("context_data.agent_thread_id"), args.threadId)
        )
      )
      .first();
      
    if (!sessionWithThread) {
      throw new Error("Access denied: Thread not found or not owned by user");
    }
    
    // Get streaming data using the agent's syncStreams
    const streams = await tutorAgent.syncStreams(ctx, { 
      threadId: args.threadId, 
      streamArgs: args.streamArgs 
    });
    
    // Get paginated messages from agent component
    const paginated = await tutorAgent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    
    return {
      ...paginated,
      streams,
    };
  },
});

/**
 * Send a message to a thread with streaming support using agent
 */
export const sendStreamingMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    // Verify user has access to this thread
    const sessionWithThread = await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.eq(q.field("user_id"), userId),
          q.eq(q.field("context_data.agent_thread_id"), args.threadId)
        )
      )
      .first();
      
    if (!sessionWithThread) {
      throw new Error("Access denied: Thread not found or not owned by user");
    }
    
    // Save the user message using the agent
    const { messageId } = await tutorAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
      skipEmbeddings: true, // We're in a mutation, embeddings will be generated during streaming
    });
    
    // Schedule AI response with streaming
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: args.sessionId,
      promptMessageId: messageId,
    });
    
    return { messageId };
  },
});

/**
 * Internal version of sendStreamingMessage
 */
export const sendStreamingMessageInternal = internalMutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Save the user message using the agent
    const { messageId } = await tutorAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
      skipEmbeddings: true,
    });
    
    // Schedule AI response with streaming
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: args.sessionId,
      promptMessageId: messageId,
    });
    
    return { messageId };
  },
});

/**
 * Generate streaming AI response using the Agent component
 */
export const generateStreamingResponse = internalAction({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log(`[Agent Streaming] Starting OpenAI stream for thread: ${args.threadId}`);
      
      // Get enhanced system prompt with knowledge base context
      let customInstructions = "You are a helpful AI tutor. Provide clear, educational responses that help students learn effectively.";
      // Append whiteboard skills prompt so the model knows how to invoke whiteboard actions
      customInstructions += "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
      
      if (args.sessionId) {
        try {
          // Get session to access knowledge base
          const session = await ctx.runQuery(internal.functions.getSessionInternal, {
            sessionId: args.sessionId
          });
          
          if (session) {
            const focusObjective = session.context_data?.focus_objective;
            if (focusObjective) {
              customInstructions += `\n\n**FOCUS OBJECTIVE:**\nTopic: ${focusObjective.topic}\nGoal: ${focusObjective.learning_goal}\nRelevant Concepts: ${focusObjective.relevant_concepts?.join(", ") || ""}`;
            }
          }
          
          if (session && session.folder_id) {
            // Get folder with knowledge base
            const folder = await ctx.runQuery(internal.functions.getFolderInternal, {
              folderId: session.folder_id as Id<"folders">
            });
            
            if (folder && folder.knowledge_base) {
              const knowledgeBase = folder.knowledge_base;
              
              // Get the latest message to check if it's a planner message
              const messages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
                threadId: args.threadId,
                paginationOpts: { numItems: 5, cursor: null },
                order: "desc",
              });
              
              const latestMessage = messages.page[0];
              const messageContent: string = (latestMessage?.message?.content || latestMessage?.text || "") as string;
              
              if (messageContent.includes("INTERNAL_PLANNER_MESSAGE")) {
                // This is the initial planning phase - analyze and immediately start tutoring
                customInstructions = `You are an AI Tutor starting a new learning session.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR TASK:**
1. Analyze the knowledge base content to understand what the student needs to learn
2. Identify the key learning objectives and concepts
3. Immediately start the tutoring session with a warm welcome
4. Begin teaching the most important topics from the knowledge base

**INSTRUCTIONS:**
- Start with a friendly welcome message introducing yourself and the topic
- Briefly mention what you'll be covering based on the uploaded materials
- Begin with fundamental concepts before moving to advanced topics
- Ask an engaging question or present an interesting fact to start the learning
- Use a conversational, encouraging tone
- Make the student feel excited about learning

Start the tutoring session now with your welcome message.` + "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
              } else {
                // This is the executor agent or normal tutoring
                customInstructions = `You are an AI Tutor providing personalized education assistance.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR ROLE:**
- Provide engaging, interactive tutoring based on the uploaded materials
- Welcome the student warmly and create a positive learning environment
- Ask questions, give clear explanations, and guide the student's learning
- Use the whiteboard feature when helpful (mention drawing diagrams or visual aids)
- Encourage active participation and critical thinking
- Adapt your teaching style to the student's needs and understanding level

**INSTRUCTIONS:**
- Start by welcoming the student and introducing the topic from the knowledge base
- Begin with fundamental concepts before moving to advanced topics
- Ask engaging questions to assess understanding and keep the student involved
- Provide clear explanations with relevant examples
- Be encouraging, supportive, and patient
- Use a conversational, friendly tone
- When appropriate, suggest visual elements for the whiteboard
- Focus on helping the student understand and learn effectively

Begin the tutoring session now with a warm welcome and introduction to the topic.` + "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
              }
            }
          }
        } catch (error) {
          console.log("[Agent Streaming] Could not load knowledge base context:", error);
        }
      }

      // --- Whiteboard ledger: list current object IDs so model can reference instead of clearing ---
      try {
        if (args.sessionId) {
          const objs = await ctx.runQuery(api.database.whiteboard.getWhiteboardObjects, {
            sessionId: args.sessionId,
          });
          const ids = objs.map((o: any) => o.id).slice(0, 50); // cap to 50 to avoid exceeding context
          if (ids.length > 0) {
            customInstructions += `\n\nCurrent objects on the whiteboard (ids): ${ids.join(", ")}. When modifying existing graphics, use modify_whiteboard_objects with these ids instead of clear_whiteboard.`;
          }
          customInstructions += "\nAvoid using clear_whiteboard unless absolutely necessary.";
        }
      } catch (e) {
        console.error("[Agent Streaming] Could not append whiteboard ledger", e);
      }

      // Create a new agent instance with custom instructions for this specific response
      const customAgent = new Agent(components.agent, {
        name: "AI Tutor",
        chat: openai("gpt-4"),
        textEmbedding: openai.embedding("text-embedding-3-small"),
        instructions: customInstructions,
      });

      // Continue the thread and stream the response using the custom agent
      const { thread } = await customAgent.continueThread(ctx, { 
        threadId: args.threadId,
      });
      
      // Stream the response using the agent's built-in streaming
      const result = await thread.streamText(
        { 
          promptMessageId: args.promptMessageId,
        },
        { 
          saveStreamDeltas: true,
        }
      );
      
      // Consume the stream to ensure it completes
      await result.consumeStream();
      
      const fullResponse = await result.text;
      console.log(`[Agent Streaming] Completed OpenAI stream, response length: ${fullResponse.length}`);
      
      console.log("[Agent Streaming] Raw assistant response:", fullResponse);
      
      // === Attempt to parse the response as a whiteboard skill call ===
      let skillCall: any = null;
      try {
        skillCall = JSON.parse(fullResponse);
      } catch {
        // Not pure JSON; attempt to extract first JSON-looking substring using regex
        const match = fullResponse.match(/\{[\s\S]*\}/);
        if (match) {
          try { skillCall = JSON.parse(match[0]); } catch {}
        }
      }

      if (skillCall && typeof skillCall === "object" && skillCall.skill_name) {
        console.log(`[Agent Streaming] Detected skill call: ${skillCall.skill_name}`);
        try {
          await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
            skill_name: skillCall.skill_name,
            skill_args: skillCall.skill_args || {},
            session_id: args.sessionId ? args.sessionId.toString() : "unknown",
            user_id: "ai-tutor",
          });
        } catch (e) {
          console.error("[Agent Streaming] Error executing whiteboard skill:", e);
        }
      }
      
      // No need for complex handoff logic - the agent will start tutoring immediately
      
    } catch (error) {
      console.error("[Agent Streaming] Error generating response:", error);
      
      // Create an error message using the agent
      const errorText = `I apologize, but I encountered an error: ${error instanceof Error ? error.message : String(error)}`;
      
      await tutorAgent.saveMessage(ctx, {
        threadId: args.threadId,
        prompt: errorText,
        skipEmbeddings: true,
      });
    }
    
    return null;
  },
});

/**
 * Migrate a session to use agent threads (for backward compatibility)
 */
export const migrateSessionToThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Access denied: Session not found or not owned by user");
    }
    
    // Create new thread using the agent
    const { threadId } = await tutorAgent.createThread(ctx, { userId });
    
    // Update session with thread ID
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
      }
    });
    
    // Migrate existing messages to thread if any
    const existingMessages = await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", args.sessionId))
      .order("asc")
      .collect();
    
    if (existingMessages.length > 0) {
      // Convert session messages to thread messages using the agent's format
      for (const msg of existingMessages) {
        await tutorAgent.saveMessage(ctx, {
          threadId,
          prompt: msg.text || "",
          skipEmbeddings: true,
        });
      }
    }
    
    return threadId;
  },
}); 