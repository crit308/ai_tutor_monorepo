import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

// --- Analytics Types ---

export interface ToolInvocationMetrics {
  toolName: string;
  latencyMs: number;
  success: boolean;
  sessionId?: string;
  userId?: string;
  agentVersion?: string;
  timestamp: number;
}

export interface TokenUsageMetrics {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  phase: "analysis" | "planning" | "generation" | "interaction";
  sessionId?: string;
  userId?: string;
  timestamp: number;
}

export interface SessionAnalytics {
  sessionId: string;
  userId: string;
  totalInteractions: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  documentsUploaded: number;
  quizAttempts: number;
  correctAnswers: number;
  sessionDuration: number;
  engagementScore: number;
  lastActivity: number;
}

export interface SystemMetrics {
  timestamp: number;
  activeUsers: number;
  activeSessions: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  systemLoad: number;
  errorRate: number;
}

// --- Tool Performance Tracking ---

export const logToolInvocation = mutation({
  args: {
    toolName: v.string(),
    latencyMs: v.number(),
    success: v.boolean(),
    sessionId: v.optional(v.id("sessions")),
    userId: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tool_metrics", {
      tool_name: args.toolName,
      latency_ms: args.latencyMs,
      success: args.success,
      session_id: args.sessionId,
      user_id: args.userId,
      agent_version: args.agentVersion || "unknown",
      timestamp: Date.now(),
    });

    // Update aggregated metrics
    await updateToolAggregates(ctx, args.toolName, args.latencyMs, args.success);
  },
});

async function updateToolAggregates(ctx: any, toolName: string, latencyMs: number, success: boolean) {
  const today = new Date().toISOString().split('T')[0];
  const aggregateKey = `${toolName}_${today}`;

  const existing = await ctx.db
    .query("tool_aggregates")
    .withIndex("by_key_date", (q: any) => 
      q.eq("aggregate_key", aggregateKey)
    )
    .first();

  if (existing) {
    const newTotalLatency = existing.total_latency_ms + latencyMs;
    const newInvocationCount = existing.total_invocations + 1;
    const newSuccessCount = existing.success_count + (success ? 1 : 0);

    await ctx.db.patch(existing._id, {
      total_invocations: newInvocationCount,
      success_count: newSuccessCount,
      total_latency_ms: newTotalLatency,
      average_latency_ms: newTotalLatency / newInvocationCount,
      updated_at: Date.now(),
    });
  } else {
    await ctx.db.insert("tool_aggregates", {
      aggregate_key: aggregateKey,
      tool_name: toolName,
      date: today,
      total_invocations: 1,
      success_count: success ? 1 : 0,
      failure_count: success ? 0 : 1,
      total_latency_ms: latencyMs,
      average_latency_ms: latencyMs,
      updated_at: Date.now(),
    });
  }
}

// --- Token Usage Tracking ---

export const logTokenUsage = mutation({
  args: {
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    phase: v.union(v.literal("analysis"), v.literal("planning"), v.literal("generation"), v.literal("interaction")),
    sessionId: v.optional(v.id("sessions")),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const totalTokens = args.promptTokens + args.completionTokens;

    await ctx.db.insert("token_usage", {
      model: args.model,
      prompt_tokens: args.promptTokens,
      completion_tokens: args.completionTokens,
      total_tokens: totalTokens,
      phase: args.phase,
      session_id: args.sessionId,
      user_id: args.userId,
      timestamp: Date.now(),
    });

    // Update daily aggregates
    await updateTokenAggregates(ctx, args.model, args.phase, totalTokens);
  },
});

async function updateTokenAggregates(ctx: any, model: string, phase: string, tokens: number) {
  const today = new Date().toISOString().split('T')[0];
  const aggregateKey = `${model}_${phase}_${today}`;

  const existing = await ctx.db
    .query("token_aggregates")
    .withIndex("by_key_date", (q: any) => 
      q.eq("aggregate_key", aggregateKey)
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      total_tokens: existing.total_tokens + tokens,
      total_requests: existing.total_requests + 1,
      average_tokens_per_request: (existing.total_tokens + tokens) / (existing.total_requests + 1),
      updated_at: Date.now(),
    });
  } else {
    await ctx.db.insert("token_aggregates", {
      aggregate_key: aggregateKey,
      model,
      phase,
      date: today,
      total_tokens: tokens,
      total_requests: 1,
      average_tokens_per_request: tokens,
      updated_at: Date.now(),
    });
  }
}

