import { httpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { 
  requireAuth, 
  authenticateWebSocket,
  getUserIdFromPayload,
  verifyJWT 
} from "../auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/createFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const folder = await runMutation("functions:createFolder" as any, { name: body.name });
    return new Response(JSON.stringify(folder), { status: 201 });
  }),
});

http.route({
  path: "/listFolders",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    const folders = await runQuery("functions:listFolders" as any, {});
    return new Response(JSON.stringify({ folders }), { status: 200 });
  }),
});

http.route({
  path: "/renameFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId, name } = await request.json();
    await runMutation("functions:renameFolder" as any, {
      folderId: folderId as Id<'folders'>,
      name,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/deleteFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId } = await request.json();
    await runMutation("functions:deleteFolder" as any, {
      folderId: folderId as Id<'folders'>,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getFolder",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    if (!folderId) return new Response("Missing folderId", { status: 400 });
    const folder = await runQuery("functions:getFolder" as any, {
      folderId: folderId as Id<'folders'>,
    });
    if (!folder) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(folder), { status: 200 });
  }),
});

http.route({
  path: "/createSession",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation("functions:createSession" as any, {
      folderId: body.folderId as Id<'folders'> | undefined,
    });
    return new Response(JSON.stringify(result), { status: 201 });
  }),
});

http.route({
  path: "/getSessionMessages",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const beforeTurnNo = url.searchParams.get("beforeTurnNo");
    const limit = url.searchParams.get("limit");
    const rows = await runQuery("functions:getSessionMessages" as any, {
      sessionId: sessionId as Id<'sessions'>,
      beforeTurnNo: beforeTurnNo ? Number(beforeTurnNo) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  }),
});

http.route({
  path: "/updateSessionContext",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:updateSessionContext" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
      context: body.context,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getSessionContext",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const data = await runQuery("functions:getSessionContext" as any, {
      sessionId: sessionId as Id<'sessions'>,
    });
    if (!data) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(data), { status: 200 });
  }),
});

http.route({
  path: "/getBoardSummary",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const summary = await runQuery("functions:getBoardSummary" as any, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(summary), { status: 200 });
  }),
});

http.route({
  path: "/insertSnapshot",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:insertSnapshot" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
      snapshotIndex: body.snapshotIndex,
      actionsJson: body.actionsJson,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getWhiteboardSnapshots",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const maxIndex = url.searchParams.get("maxIndex");
    const rows = await runQuery("functions:getWhiteboardSnapshots" as any, {
      sessionId: sessionId as Id<'sessions'>,
      maxIndex: maxIndex ? Number(maxIndex) : undefined,
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  }),
});

http.route({
  path: "/uploadSessionDocuments",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation("functions:uploadSessionDocuments" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
      files: body.files ?? [],
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/getSessionAnalysis",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const result = await runQuery("functions:getSessionAnalysisResults" as any, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

// Enhanced session management endpoints

http.route({
  path: "/deleteSession",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation("functions:deleteSession" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/listUserSessions",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const result = await runQuery("functions:listUserSessions" as any, {
      limit: limit ? Number(limit) : undefined,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/cleanupExpiredSessions",
  method: "POST",
  handler: httpAction(async ({ runMutation }) => {
    const result = await runMutation("functions:cleanupExpiredSessions" as any, {});
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/getFolderData",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    if (!folderId) return new Response("Missing folderId", { status: 400 });
    const result = await runQuery("functions:getFolderData" as any, {
      folderId: folderId as Id<'folders'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/validateSessionContext",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const result = await runQuery("functions:validateSessionContext" as any, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/logMiniQuizAttempt",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:logMiniQuizAttempt" as any, body);
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/logUserSummary",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:logUserSummary" as any, body);
    return new Response(null, { status: 200 });
  }),
});

// Enhanced authentication endpoints

http.route({
  path: "/auth/status",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    try {
      const status = await runQuery("functions:checkAuthStatus" as any, {});
      return new Response(JSON.stringify(status), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        authenticated: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), { status: 200 });
    }
  }),
});

http.route({
  path: "/auth/user",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    try {
      const user = await runQuery("functions:getCurrentUserInfo" as any, {});
      if (!user) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
      }
      return new Response(JSON.stringify(user), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      }), { status: 401 });
    }
  }),
});

