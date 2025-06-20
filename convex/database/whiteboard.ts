import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth } from "../auth/middleware";
import { validateWhiteboardPatch } from "../helpers/whiteboardValidation";
import type { WhiteboardPatch } from "@aitutor/whiteboard-schema";

// ==========================================
// REAL-TIME WHITEBOARD OBJECTS
// ==========================================

/**
 * Get all persistent whiteboard objects for a session
 */
export const getWhiteboardObjects = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
    }
    
    // Validate objectSpec has required fields
    if (!objectSpec.id || !objectSpec.kind) {
      throw new Error("Invalid object spec: missing id or kind");
    }
    
    // Ensure metadata.source is user for security
    if (!objectSpec.metadata) {
      objectSpec.metadata = {};
    }
    objectSpec.metadata.groupId = objectSpec.metadata.groupId ?? objectSpec.groupId ?? objectSpec.id;
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    objectSpec.metadata.groupId = objectSpec.metadata.groupId ?? objectSpec.groupId ?? objectId;
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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
    let userId: string | null = null;
    try {
      userId = await requireAuth(ctx);
    } catch (e) {
      // allow unauthenticated system/assistant calls
    }
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // If userId present, enforce ownership; if null, assume assistant context is allowed
    if (userId && session.user_id !== userId) {
      throw new Error("Access denied");
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

/**
 * Find objects on the whiteboard by metadata criteria and/or simple spatial bbox.
 * Mirrors legacy find_object_on_board behaviour but uses linear scan (no R-tree yet).
 */
export const findObjectOnBoard = query({
  args: {
    sessionId: v.id("sessions"),
    metaQuery: v.optional(v.any()), // free-form object of key/value to match in metadata
    // Bounding box: [x, y, w, h]
    spatialQuery: v.optional(v.array(v.number())),
    fields: v.optional(v.array(v.string())),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { sessionId, metaQuery, spatialQuery, fields }) => {
    // For now no auth enforcement – reuse requireAuth if needed

    // fetch all objects for session
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", q => q.eq("session_id", sessionId))
      .collect();

    const results: any[] = [];

    for (const row of rows) {
      let spec: any;
      try { spec = JSON.parse(row.object_spec); } catch { continue; }

      // --- metadata filter ---
      if (metaQuery && typeof metaQuery === "object") {
        const md = spec.metadata || {};
        let metaPass = true;
        for (const [k, v] of Object.entries(metaQuery)) {
          if (md[k] !== v) { metaPass = false; break; }
        }
        if (!metaPass) continue;
      }

      // --- spatial filter ---
      if (spatialQuery) {
        const [qx, qy, qw, qh] = spatialQuery;
        let x = spec.x, y = spec.y, w = spec.width, h = spec.height;
        if ((spec.metadata?.bbox?.length ?? 0) === 4) {
          const [bx, by, bw, bh] = spec.metadata.bbox;
          x = bx; y = by; w = bw; h = bh;
        }
        if ([x, y, w, h].some(v => typeof v !== "number")) continue; // no coords
        const intersects = x < qx + qw && x + w > qx && y < qy + qh && y + h > qy;
        if (!intersects) continue;
      }

      // --- projection ---
      if (fields && fields.length) {
        const projected: any = {};
        fields.forEach((fieldName: string) => {
          if (fieldName in spec) projected[fieldName] = spec[fieldName];
        });
        if (!("id" in projected) && spec.id) projected.id = spec.id;
        results.push(projected);
      } else {
        results.push(spec);
      }
    }

    return results;
  },
});

/**
 * Get all whiteboard actions for a session (ordered ASC by timestamp).
 * Used by the front-end to hydrate the canvas on initial load.
 */
export const getWhiteboardActions = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  // Return raw action array – each element is {action,payload,timestamp,batch_id}
  returns: v.array(
    v.object({
      action: v.any(),
      timestamp: v.number(),
      batch_id: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { sessionId, limit = 1000 }) => {
    // No auth for now (public board view) – if needed, add requireAuth check similar to others.

    const rows = await ctx.db
      .query("whiteboard_actions")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .order("asc")
      .take(limit);

    return rows.map((r) => ({ action: r.action, timestamp: r.timestamp, batch_id: r.batch_id }));
  },
});

export const addObjectsBulk = mutation({
  args: {
    sessionId: v.id("sessions"),
    objects: v.array(v.any()), // array of CanvasObjectSpec (WBObject)
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, { sessionId, objects }) => {
    // Allow unauthenticated assistant calls. Validate session existence but skip ownership check.
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    let count = 0;
    for (let objectSpec of objects) {
      if (!objectSpec.id || !objectSpec.kind) {
        throw new Error("Invalid object spec: missing id or kind");
      }

      // --- groupId hygiene ---
      if (!objectSpec.metadata) objectSpec.metadata = {};
      if (!objectSpec.metadata.groupId) {
        objectSpec.metadata.groupId = objectSpec.groupId ?? objectSpec.id;
      }
      objectSpec.metadata.source = objectSpec.metadata.source ?? "assistant";

      await ctx.db.insert("whiteboard_objects", {
        session_id: sessionId,
        object_id: objectSpec.id,
        object_spec: JSON.stringify(objectSpec),
        object_kind: objectSpec.kind,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      count += 1;
    }

    return { inserted: count };
  },
});

/**
 * Apply a semantic whiteboard patch (creates, updates, deletes) in a single transaction.
 * Increments the session.board_version counter and runs lightweight validation.
 */
export const applyWhiteboardPatch = mutation({
  args: {
    sessionId: v.id("sessions"),
    patch: v.any(), // WhiteboardPatch JSON
    lastKnownVersion: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    newBoardVersion: v.number(),
    issues: v.array(v.any()),
    summary: v.optional(v.string()),
  }),
  handler: async (ctx, { sessionId, patch, lastKnownVersion }) => {
    const userId = await requireAuth(ctx).catch(() => null);

    // ----- session & auth -----
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (userId && session.user_id !== userId) throw new Error("Access denied");

    const currentVersion = (session as any).board_version ?? 0;
    if (lastKnownVersion !== undefined && lastKnownVersion !== currentVersion) {
      throw new Error("Stale boardVersion – refresh whiteboard state before patching.");
    }

    const { creates = [], updates = [], deletes = [] } = (patch || {}) as WhiteboardPatch;

    // ----- fetch existing objects once -----
    const existingRows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    const existingObjects = existingRows.map((r) => JSON.parse(r.object_spec));

    // ----- process deletes -----
    for (const objId of deletes) {
      const row = await ctx.db
        .query("whiteboard_objects")
        .withIndex("by_session_object", (q) =>
          q.eq("session_id", sessionId).eq("object_id", objId)
        )
        .first();
      if (row) await ctx.db.delete(row._id);
    }

    // ----- process updates -----
    for (const upd of updates) {
      const row = await ctx.db
        .query("whiteboard_objects")
        .withIndex("by_session_object", (q) =>
          q.eq("session_id", sessionId).eq("object_id", upd.id)
        )
        .first();
      if (!row) continue;
      const spec = { ...JSON.parse(row.object_spec), ...upd.diff };
      await ctx.db.patch(row._id, {
        object_spec: JSON.stringify(spec),
        object_kind: spec.kind,
        updated_at: Date.now(),
      });
    }

    // ----- process creates -----
    for (const obj of creates) {
      await ctx.db.insert("whiteboard_objects", {
        session_id: sessionId,
        object_id: obj.id,
        object_spec: JSON.stringify(obj),
        object_kind: (obj as any).kind,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    // ----- validate (after applying patch) -----
    const issues = validateWhiteboardPatch(
      { creates, updates, deletes },
      existingObjects
    );

    // ----- bump version -----
    const newVersion = currentVersion + 1;
    await ctx.db.patch(session._id, { board_version: newVersion });

    const summary = `Created ${creates.length || 0}, updated ${updates.length || 0}, deleted ${deletes.length || 0}.`;

    return { success: true, newBoardVersion: newVersion, issues, summary };
  },
}); 