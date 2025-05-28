import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth } from "../auth";

// ==========================================
// REAL-TIME WHITEBOARD OBJECTS
// ==========================================

/**
 * Get all persistent whiteboard objects for a session
 */
export const getWhiteboardObjects = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Get all persistent whiteboard objects for this session
    const objects = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    return objects.map(obj => ({
      id: obj.object_id,
      ...JSON.parse(obj.object_spec),
      createdAt: obj.created_at,
      updatedAt: obj.updated_at,
    }));
  },
});

/**
 * Add persistent whiteboard object
 */
export const addWhiteboardObject = mutation({
  args: { 
    sessionId: v.id("sessions"),
    objectSpec: v.any(), // CanvasObjectSpec as JSON
  },
  handler: async (ctx, { sessionId, objectSpec }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Validate objectSpec has required fields
    if (!objectSpec.id || !objectSpec.kind) {
      throw new Error("Invalid object spec: missing id or kind");
    }
    
    // Ensure metadata.source is user for security
    if (!objectSpec.metadata) {
      objectSpec.metadata = {};
    }
    objectSpec.metadata.source = "user";
    
    // Insert the object
    const objectId = await ctx.db.insert("whiteboard_objects", {
      session_id: sessionId,
      object_id: objectSpec.id,
      object_spec: JSON.stringify(objectSpec),
      object_kind: objectSpec.kind,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    
    return { id: objectId, objectSpec };
  },
});

/**
 * Update persistent whiteboard object
 */
export const updateWhiteboardObject = mutation({
  args: { 
    sessionId: v.id("sessions"),
    objectId: v.string(),
    objectSpec: v.any(),
  },
  handler: async (ctx, { sessionId, objectId, objectSpec }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Find existing object
    const existing = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session_object", (q) => 
        q.eq("session_id", sessionId).eq("object_id", objectId)
      )
      .first();
    
    if (!existing) {
      throw new Error("Object not found");
    }
    
    // Ensure metadata.source is user for security
    if (!objectSpec.metadata) {
      objectSpec.metadata = {};
    }
    objectSpec.metadata.source = "user";
    
    // Update the object
    await ctx.db.patch(existing._id, {
      object_spec: JSON.stringify(objectSpec),
      object_kind: objectSpec.kind,
      updated_at: Date.now(),
    });
    
    return { updated: true };
  },
});

/**
 * Delete persistent whiteboard object
 */
export const deleteWhiteboardObject = mutation({
  args: { 
    sessionId: v.id("sessions"),
    objectId: v.string(),
  },
  handler: async (ctx, { sessionId, objectId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Find existing object
    const existing = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session_object", (q) => 
        q.eq("session_id", sessionId).eq("object_id", objectId)
      )
      .first();
    
    if (!existing) {
      throw new Error("Object not found");
    }
    
    // Delete the object
    await ctx.db.delete(existing._id);
    
    return { deleted: true };
  },
});

/**
 * Clear all whiteboard objects for a session
 */
export const clearWhiteboardObjects = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Get all objects for this session
    const objects = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    // Delete all objects
    for (const obj of objects) {
      await ctx.db.delete(obj._id);
    }
    
    return { cleared: objects.length };
  },
});

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

/**
 * Get board summary for a session
 */
export const getBoardSummary = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Get all persistent whiteboard objects for this session
    const objects = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    // Parse object specs and compute summary
    const by_kind: Record<string, number> = {};
    const by_owner: Record<string, number> = {};
    const learner_tags: Array<{id: string, x?: number, y?: number, meta?: any}> = [];
    const concept_bboxes: Record<string, Array<[number, number, number, number]>> = {};
    
    for (const obj of objects) {
      const spec = JSON.parse(obj.object_spec);
      const kind = spec.kind || "unknown";
      const owner = spec.metadata?.source || "unknown";
      
      by_kind[kind] = (by_kind[kind] || 0) + 1;
      by_owner[owner] = (by_owner[owner] || 0) + 1;
      
      const md = spec.metadata || {};
      const role = md.role;
      const concept = md.concept;
      
      if (role === "question_tag") {
        learner_tags.push({
          id: spec.id,
          x: spec.x,
          y: spec.y,
          meta: md,
        });
      }
      
      // Bounding box calculation for concept clusters
      if (concept && typeof spec.x === 'number' && typeof spec.y === 'number') {
        const x = spec.x;
        const y = spec.y;
        const w = spec.width || 0;
        const h = spec.height || 0;
        
        if (!concept_bboxes[concept]) {
          concept_bboxes[concept] = [];
        }
        concept_bboxes[concept].push([x, y, x + w, y + h]);
      }
    }
    
    // Merge bboxes per concept to get envelopes
    const concept_clusters = Object.entries(concept_bboxes).map(([concept, boxes]) => {
      if (boxes.length === 0) return null;
      
      const min_x = Math.min(...boxes.map(b => b[0]));
      const min_y = Math.min(...boxes.map(b => b[1]));
      const max_x = Math.max(...boxes.map(b => b[2]));
      const max_y = Math.max(...boxes.map(b => b[3]));
      
      return {
        concept,
        bbox: [min_x, min_y, max_x, max_y],
        count: boxes.length,
      };
    }).filter(Boolean);
    
    return {
      counts: {
        by_kind,
        by_owner,
      },
      learner_question_tags: learner_tags,
      concept_clusters,
      // Note: ephemeral data is handled by the minimal WebSocket server
      // and not stored in Convex, so we don't include ephemeralSummary here
    };
  },
}); 