// --- Session Analytics ---

export const updateSessionAnalytics = mutation({
  args: {
    sessionId: v.id("sessions"),
    analyticsUpdate: v.object({
      interactionCount: v.optional(v.number()),
      tokensUsed: v.optional(v.number()),
      responseTime: v.optional(v.number()),
      documentsUploaded: v.optional(v.number()),
      quizAttempts: v.optional(v.number()),
      correctAnswers: v.optional(v.number()),
      engagementScore: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new ConvexError("Session not found");
    }

    const currentAnalytics = session.analytics || {};
    const updates = args.analyticsUpdate;

    const newAnalytics = {
      totalInteractions: (currentAnalytics.totalInteractions || 0) + (updates.interactionCount || 0),
      totalTokensUsed: (currentAnalytics.totalTokensUsed || 0) + (updates.tokensUsed || 0),
      documentsUploaded: Math.max(currentAnalytics.documentsUploaded || 0, updates.documentsUploaded || 0),
      quizAttempts: (currentAnalytics.quizAttempts || 0) + (updates.quizAttempts || 0),
      correctAnswers: (currentAnalytics.correctAnswers || 0) + (updates.correctAnswers || 0),
      sessionDuration: Date.now() - session.created_at,
      engagementScore: updates.engagementScore || currentAnalytics.engagementScore || 0,
      lastActivity: Date.now(),
      averageResponseTime: currentAnalytics.averageResponseTime || 0,
    };

    // Calculate average response time
    if (updates.responseTime) {
      const currentAverage = currentAnalytics.averageResponseTime || 0;
      const currentCount = currentAnalytics.totalInteractions || 0;
      newAnalytics.averageResponseTime = 
        (currentAverage * currentCount + updates.responseTime) / (currentCount + 1);
    }

    await ctx.db.patch(args.sessionId, {
      analytics: newAnalytics,
      updated_at: Date.now(),
    });

    return newAnalytics;
  },
});

export const getSessionAnalytics = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args): Promise<SessionAnalytics | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return null;
    }

    const analytics = session.analytics || {};
    
    return {
      sessionId: args.sessionId,
      userId: session.user_id,
      totalInteractions: analytics.totalInteractions || 0,
      totalTokensUsed: analytics.totalTokensUsed || 0,
      averageResponseTime: analytics.averageResponseTime || 0,
      documentsUploaded: analytics.documentsUploaded || 0,
      quizAttempts: analytics.quizAttempts || 0,
      correctAnswers: analytics.correctAnswers || 0,
      sessionDuration: analytics.sessionDuration || 0,
      engagementScore: analytics.engagementScore || 0,
      lastActivity: analytics.lastActivity || session.updated_at,
    };
  },
});

// --- User Analytics ---

export const getUserAnalytics = query({
  args: {
    userId: v.string(),
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
      endTime: Date.now(),
    };

    // Get user sessions in time range
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q: any) => q.eq("user_id", args.userId))
      .filter((q) => 
        q.and(
          q.gte(q.field("created_at"), timeRange.startTime),
          q.lte(q.field("created_at"), timeRange.endTime)
        )
      )
      .collect();

    // Aggregate analytics across sessions
    let totalInteractions = 0;
    let totalTokensUsed = 0;
    let totalSessionTime = 0;
    let totalQuizAttempts = 0;
    let totalCorrectAnswers = 0;
    let totalDocumentsUploaded = 0;

    sessions.forEach(session => {
      const analytics = session.analytics || {};
      totalInteractions += analytics.totalInteractions || 0;
      totalTokensUsed += analytics.totalTokensUsed || 0;
      totalSessionTime += analytics.sessionDuration || 0;
      totalQuizAttempts += analytics.quizAttempts || 0;
      totalCorrectAnswers += analytics.correctAnswers || 0;
      totalDocumentsUploaded += analytics.documentsUploaded || 0;
    });

    return {
      userId: args.userId,
      timeRange,
      totalSessions: sessions.length,
      totalInteractions,
      totalTokensUsed,
      totalSessionTime,
      totalQuizAttempts,
      totalCorrectAnswers,
      totalDocumentsUploaded,
      averageSessionTime: sessions.length > 0 ? totalSessionTime / sessions.length : 0,
      quizAccuracy: totalQuizAttempts > 0 ? (totalCorrectAnswers / totalQuizAttempts) * 100 : 0,
    };
  },
});

