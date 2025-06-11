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

    // Determine next snapshot index (latest + 1)
    const latest = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => q.eq("session_id", args.session_id))
      .order("desc")
      .first();

    const nextIndex = latest ? (latest as any).snapshot_index + 1 : 0;

    await ctx.db.insert("whiteboard_snapshots", {
      session_id: args.session_id,
      snapshot_index: nextIndex,
      actions_json: JSON.stringify([args.action]),
      created_at: Date.now(),
    });
  },
}); 