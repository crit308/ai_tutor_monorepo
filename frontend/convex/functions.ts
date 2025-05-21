import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Example query function
export const hello = query({
  args: {},
  handler: async (ctx) => {
    return "Hello from Convex!";
  },
});

export const logInteraction = mutation({
  args: {
    session_id: v.string(),
    user_id: v.string(),
    role: v.string(),
    content: v.string(),
    content_type: v.string(),
    event_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("interaction_logs", {
      session_id: args.session_id,
      user_id: args.user_id,
      role: args.role,
      content: args.content,
      content_type: args.content_type,
      event_type: args.event_type,
      created_at: Date.now(),
    });
  },
});