// --- System-wide Analytics ---

export const getSystemMetrics = query({
  args: {
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<SystemMetrics> => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (60 * 60 * 1000), // Last hour
      endTime: Date.now(),
    };

    // Get active sessions
    const activeSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.gt(q.field("updated_at"), timeRange.startTime))
      .collect();

    // Get unique active users
    const activeUserIds = new Set(activeSessions.map(s => s.user_id));

    // Get token usage in time range
    const tokenUsage = await ctx.db
      .query("token_usage")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), timeRange.startTime),
          q.lte(q.field("timestamp"), timeRange.endTime)
        )
      )
      .collect();

    const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.total_tokens, 0);

    // Get tool metrics for response time and error rate
    const toolMetrics = await ctx.db
      .query("tool_metrics")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), timeRange.startTime),
          q.lte(q.field("timestamp"), timeRange.endTime)
        )
      )
      .collect();

    const averageResponseTime = toolMetrics.length > 0
      ? toolMetrics.reduce((sum, metric) => sum + metric.latency_ms, 0) / toolMetrics.length
      : 0;

    const errorCount = toolMetrics.filter(metric => !metric.success).length;
    const errorRate = toolMetrics.length > 0 ? (errorCount / toolMetrics.length) * 100 : 0;

    return {
      timestamp: Date.now(),
      activeUsers: activeUserIds.size,
      activeSessions: activeSessions.length,
      totalTokensUsed: totalTokens,
      averageResponseTime,
      systemLoad: calculateSystemLoad(activeSessions.length),
      errorRate,
    };
  },
});

function calculateSystemLoad(activeSessions: number): number {
  // Simple system load calculation based on active sessions
  // Could be enhanced with more sophisticated metrics
  if (activeSessions < 10) return 0.1;
  if (activeSessions < 50) return 0.3;
  if (activeSessions < 100) return 0.6;
  if (activeSessions < 200) return 0.8;
  return 1.0;
}

// --- Analytics Dashboard Queries ---

export const getDashboardMetrics = query({
  args: {
    period: v.optional(v.union(v.literal("hour"), v.literal("day"), v.literal("week"), v.literal("month"))),
  },
  handler: async (ctx, args) => {
    const period = args.period || "day";
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[period];

    const endTime = Date.now();
    const startTime = endTime - periodMs;

    // Get sessions created in period
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.gte(q.field("created_at"), startTime),
          q.lte(q.field("created_at"), endTime)
        )
      )
      .collect();

    // Get tool invocations
    const toolMetrics = await ctx.db
      .query("tool_metrics")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), startTime),
          q.lte(q.field("timestamp"), endTime)
        )
      )
      .collect();

    // Get token usage
    const tokenUsage = await ctx.db
      .query("token_usage")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), startTime),
          q.lte(q.field("timestamp"), endTime)
        )
      )
      .collect();

    return {
      period,
      totalSessions: sessions.length,
      uniqueUsers: new Set(sessions.map(s => s.user_id)).size,
      totalInteractions: toolMetrics.length,
      successfulInteractions: toolMetrics.filter(m => m.success).length,
      totalTokensUsed: tokenUsage.reduce((sum, usage) => sum + usage.total_tokens, 0),
      averageResponseTime: toolMetrics.length > 0 
        ? toolMetrics.reduce((sum, m) => sum + m.latency_ms, 0) / toolMetrics.length 
        : 0,
      topTools: getTopTools(toolMetrics),
      tokenUsageByModel: getTokenUsageByModel(tokenUsage),
    };
  },
});

