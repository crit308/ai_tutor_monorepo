// Convex AI Agent Functions
// Integration layer between Convex backend and AI agent system

import { v } from "convex/values";
import { mutation, action, query } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
  initializeAgentSystem,
  runDocumentAnalysis,
  planSession,
  analyzeSession,
  runCompleteWorkflow,
  getAgentSystemStatus,
  agentPerformanceMonitor
} from ".";
import type {
  AgentContext,
  AnalysisResult,
  FocusObjective,
  SessionAnalysis,
  UserModelState
} from ".";
import { AnalyzerAgent } from "./analyzerAgent"; // Import the agent class

// Initialize the AI agent system (called once on startup)
export const initializeAgents = action({
  args: {
    apiKey: v.optional(v.string())
  },
  handler: async (ctx, { apiKey }) => {
    try {
      // Get OpenAI API key from environment if not provided
      const openaiKey = apiKey || process.env.OPENAI_API_KEY;
      
      if (!openaiKey) {
        throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass as parameter.");
      }

      initializeAgentSystem(openaiKey);
      
      console.log("✅ AI Agent System initialized successfully");
      
      return {
        success: true,
        message: "AI Agent System initialized successfully"
      };
    } catch (error) {
      console.error("❌ Failed to initialize AI Agent System:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Document Analysis Agent
export const analyzeDocuments = action({
  args: {
    sessionId: v.string(), // Should be Id<"sessions"> if your schema uses it, or handle conversion
    userId: v.string(),
    vectorStoreId: v.string(),
    folderId: v.optional(v.string()), // Should be Id<"folders"> if schema uses it
    // maxResults: v.optional(v.number()) // AnalyzerAgent currently doesn't use this input
  },
  handler: async (ctx, { sessionId, userId, vectorStoreId, folderId }) => {
    console.log(`[aiAgents.analyzeDocuments ACTION] Called for VS: ${vectorStoreId}, Session: ${sessionId}, User: ${userId}, Folder: ${folderId || 'N/A'}`);
    
    const agentContext: AgentContext = {
      session_id: sessionId,
      user_id: userId,
      folder_id: folderId, // Will be undefined if not provided
      vector_store_id: vectorStoreId
    };

    try {
      // API key for AnalyzerAgent will be picked up from environment variables by its constructor
      const analyzer = new AnalyzerAgent(); 
      const agentResponse = await analyzer.execute(agentContext, { vector_store_id: vectorStoreId });

      if (agentResponse.success && agentResponse.data) {
        const analysisData = agentResponse.data as AnalysisResult; 
        
        if (folderId && analysisData.analysis_text) {
          console.log(`[aiAgents.analyzeDocuments ACTION] Updating KB for folder: ${folderId}`);
          try {
            await ctx.runMutation("functions:updateKnowledgeBase" as any, {
              folderId: folderId as Id<'folders'>,
              knowledgeBase: analysisData.analysis_text
            });
            console.log(`[aiAgents.analyzeDocuments ACTION] KB updated successfully for folder: ${folderId}`);
          } catch (kbError) {
            console.error(`[aiAgents.analyzeDocuments ACTION] CRITICAL: Failed to update knowledge base for folder ${folderId}:`, kbError);
            // Depending on requirements, you might want to make the whole action fail here
            // return { success: false, error: `Failed to save analysis to folder: ${(kbError as Error).message}` };
          }
        } else if (folderId && !analysisData.analysis_text) {
            console.warn(`[aiAgents.analyzeDocuments ACTION] Analysis text is empty for folder ${folderId}. KB not updated.`);
        }
        
        // Update session context with the analysis result
        try {
            const session = await ctx.runQuery("functions:getSession" as any, {sessionId: sessionId as any}); // Ensure correct API path
            if (session && session.folder_id) {
                await ctx.runMutation("functions:updateSessionContext" as any, { // Ensure correct API path
                    sessionId: sessionId as Id<'sessions'>,
                    context: {
                        ...session.context_data,
                        planner_focus: "Session initiated with document analysis approach",
                        knowledge_base: analysisData.analysis_text
                    }
                });
            } else {
                console.log("[Agent] No session or folder found for context update");
                
                // Still update the session context even without folder
                if (session) {
                  await ctx.runMutation("functions:updateSessionContext" as any, {
                    sessionId: sessionId as Id<'sessions'>,
                    context: {
                        ...session.context_data,
                        planner_focus: "Session initiated with document analysis approach",
                        knowledge_base: analysisData.analysis_text
                    }
                  });
                }
            }
        } catch (sessionUpdateError) {
            console.error(`[aiAgents.analyzeDocuments ACTION] Failed to update session context for ${sessionId}:`, sessionUpdateError);
            // Non-critical for the analysis itself, but good to log
        }

        console.log(`[aiAgents.analyzeDocuments ACTION] Analysis successful for ${vectorStoreId}.`);
        return { success: true, data: analysisData };
      } else {
        console.error("[aiAgents.analyzeDocuments ACTION] AnalyzerAgent execution reported failure:", agentResponse.error);
        return { success: false, error: agentResponse.error || "Analyzer agent reported failure" };
      }
    } catch (error) {
      console.error("[aiAgents.analyzeDocuments ACTION] Unexpected error during analysis execution:", error);
      return { success: false, error: (error as Error).message };
    }
  }
});

// Session Planning Agent
export const planSessionFocus = action({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    folderId: v.optional(v.string()),
    userModelState: v.optional(v.any()),
    forceFocus: v.optional(v.string())
  },
  handler: async (ctx, { sessionId, userId, folderId, userModelState, forceFocus }) => {
    console.log(`[aiAgents.planSessionFocus] Starting session focus planning for session: ${sessionId}, user: ${userId}, folder: ${folderId || 'N/A'}`);
    
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId,
        folder_id: folderId
      };

      // If folder_id is provided, try to get analysis result from knowledge base
      if (folderId) {
        // Explicitly type the result to avoid circular inference
        const folderData: { knowledge_base?: string } | null = await ctx.runQuery("functions:getFolder" as any, {
          folderId: folderId as Id<'folders'>,
        });
        
        if (folderData?.knowledge_base) {
          console.log(`[aiAgents.planSessionFocus] Found knowledge base for folder: ${folderId}, length: ${folderData.knowledge_base.length}`);
          context.analysis_result = {
            analysis_text: folderData.knowledge_base,
            key_concepts: [],
            key_terms: {},
            file_names: [],
            vector_store_id: ""
          };
        } else {
          console.log(`[aiAgents.planSessionFocus] No knowledge base found for folder: ${folderId}`);
        }
      }

      // Get OpenAI API key from environment
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable.");
      }

      // Create planner agent with Convex context
      const { createPlannerAgent } = await import("./plannerAgent");
      const plannerAgent = createPlannerAgent(openaiKey, ctx);
      
      // Execute planner agent
      const plannerResponse = await plannerAgent.execute(context, {
        user_model_state: userModelState,
        force_focus: forceFocus
      });
      
      if (!plannerResponse.success || !plannerResponse.data) {
        throw new Error(`Session planning failed: ${plannerResponse.error || "Unknown error"}`);
      }
      
      const result = plannerResponse.data;

      // Update session context with focus objective
      try {
        const session = await ctx.runQuery("functions:getSession" as any, {sessionId: sessionId as any});
        if (session) {
          const currentContext = session.context_data || {};
          const updatedContext = {
            ...currentContext,
            focus_objective: result
          };
          await ctx.runMutation("functions:updateSessionContext" as any, {
            sessionId: sessionId as Id<'sessions'>,
            context: updatedContext,
          });
        }
      } catch (contextError) {
        console.error("Failed to update session context with focus objective:", contextError);
        // Non-critical, continue
      }

      console.log(`[aiAgents.planSessionFocus] Session focus planning completed successfully for session: ${sessionId}. Topic: ${result.topic}, Priority: ${result.priority}`);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Session planning failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Session Analysis Agent
export const analyzeSessionPerformance = action({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.string()),
    folderId: v.optional(v.string()),
    sessionData: v.optional(v.any())
  },
  handler: async (ctx, { sessionId, userId, folderId, sessionData }) => {
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId || "unknown",
        folder_id: folderId
      };

      const result = await analyzeSession(context, sessionId, sessionData, ctx);
      
      if (!result) {
        throw new Error("Session analysis failed to return a result");
      }

      // Save analysis summary to knowledge base. If folderId not provided, attempt to derive it from the session.
      let effectiveFolderId: string | undefined = folderId;

      if (!effectiveFolderId) {
        try {
          // Explicitly annotate type to avoid circular inference issues
          const session: { folder_id?: string } | null = await ctx.runQuery("functions:getSession" as any, {
            sessionId: sessionId as any,
          });
          if (session?.folder_id) {
            effectiveFolderId = session.folder_id;
          }
        } catch (lookupErr) {
          console.error("[analyzeSessionPerformance] Failed to lookup session for folder ID fallback", lookupErr);
        }
      }

      if (effectiveFolderId && result.textSummary) {
        // Explicitly type the result to avoid circular inference
        const folderData: { knowledge_base?: string } | null = await ctx.runQuery("functions:getFolder" as any, {
          folderId: effectiveFolderId as Id<'folders'>,
        });

        const updatedKnowledgeBase = folderData?.knowledge_base 
          ? `${folderData.knowledge_base}\n\n${result.textSummary}`
          : result.textSummary;

        await ctx.runMutation("functions:updateKnowledgeBase" as any, {
          folderId: effectiveFolderId as Id<'folders'>,
          knowledgeBase: updatedKnowledgeBase
        });
      }

      // Update session context with analysis results
      try {
        // Explicitly type the result to avoid circular inference
        const session: { context_data?: any } | null = await ctx.runQuery("functions:getSession" as any, {sessionId: sessionId as any});
        if (session) {
          const currentContext = session.context_data || {};
          const updatedContext = {
            ...currentContext,
            analysis_summary: result.textSummary,
            analysis_data: result.analysis || undefined
          };
          await ctx.runMutation("functions:updateSessionContext" as any, {
            sessionId: sessionId as Id<'sessions'>,
            context: updatedContext,
          });
        }
      } catch (contextError) {
        console.error("Failed to update session context with analysis results:", contextError);
        // Non-critical, continue
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Session analysis failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Complete Workflow - Run all agents in sequence
export const runCompleteAgentWorkflow = action({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    folderId: v.optional(v.string()),
    vectorStoreId: v.optional(v.string()),
    userModelState: v.optional(v.any()),
    forceFocus: v.optional(v.string()),
    sessionData: v.optional(v.any())
  },
  handler: async (ctx, { 
    sessionId, 
    userId, 
    folderId, 
    vectorStoreId, 
    userModelState, 
    forceFocus, 
    sessionData 
  }) => {
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId,
        folder_id: folderId,
        vector_store_id: vectorStoreId
      };

      const result = await runCompleteWorkflow(context, {
        vectorStoreId,
        userModelState,
        forceFocus,
        sessionData
      });

      // Save all results to database
      const updates: any = {};

      if (result.planningResult) {
        updates.focus_objective = JSON.stringify(result.planningResult);
      }

      if (result.sessionAnalysisResult) {
        updates.analysis_summary = result.sessionAnalysisResult.textSummary;
        if (result.sessionAnalysisResult.analysis) {
          updates.analysis_data = JSON.stringify(result.sessionAnalysisResult.analysis);
        }
      }

      // Update session context with all results
      if (Object.keys(updates).length > 0) {
        try {
          // Explicitly type the result to avoid circular inference
          const session: { context_data?: any } | null = await ctx.runQuery("functions:getSession" as any, {sessionId: sessionId as any});
          if (session) {
            const currentContext = session.context_data || {};
            const updatedContext = {
              ...currentContext,
              ...updates
            };
            await ctx.runMutation("functions:updateSessionContext" as any, {
              sessionId: sessionId as Id<'sessions'>,
              context: updatedContext,
            });
          }
        } catch (contextError) {
          console.error("Failed to update session context with workflow results:", contextError);
          // Non-critical, continue
        }
      }

      // Update knowledge base if we have folder context and results
      if (folderId) {
        let knowledgeBaseUpdates: string[] = [];

        if (result.analysisResult?.analysis_text) {
          knowledgeBaseUpdates.push(result.analysisResult.analysis_text);
        }

        if (result.sessionAnalysisResult?.textSummary) {
          knowledgeBaseUpdates.push(result.sessionAnalysisResult.textSummary);
        }

        if (knowledgeBaseUpdates.length > 0) {
          // Explicitly type the result to avoid circular inference
          const folderData: { knowledge_base?: string } | null = await ctx.runQuery("functions:getFolder" as any, {
            folderId: folderId as Id<'folders'>,
          });

          const existingKB = folderData?.knowledge_base || "";
          const newContent = knowledgeBaseUpdates.join("\n\n");
          const updatedKnowledgeBase = existingKB 
            ? `${existingKB}\n\n${newContent}`
            : newContent;

          await ctx.runMutation("functions:updateKnowledgeBase" as any, {
            folderId: folderId as Id<'folders'>,
            knowledgeBase: updatedKnowledgeBase
          });
        }
      }

      return {
        success: result.overallSuccess,
        data: {
          analysisResult: result.analysisResult,
          planningResult: result.planningResult,
          sessionAnalysisResult: result.sessionAnalysisResult,
          errors: result.errors
        }
      };
    } catch (error) {
      console.error("Complete workflow failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Agent System Status and Health Check
export const getAgentStatus = query({
  args: {},
  handler: async (ctx) => {
    try {
      const status = getAgentSystemStatus();
      const performanceMetrics = agentPerformanceMonitor.getMetrics();

      return {
        success: true,
        data: {
          ...status,
          performanceMetrics,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Run Agent System Tests - Disabled until runAgentTests is implemented
// export const runSystemTests = action({
//   args: {
//     enableDetailedLogging: v.optional(v.boolean()),
//     skipSlowTests: v.optional(v.boolean()),
//     timeout: v.optional(v.number())
//   },
//   handler: async (ctx, { enableDetailedLogging, skipSlowTests, timeout }) => {
//     try {
//       const testConfig = {
//         enableDetailedLogging: enableDetailedLogging ?? false,
//         skipSlowTests: skipSlowTests ?? true, // Skip slow tests by default in production
//         timeout: timeout ?? 10000 // 10 seconds default for production
//       };

//       const results = await runAgentTests(testConfig);

//       return {
//         success: true,
//         data: results
//       };
//     } catch (error) {
//       console.error("Agent system tests failed:", error);
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : String(error)
//       };
//     }
//   }
// });

// Performance Metrics Query
export const getPerformanceMetrics = query({
  args: {
    agentName: v.optional(v.string())
  },
  handler: async (ctx, { agentName }) => {
    try {
      const metrics = agentPerformanceMonitor.getMetrics(agentName);

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Reset Performance Metrics
export const resetPerformanceMetrics = mutation({
  args: {
    agentName: v.optional(v.string())
  },
  handler: async (ctx, { agentName }) => {
    try {
      agentPerformanceMonitor.resetMetrics(agentName);

      return {
        success: true,
        message: agentName 
          ? `Performance metrics reset for agent: ${agentName}`
          : "All performance metrics reset"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Helper function to create agent context from session data
async function createAgentContextFromSession(
  ctx: any,
  sessionId: string,
  userId: string
): Promise<AgentContext> {
  // Explicitly type the result to avoid circular inference
  const session: { 
    folder_id?: string; 
    vector_store_id?: string; 
    analysis_data?: string; 
    focus_objective?: string; 
  } | null = await ctx.runQuery("functions:getSession" as any, {
    sessionId: sessionId as any
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return {
    session_id: sessionId,
    user_id: userId,
    folder_id: session.folder_id,
    vector_store_id: session.vector_store_id,
    // Add analysis result if available in session
    analysis_result: session.analysis_data ? JSON.parse(session.analysis_data) : undefined,
    // Add focus objective if available in session
    focus_objective: session.focus_objective ? JSON.parse(session.focus_objective) : undefined
  };
} 