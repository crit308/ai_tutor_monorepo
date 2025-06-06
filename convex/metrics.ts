import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const logSkillCall = mutation({
  args: {
    skill: v.string(),
    content_type: v.optional(v.string()),
    batch_id: v.string(),
    session_id: v.string(),
    elapsed_ms: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      content_type: args.content_type,
      batch_id: args.batch_id,
      session_id: args.session_id,
      timestamp: Date.now(),
      status: "started",
    });
  },
});

export const logSkillSuccess = mutation({
  args: {
    skill: v.string(),
    elapsed_ms: v.number(),
    batch_id: v.string(),
    session_id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      batch_id: args.batch_id,
      session_id: args.session_id,
      elapsed_ms: args.elapsed_ms,
      timestamp: Date.now(),
      status: "success",
    });
  },
});

export const logSkillError = mutation({
  args: {
    skill: v.string(),
    elapsed_ms: v.number(),
    error: v.string(),
    batch_id: v.string(),
    session_id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      batch_id: args.batch_id,
      session_id: args.session_id,
      elapsed_ms: args.elapsed_ms,
      error: args.error,
      timestamp: Date.now(),
      status: "error",
    });
  },
});

// Query to get active skill count for MVP validation
export const getActiveSkillCount = query({
  args: {},
  returns: v.object({
    total_skills: v.number(),
    whiteboard_skills: v.number(),
    skill_list: v.array(v.string()),
  }),
  handler: async (ctx) => {
    // Get distinct skills used in last 7 days
    const recentSkills = await ctx.db
      .query("skill_metrics")
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 7 * 24 * 60 * 60 * 1000))
      .collect();
    
    const activeSkills = new Set(recentSkills.map(m => m.skill));
    const whiteboardSkills = Array.from(activeSkills).filter(skill => 
      ['create_educational_content', 'batch_whiteboard_operations', 
       'modify_whiteboard_objects', 'clear_whiteboard'].includes(skill)
    );
    
    return {
      total_skills: activeSkills.size,
      whiteboard_skills: whiteboardSkills.length,
      skill_list: Array.from(activeSkills)
    };
  },
});

// Batch efficiency tracking for MVP validation
export const logBatchEfficiency = mutation({
  args: {
    batch_id: v.string(),
    operations_count: v.number(),
    actions_created: v.number(),
    websocket_reduction: v.number(),
    session_id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("batch_efficiency", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

// Migration log table for tracking cleanup activities
export const logMigrationActivity = mutation({
  args: {
    action: v.string(),
    details: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("migration_log", {
      action: args.action,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

// Enhanced timeout wrapper utility for Convex actions
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Utility to handle timeout errors gracefully
export function handleTimeoutError(elapsed_ms: number, timeoutMs: number = 5000) {
  if (elapsed_ms > timeoutMs) {
    return {
      payload: {
        message_text: "Drawing is taking longer than expected, please try again.",
        message_type: "error"
      },
      actions: []
    };
  }
  return null;
}

// Performance monitoring query
export const getPerformanceMetrics = query({
  args: {
    skill: v.optional(v.string()),
    time_range_hours: v.optional(v.number()),
  },
  returns: v.object({
    total_calls: v.number(),
    success_rate: v.number(),
    average_latency_ms: v.number(),
    p95_latency_ms: v.number(),
    timeout_count: v.number(),
  }),
  handler: async (ctx, args) => {
    const timeRangeMs = (args.time_range_hours || 24) * 60 * 60 * 1000;
    const cutoffTime = Date.now() - timeRangeMs;
    
    let query = ctx.db
      .query("skill_metrics")
      .filter(q => q.gte(q.field("timestamp"), cutoffTime));
    
    if (args.skill) {
      query = query.filter(q => q.eq(q.field("skill"), args.skill));
    }
    
    const metrics = await query.collect();
    
    const successMetrics = metrics.filter(m => m.status === "success" && m.elapsed_ms);
    const errorMetrics = metrics.filter(m => m.status === "error");
    const timeoutMetrics = errorMetrics.filter(m => 
      m.error?.includes("timeout") || (m.elapsed_ms && m.elapsed_ms > 5000)
    );
    
    const latencies = successMetrics.map(m => m.elapsed_ms!).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length 
      : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies.length > 0 ? latencies[p95Index] || 0 : 0;
    
    return {
      total_calls: metrics.length,
      success_rate: metrics.length > 0 ? successMetrics.length / metrics.length : 0,
      average_latency_ms: Math.round(avgLatency),
      p95_latency_ms: p95Latency,
      timeout_count: timeoutMetrics.length,
    };
  },
}); 