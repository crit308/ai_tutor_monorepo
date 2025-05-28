import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth } from "../auth";

// ==========================================
// WHITEBOARD SNAPSHOT OPERATIONS
// ==========================================

/**
 * Insert whiteboard snapshot
 */
export const insertSnapshot = mutation({
  args: {
    sessionId: v.id("sessions"),
    snapshotIndex: v.number(),
    actionsJson: v.string(),
  },
  handler: async (ctx, { sessionId, snapshotIndex, actionsJson }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Check if snapshot already exists
    const existing = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => 
        q.eq("session_id", sessionId).eq("snapshot_index", snapshotIndex)
      )
      .first();
    
    if (existing) {
      // Update existing snapshot
      await ctx.db.patch(existing._id, {
        actions_json: actionsJson,
      });
      return { id: existing._id, updated: true };
    } else {
      // Create new snapshot
      const snapshotId = await ctx.db.insert("whiteboard_snapshots", {
        session_id: sessionId,
        snapshot_index: snapshotIndex,
        actions_json: actionsJson,
        created_at: Date.now(),
      });
      return { id: snapshotId, updated: false };
    }
  },
});

/**
 * Get whiteboard snapshots for a session
 */
export const getWhiteboardSnapshots = query({
  args: {
    sessionId: v.id("sessions"),
    maxIndex: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, maxIndex, limit = 100 }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    let query = ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => q.eq("session_id", sessionId));
    
    if (maxIndex !== undefined) {
      query = query.filter((q) => q.lte(q.field("snapshot_index"), maxIndex));
    }
    
    const snapshots = await query
      .order("asc")
      .take(limit);
    
    return snapshots;
  },
});

/**
 * Get latest whiteboard snapshot index
 */
export const getLatestSnapshotIndex = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    const latestSnapshot = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => q.eq("session_id", sessionId))
      .order("desc")
      .first();
    
    return latestSnapshot ? latestSnapshot.snapshot_index : -1;
  },
});

/**
 * Delete whiteboard snapshots for a session
 */
export const deleteSessionSnapshots = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    const snapshots = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => q.eq("session_id", sessionId))
      .collect();
    
    let deletedCount = 0;
    for (const snapshot of snapshots) {
      await ctx.db.delete(snapshot._id);
      deletedCount++;
    }
    
    return { deletedCount };
  },
}); 