import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Types for the complex endpoints
export interface DocumentUploadResponse {
  vector_store_id: string | null;
  files_received: string[];
  analysis_status: "pending" | "completed" | "failed" | "timeout";
  messages: string[];
}

export interface AnalysisResponse {
  has_analysis: boolean;
  analysis: any | null;
  session_id: string;
}

export interface MiniQuizLogData {
  question: string;
  selectedOption: string;
  correctOption: string;
  isCorrect: boolean;
  relatedSection?: string;
  topic?: string;
}

export interface UserSummaryLogData {
  section: string;
  topic: string;
  summary: string;
}

// --- Document Upload and Processing ---
export const uploadSessionDocuments = mutation({
  args: {
    sessionId: v.id("sessions"),
    files: v.array(v.object({
      filename: v.string(),
      content: v.string(), // Base64 encoded content
      mimeType: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<DocumentUploadResponse> => {
    // Get session context
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    const response: DocumentUploadResponse = {
      vector_store_id: null,
      files_received: args.files.map(f => f.filename),
      analysis_status: "pending",
      messages: [],
    };

    try {
      // Process each file
      for (const file of args.files) {
        try {
          // Store file metadata in uploaded_files table
          await ctx.db.insert("uploaded_files", {
            session_id: args.sessionId,
            filename: file.filename,
            mime_type: file.mimeType,
            supabase_path: `uploads/${args.sessionId}/${file.filename}`,
            user_id: session.user_id,
            folder_id: session.folder_id || "default",
            embedding_status: "pending",
            created_at: Date.now(),
            updated_at: Date.now(),
          });

          response.messages.push(`${file.filename} processed successfully.`);
          
          // Simulate vector store creation/update
          if (!response.vector_store_id) {
            response.vector_store_id = `vs_${Date.now()}`;
          }
        } catch (error) {
          response.messages.push(`Failed to process ${file.filename}: ${error}`);
          response.analysis_status = "failed";
          return response;
        }
      }

      // Update session with vector store info
      const updatedContext = {
        ...(session.context_data || {}),
        uploaded_file_paths: [
          ...((session.context_data?.uploaded_file_paths || [])),
          ...args.files.map(f => f.filename),
        ],
        vector_store_id: response.vector_store_id,
      };

      await ctx.db.patch(args.sessionId, {
        context_data: updatedContext,
        updated_at: Date.now(),
      });

      response.analysis_status = "completed";
      response.messages.push("Document upload completed successfully.");

    } catch (error) {
      response.analysis_status = "failed";
      response.messages.push(`Upload process failed: ${error}`);
    }

    return response;
  },
});

// --- Get Document Analysis Results ---
export const getSessionAnalysisResults = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args): Promise<AnalysisResponse> => {
    const session = await ctx.db.get(args.sessionId);
    
    if (!session) {
      throw new Error("Session not found");
    }

    const analysisResult = session.context_data?.analysis_result;
    
    return {
      has_analysis: !!analysisResult,
      analysis: analysisResult || null,
      session_id: args.sessionId,
    };
  },
});

// --- Get Session Lesson Content ---
export const getSessionLessonContent = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    if (!session) {
      throw new Error("Session not found");
    }

    return session.context_data?.lesson_content || null;
  },
});

// --- Get Session Quiz ---
export const getSessionQuiz = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    if (!session) {
      throw new Error("Session not found");
    }

    return session.context_data?.quiz || null;
  },
});

// --- Log Mini-Quiz Event ---
export const logMiniQuizEvent = mutation({
  args: {
    sessionId: v.id("sessions"),
    attemptData: v.object({
      question: v.string(),
      selectedOption: v.string(),
      correctOption: v.string(),
      isCorrect: v.boolean(),
      relatedSection: v.optional(v.string()),
      topic: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    if (!session) {
      throw new Error("Session not found");
    }

    // Log the mini-quiz attempt
    await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: session.user_id,
      role: "user",
      content: `Mini-quiz attempt: ${args.attemptData.question}`,
      content_type: "quiz_attempt",
      interaction_type: "mini_quiz_attempt",
      timestamp: Date.now(),
      created_at: Date.now(),
      data: {
        question: args.attemptData.question,
        selected_option: args.attemptData.selectedOption,
        correct_option: args.attemptData.correctOption,
        is_correct: args.attemptData.isCorrect,
        related_section: args.attemptData.relatedSection,
        topic: args.attemptData.topic,
      },
    });

    // Update session analytics
    const currentStats = session.context_data?.quiz_stats || {
      total_attempts: 0,
      correct_answers: 0,
      topics_covered: [],
    };

    const updatedContext = {
      ...(session.context_data || {}),
      quiz_stats: {
        total_attempts: currentStats.total_attempts + 1,
        correct_answers: currentStats.correct_answers + (args.attemptData.isCorrect ? 1 : 0),
        topics_covered: args.attemptData.topic 
          ? [...new Set([...currentStats.topics_covered, args.attemptData.topic])]
          : currentStats.topics_covered,
      },
    };

    await ctx.db.patch(args.sessionId, {
      context_data: updatedContext,
      updated_at: Date.now(),
    });
  },
});

