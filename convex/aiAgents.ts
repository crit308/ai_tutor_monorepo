// Convex AI Agent Functions
// Integration layer between Convex backend and AI agent system

import { v } from "convex/values";
import { mutation, action, query } from "./_generated/server";
import { api } from "./_generated/api";
import {
  initializeAgentSystem,
  runDocumentAnalysis,
  planSession,
  analyzeSession,
  runCompleteWorkflow,
  getAgentSystemStatus,
  runAgentTests,
  agentPerformanceMonitor
} from "./agents";
import type {
  AgentContext,
  AnalysisResult,
  FocusObjective,
  SessionAnalysis,
  UserModelState
} from "./agents";

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
    sessionId: v.string(),
    userId: v.string(),
    vectorStoreId: v.string(),
    folderId: v.optional(v.string()),
    maxResults: v.optional(v.number())
  },
  handler: async (ctx, { sessionId, userId, vectorStoreId, folderId, maxResults }) => {
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId,
        folder_id: folderId,
        vector_store_id: vectorStoreId
      };

      const result = await runDocumentAnalysis(context, vectorStoreId, maxResults);
      
      if (!result) {
        throw new Error("Document analysis failed to return a result");
      }

      // Save analysis result to database
      if (folderId) {
        await ctx.runMutation(api.folderCrud.updateKnowledgeBase, {
          folderId,
          knowledgeBase: result.analysis_text
        });
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Document analysis failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
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
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId,
        folder_id: folderId
      };

      // If folder_id is provided, try to get analysis result from knowledge base
      if (folderId) {
        const folderData = await ctx.runQuery(api.folderCrud.getFolder, {
          folderId,
          userId
        });
        
        if (folderData?.knowledge_base) {
          context.analysis_result = {
            analysis_text: folderData.knowledge_base,
            key_concepts: [],
            key_terms: {},
            file_names: [],
            vector_store_id: ""
          };
        }
      }

      const result = await planSession(context, userModelState, forceFocus);
      
      if (!result) {
        throw new Error("Session planning failed to return a result");
      }

      // Update session with focus objective
      await ctx.runMutation(api.sessionCrud.updateSession, {
        sessionId,
        updates: {
          focus_objective: JSON.stringify(result)
        }
      });

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
    userId: v.string(),
    folderId: v.optional(v.string()),
    sessionData: v.optional(v.any())
  },
  handler: async (ctx, { sessionId, userId, folderId, sessionData }) => {
    try {
      const context: AgentContext = {
        session_id: sessionId,
        user_id: userId,
        folder_id: folderId
      };

      const result = await analyzeSession(context, sessionId, sessionData);
      
      if (!result) {
        throw new Error("Session analysis failed to return a result");
      }

      // Save analysis summary to knowledge base
      if (folderId && result.textSummary) {
        const folderData = await ctx.runQuery(api.folderCrud.getFolder, {
          folderId,
          userId
        });
        
        const updatedKnowledgeBase = folderData?.knowledge_base 
          ? `${folderData.knowledge_base}\n\n${result.textSummary}`
          : result.textSummary;

        await ctx.runMutation(api.folderCrud.updateKnowledgeBase, {
          folderId,
          knowledgeBase: updatedKnowledgeBase
        });
      }

      // Update session with analysis results
      await ctx.runMutation(api.sessionCrud.updateSession, {
        sessionId,
        updates: {
          analysis_summary: result.textSummary,
          analysis_data: result.analysis ? JSON.stringify(result.analysis) : undefined
        }
      });

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

      // Update session with all results
      if (Object.keys(updates).length > 0) {
        await ctx.runMutation(api.sessionCrud.updateSession, {
          sessionId,
          updates
        });
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
          const folderData = await ctx.runQuery(api.folderCrud.getFolder, {
            folderId,
            userId
          });

          const existingKB = folderData?.knowledge_base || "";
          const newContent = knowledgeBaseUpdates.join("\n\n");
          const updatedKnowledgeBase = existingKB 
            ? `${existingKB}\n\n${newContent}`
            : newContent;

          await ctx.runMutation(api.folderCrud.updateKnowledgeBase, {
            folderId,
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

// Run Agent System Tests
export const runSystemTests = action({
  args: {
    enableDetailedLogging: v.optional(v.boolean()),
    skipSlowTests: v.optional(v.boolean()),
    timeout: v.optional(v.number())
  },
  handler: async (ctx, { enableDetailedLogging, skipSlowTests, timeout }) => {
    try {
      const testConfig = {
        enableDetailedLogging: enableDetailedLogging ?? false,
        skipSlowTests: skipSlowTests ?? true, // Skip slow tests by default in production
        timeout: timeout ?? 10000 // 10 seconds default for production
      };

      const results = await runAgentTests(testConfig);

      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error("Agent system tests failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

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
  const session = await ctx.runQuery(api.sessionCrud.getSession, {
    sessionId,
    userId
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