function getTopTools(toolMetrics: any[]): Array<{ toolName: string; count: number; averageLatency: number }> {
  const toolStats = new Map<string, { count: number; totalLatency: number }>();
  
  toolMetrics.forEach(metric => {
    const current = toolStats.get(metric.tool_name) || { count: 0, totalLatency: 0 };
    toolStats.set(metric.tool_name, {
      count: current.count + 1,
      totalLatency: current.totalLatency + metric.latency_ms,
    });
  });

  return Array.from(toolStats.entries())
    .map(([toolName, stats]) => ({
      toolName,
      count: stats.count,
      averageLatency: stats.totalLatency / stats.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getTokenUsageByModel(tokenUsage: any[]): Array<{ model: string; totalTokens: number; requestCount: number }> {
  const modelStats = new Map<string, { totalTokens: number; requestCount: number }>();
  
  tokenUsage.forEach(usage => {
    const current = modelStats.get(usage.model) || { totalTokens: 0, requestCount: 0 };
    modelStats.set(usage.model, {
      totalTokens: current.totalTokens + usage.total_tokens,
      requestCount: current.requestCount + 1,
    });
  });

  return Array.from(modelStats.entries())
    .map(([model, stats]) => ({
      model,
      totalTokens: stats.totalTokens,
      requestCount: stats.requestCount,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

// --- Real-time Analytics ---

export const logRealtimeEvent = mutation({
  args: {
    eventType: v.string(),
    eventData: v.any(),
    sessionId: v.optional(v.id("sessions")),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("realtime_events", {
      event_type: args.eventType,
      event_data: args.eventData,
      session_id: args.sessionId,
      user_id: args.userId,
      timestamp: Date.now(),
    });
  },
});

export const getRealtimeEvents = query({
  args: {
    eventTypes: v.optional(v.array(v.string())),
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (5 * 60 * 1000), // Last 5 minutes
      endTime: Date.now(),
    };

    let query = ctx.db
      .query("realtime_events")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), timeRange.startTime),
          q.lte(q.field("timestamp"), timeRange.endTime)
        )
      )
      .order("desc");

    const events = await query.take(args.limit || 100);

    if (args.eventTypes && args.eventTypes.length > 0) {
      return events.filter(event => args.eventTypes!.includes(event.event_type));
    }

    return events;
  },
});

// --- Error Tracking ---

export const logError = mutation({
  args: {
    errorType: v.string(),
    errorMessage: v.string(),
    sessionId: v.optional(v.id("sessions")),
    userId: v.optional(v.string()),
    stackTrace: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("error_logs", {
      error_type: args.errorType,
      error_message: args.errorMessage,
      session_id: args.sessionId,
      user_id: args.userId,
      timestamp: Date.now(),
      stack_trace: args.stackTrace,
      metadata: args.metadata,
    });
  },
});

export const getErrorMetrics = query({
  args: {
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
      endTime: Date.now(),
    };

    const errors = await ctx.db
      .query("error_logs")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), timeRange.startTime),
          q.lte(q.field("timestamp"), timeRange.endTime)
        )
      )
      .collect();

    const errorsByType = new Map<string, number>();
    errors.forEach(error => {
      errorsByType.set(error.error_type, (errorsByType.get(error.error_type) || 0) + 1);
    });

    return {
      totalErrors: errors.length,
      errorsByType: Array.from(errorsByType.entries()).map(([type, count]) => ({ type, count })),
      recentErrors: errors.slice(0, 10).map(error => ({
        type: error.error_type,
        message: error.error_message,
        timestamp: error.timestamp,
        sessionId: error.session_id,
      })),
    };
  },
});

/**
 * Insert interaction log entry
 */
export const insertInteractionLog = mutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    contentType: v.optional(v.string()),
    interactionType: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const logId = await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: args.userId,
      role: args.role,
      content: args.content,
      content_type: args.contentType || "text",
      interaction_type: args.interactionType || "chat",
      timestamp: Date.now(),
      created_at: Date.now(),
    });
    
    return { id: logId };
  },
}); 