// --- Log User Summary Event ---
export const logUserSummaryEvent = mutation({
  args: {
    sessionId: v.id("sessions"),
    summaryData: v.object({
      section: v.string(),
      topic: v.string(),
      summary: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    if (!session) {
      throw new Error("Session not found");
    }

    // Log the user summary attempt
    await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: session.user_id,
      role: "user",
      content: `User summary: ${args.summaryData.summary}`,
      content_type: "user_summary",
      interaction_type: "user_summary",
      timestamp: Date.now(),
      created_at: Date.now(),
      data: {
        section: args.summaryData.section,
        topic: args.summaryData.topic,
        summary: args.summaryData.summary,
      },
    });

    // Update session context with summary tracking
    const currentSummaries = session.context_data?.user_summaries || [];
    
    const updatedContext = {
      ...(session.context_data || {}),
      user_summaries: [
        ...currentSummaries,
        {
          section: args.summaryData.section,
          topic: args.summaryData.topic,
          summary: args.summaryData.summary,
          timestamp: Date.now(),
        },
      ],
    };

    await ctx.db.patch(args.sessionId, {
      context_data: updatedContext,
      updated_at: Date.now(),
    });
  },
});

// --- Quiz Generation Endpoint ---
export const generateSessionQuiz = mutation({
  args: {
    sessionId: v.id("sessions"),
    topic: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    questionCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    try {
      // Generate a simple quiz (in a real implementation, this would use AI)
      const quiz = {
        questions: [
          {
            question: `Sample question about ${args.topic || "the topic"}`,
            options: ["Option A", "Option B", "Option C", "Option D"],
            correct_answer: 0,
            difficulty: args.difficulty || "medium",
          },
        ],
        metadata: {
          topic: args.topic,
          difficulty: args.difficulty || "medium",
          question_count: args.questionCount || 1,
          generated_at: Date.now(),
        },
      };

      // Update session context with generated quiz
      const updatedContext = {
        ...(session.context_data || {}),
        quiz,
        quiz_generated_at: Date.now(),
      };

      await ctx.db.patch(args.sessionId, {
        context_data: updatedContext,
        updated_at: Date.now(),
      });

      return quiz;
    } catch (error) {
      throw new Error(`Failed to generate quiz: ${error}`);
    }
  },
});

// --- Batch Analytics Processing ---
export const processSessionAnalytics = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    // Get all interaction logs for this session
    const logs = await ctx.db
      .query("interaction_logs")
      .withIndex("by_session", (q) => q.eq("session_id", args.sessionId))
      .collect();

    // Process analytics
    const analytics = {
      total_interactions: logs.length,
      quiz_attempts: logs.filter(log => log.interaction_type === "mini_quiz_attempt").length,
      summaries_created: logs.filter(log => log.interaction_type === "user_summary").length,
      session_duration: session.updated_at - session.created_at,
      engagement_score: calculateEngagementScore(logs),
    };

    // Update session with analytics
    const updatedContext = {
      ...(session.context_data || {}),
      analytics,
      analytics_processed_at: Date.now(),
    };

    await ctx.db.patch(args.sessionId, {
      context_data: updatedContext,
      analytics,
      updated_at: Date.now(),
    });

    return analytics;
  },
});

// Helper function to calculate engagement score
function calculateEngagementScore(logs: any[]): number {
  let score = 0;
  
  // Base score from number of interactions
  score += logs.length * 10;
  
  // Bonus for quiz attempts
  const quizAttempts = logs.filter(log => log.interaction_type === "mini_quiz_attempt");
  score += quizAttempts.length * 15;
  
  // Bonus for correct answers
  const correctAnswers = quizAttempts.filter(log => log.data?.is_correct);
  score += correctAnswers.length * 20;
  
  // Bonus for user summaries
  const summaries = logs.filter(log => log.interaction_type === "user_summary");
  score += summaries.length * 25;
  
  // Normalize to 0-100 scale
  return Math.min(100, score / 10);
}

// Helper function to get interaction logs for a session
export const getInteractionLogs = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interaction_logs")
      .withIndex("by_session", (q) => q.eq("session_id", args.sessionId))
      .collect();
  },
});

// Helper function to get a session
export const getSession = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
}); 