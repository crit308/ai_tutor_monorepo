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

// Timeout wrapper utility for Convex actions
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