http.route({
  path: "/user/sessions",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get("limit");
      const sessions = await runQuery("functions:getUserSessions" as any, {
        limit: limit ? parseInt(limit) : undefined,
      });
      return new Response(JSON.stringify({ sessions }), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch sessions' 
      }), { status: 401 });
    }
  }),
});

http.route({
  path: "/user/folders",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get("limit");
      const folders = await runQuery("functions:getUserFolders" as any, {
        limit: limit ? parseInt(limit) : undefined,
      });
      return new Response(JSON.stringify({ folders }), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch folders' 
      }), { status: 401 });
    }
  }),
});

http.route({
  path: "/stream-chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { sessionId, message, userId } = body;

      if (!sessionId || !message || !userId) {
        return new Response("Missing required fields: sessionId, message, userId", { 
          status: 400 
        });
      }

      console.log(`[HTTP Streaming] Starting chat stream for session: ${sessionId}, user: ${userId}`);

      // Create streaming response
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const textEncoder = new TextEncoder();

      // Start streaming in background
      const streamData = async () => {
        let content = "";
        let messageId = "";

        try {
          // 1. Add user message to database immediately
          const userMessageResult = await ctx.runMutation("functions:addSessionMessage" as any, {
            sessionId: sessionId as Id<'sessions'>,
            role: 'user',
            text: message,
            payloadJson: { text: message }
          });

          // 2. Get session context and call planner if needed
          const session = await ctx.runQuery("functions:getSession" as any, { 
            sessionId: sessionId as Id<'sessions'> 
          });
          
          if (!session) {
            throw new Error(`Session ${sessionId} not found`);
          }

          console.log(`[HTTP Streaming] Session found, planning focus...`);
          
          // 3. Call the planner agent to get context and approach
          const plannerResult = await ctx.runAction("functions:planSessionFocus" as any, {
            sessionId,
            userId,
            folderId: session.folder_id || undefined
          });

          console.log(`[HTTP Streaming] Planner completed:`, plannerResult.success);

          // 4. Create placeholder for AI message
          const aiMessageResult = await ctx.runMutation("functions:addSessionMessage" as any, {
            sessionId: sessionId as Id<'sessions'>,
            role: 'assistant',
            text: "",
            payloadJson: { text: "", isStreaming: true }
          });
          messageId = aiMessageResult.id;

          // 5. Start OpenAI streaming
          const systemPrompt = plannerResult.success && plannerResult.data?.suggested_approach 
            ? plannerResult.data.suggested_approach 
            : "You are a helpful AI tutor. Provide clear, educational responses.";

          console.log(`[HTTP Streaming] Starting OpenAI stream with system prompt length: ${systemPrompt.length}`);

          // Initialize OpenAI
          const { OpenAI } = await import('openai');
          const openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY 
          });

          const stream = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          });

          // 6. Stream chunks to frontend and accumulate content
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              content += text;
              
              // Stream to frontend
              await writer.write(textEncoder.encode(text));
            }
          }

          // 7. Final database update - patch the message with complete content
          await ctx.runMutation("functions:updateSessionMessage" as any, {
            messageId: messageId as Id<'session_messages'>,
            text: content,
            payloadJson: { text: content, isStreaming: false, isComplete: true }
          });

          console.log(`[HTTP Streaming] Completed streaming for session: ${sessionId}, content length: ${content.length}`);

        } catch (error) {
          console.error(`[HTTP Streaming] Error:`, error);
          
          // Send error message to frontend
          const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
          await writer.write(textEncoder.encode(`\n\n${errorMessage}`));
          
          // Update database with error if we have a messageId
          if (messageId) {
            try {
              await ctx.runMutation("functions:updateSessionMessage" as any, {
                messageId: messageId as Id<'session_messages'>,
                text: content + `\n\nError: ${errorMessage}`,
                payloadJson: { 
                  text: content, 
                  error: errorMessage,
                  isStreaming: false, 
                  isComplete: true 
                }
              });
            } catch (patchError) {
              console.error(`[HTTP Streaming] Failed to update message with error:`, patchError);
            }
          }
        } finally {
          await writer.close();
        }
      };

      // Start streaming (don't await - let it run in background)
      void streamData();

      // Return streaming response
      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
      });

    } catch (error) {
      console.error("[HTTP Streaming] Setup error:", error);
      return new Response(`Server error: ${error instanceof Error ? error.message : String(error)}`, { 
        status: 500 
      });
    }
  }),
});

export default http;
