import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const addWhiteboardAction = mutation({
  args: {
    session_id: v.string(),
    action: v.any(),
    payload: v.any(),
    batch_id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("whiteboard_actions", {
      session_id: args.session_id,
      action: args.action,
      payload: args.payload,
      batch_id: args.batch_id,
      timestamp: Date.now(),
    });
  },
}); 