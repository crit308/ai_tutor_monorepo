import { query, mutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth } from "../auth/middleware";
import { 
  WBObject, 
  WBLine,
  WBArrow,
  WhiteboardPatch, 
  WhiteboardAction, 
  ValidationIssue,
  updateElementVersion,
  updateBoundArrows,
  getConnectionPoint,
  isBindableElement,
  isLinearElement,
  generateCurvedArrowPath
} from "../../packages/whiteboard-schema";

// ==========================================
// REAL-TIME WHITEBOARD OBJECTS
// ==========================================

/**
 * Get all persistent whiteboard objects for a session
 */
export const getWhiteboardObjects = query({
  args: { sessionId: v.id("sessions"), boardId: v.optional(v.number()) },
  handler: async (ctx, { sessionId, boardId }) => {
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
    let objects = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    // Filter by board_id if provided (legacy rows have board_id undefined → treated as 0)
    if (boardId !== undefined) {
      objects = objects.filter((o: any) => (o.board_id ?? 0) === boardId);
    }
    
    return objects.map(obj => {
      const spec = JSON.parse(obj.object_spec);
      
      // Add version if missing (for backward compatibility)
      if (!spec.version) {
        spec.version = 1;
      }
      
      // Ensure metadata structure
      if (!spec.metadata) {
        spec.metadata = {};
      }
      if (!spec.metadata.groupId) {
        spec.metadata.groupId = obj.object_id;
      }
      if (!spec.metadata.source) {
        spec.metadata.source = 'ai';
      }
      
      // Handle coordinate system migration
      if (obj.object_kind === 'line' || obj.object_kind === 'arrow') {
        // For line/arrow objects with points array
        if (spec.points && Array.isArray(spec.points)) {
          // Check if points are absolute coordinates (old system)
          if (spec.points.length >= 4 && typeof spec.points[0] === 'number') {
        const [x1, y1, x2, y2] = spec.points;
            
            // Convert to new system: element position + relative points
        return {
          id: obj.object_id,
          ...spec,
              x: x1,                              // Element position at first point
          y: y1,
              points: [[0, 0], [x2 - x1, y2 - y1]], // Points relative to element position
              createdAt: obj.created_at,
              updatedAt: obj.updated_at,
            };
          } else if (spec.points.length >= 2 && Array.isArray(spec.points[0])) {
            // Already in new format with tuple points
            return {
              id: obj.object_id,
              ...spec,
              x: spec.x || 0,                    // Use element position from spec
              y: spec.y || 0,
              points: spec.points,               // Keep relative points as-is
          createdAt: obj.created_at,
          updatedAt: obj.updated_at,
        };
          }
      }
      
        // Fallback for lines without proper points
      return {
        id: obj.object_id,
        ...spec,
          x: spec.x || 0,
          y: spec.y || 0,
          points: spec.points || [[0, 0], [100, 0]], // Default horizontal line
          createdAt: obj.created_at,
          updatedAt: obj.updated_at,
        };
      }
      
      // Default handling for all other object types (rect, ellipse, text, etc.)
      return {
        id: obj.object_id,
        ...spec,
        x: spec.x || 0,                         // Ensure x,y are present
        y: spec.y || 0,
        createdAt: obj.created_at,
        updatedAt: obj.updated_at,
      };
    });
  },
});

/**
 * Internal version of getWhiteboardObjects for use by actions/skills
 */
export const getWhiteboardObjectsInternal = internalQuery({
  args: { 
    sessionId: v.id("sessions"),
    userId: v.union(v.string(), v.null()),
    boardId: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, userId, boardId }) => {
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
    let objects = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    if (boardId !== undefined) {
      objects = objects.filter((o: any) => (o.board_id ?? 0) === boardId);
    }
    
    return objects.map(obj => {
      const spec = JSON.parse(obj.object_spec);
      
      // Add version if missing (for backward compatibility)
      if (!spec.version) {
        spec.version = 1;
      }
      
      // Ensure metadata structure
      if (!spec.metadata) {
        spec.metadata = {};
      }
      if (!spec.metadata.groupId) {
        spec.metadata.groupId = obj.object_id;
      }
      if (!spec.metadata.source) {
        spec.metadata.source = 'ai';
      }
      
      // Handle coordinate system migration
      if (obj.object_kind === 'line' || obj.object_kind === 'arrow') {
        // For line/arrow objects with points array
        if (spec.points && Array.isArray(spec.points)) {
          // Check if points are absolute coordinates (old system)
          if (spec.points.length >= 4 && typeof spec.points[0] === 'number') {
        const [x1, y1, x2, y2] = spec.points;
            
            // Convert to new relative coordinate system
            spec.x = x1;
            spec.y = y1;
            spec.points = [[0, 0], [x2 - x1, y2 - y1]];
          }
        }
        
        // Return line/arrow with normalized structure
        return {
          id: obj.object_id,
          ...spec,
          x: spec.x || 0,
          y: spec.y || 0,
          points: spec.points || [[0, 0], [100, 0]], // Default horizontal line
          createdAt: obj.created_at,
          updatedAt: obj.updated_at,
        };
      }
      
      // Default handling for all other object types (rect, ellipse, text, etc.)
      return {
        id: obj.object_id,
        ...spec,
        x: spec.x || 0,                         // Ensure x,y are present
        y: spec.y || 0,
        createdAt: obj.created_at,
        updatedAt: obj.updated_at,
      };
    });
  },
});

/**
 * Add persistent whiteboard object
 */
export const addWhiteboardObject = mutation({
  args: { 
    sessionId: v.id("sessions"),
    objectSpec: v.any(), // CanvasObjectSpec as JSON
    boardId: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, objectSpec, boardId }) => {
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

    // --- Additional validation for widget objects ---
    if (objectSpec.kind === "widget") {
      const entry = (objectSpec as any).entry as string | undefined;
      if (!entry) {
        throw new Error("Widget object must include 'entry' directory name");
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(entry)) {
        throw new Error("Widget entry must use alphanumeric, hyphen or underscore characters (no spaces)");
      }

      // Verify widget code exists in overlay table (client component)
      const clientTsx = `app/widgets/${entry}/client.tsx`;
      const clientJs  = `app/widgets/${entry}/client.js`;
      const widgetFileTsx = await ctx.db
        .query("code_overlays")
        .withIndex("by_project_path", (q: any) => q.eq("project_id", sessionId).eq("path", clientTsx))
        .unique();
      const widgetFileJs = await ctx.db
        .query("code_overlays")
        .withIndex("by_project_path", (q: any) => q.eq("project_id", sessionId).eq("path", clientJs))
        .unique();

      if (!widgetFileTsx && !widgetFileJs) {
        throw new Error(`Widget '${entry}' has no client code. Create '${clientJs}' or '${clientTsx}' via overlay first.`);
      }
    }

    // Enforce size cap (≤100 kB JSON)
    const jsonStr = JSON.stringify(objectSpec);
    if (jsonStr.length > 100 * 1024) {
      throw new Error("Object spec exceeds 100 kB limit");
    }

    // Initialise version if absent
    objectSpec.version = objectSpec.version ?? 1;
    
    // Ensure metadata.source is user for security
    if (!objectSpec.metadata) {
      objectSpec.metadata = {};
    }
    objectSpec.metadata.groupId = objectSpec.metadata.groupId ?? objectSpec.groupId ?? objectSpec.id;
    objectSpec.metadata.source = "user";
    
    // Insert the object
    const objectId = await ctx.db.insert("whiteboard_objects", {
      session_id: sessionId,
      board_id: boardId ?? 0,
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
    
    // Enforce version conflict handling
    const currentSpec = JSON.parse(existing.object_spec);
    const incomingVersion = objectSpec.version ?? 0;
    const currentVersion = currentSpec.version ?? 0;
    if (incomingVersion < currentVersion) {
      throw new Error("Version conflict: outdated objectSpec");
    }

    // Bump version
    objectSpec.version = currentVersion + 1;

    // Size cap check
    const newJson = JSON.stringify(objectSpec);
    if (newJson.length > 100 * 1024) {
      throw new Error("Updated object spec exceeds 100 kB limit");
    }

    // Ensure metadata.source is user for security
    if (!objectSpec.metadata) {
      objectSpec.metadata = {};
    }
    objectSpec.metadata.groupId = objectSpec.metadata.groupId ?? objectSpec.groupId ?? objectId;
    objectSpec.metadata.source = "user";
    
    // Update the object
    await ctx.db.patch(existing._id, {
      object_spec: newJson,
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
    
    let actionsField: any = actionsJson;
    let blobId: string | undefined = undefined;
    // TODO: Offload to storage via action if needed. Currently keep JSON inline.
    if (actionsJson.length > 200 * 1024) {
      console.warn("Snapshot exceeds 200kB; consider offloading to storage");
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
        actions_json: actionsField,
        blob_id: blobId,
      });
      return { id: existing._id, updated: true };
    } else {
      // Create new snapshot
      const snapshotId = await ctx.db.insert("whiteboard_snapshots", {
        session_id: sessionId,
        snapshot_index: snapshotIndex,
        actions_json: actionsField,
        blob_id: blobId,
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
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({ snapshotIndex: v.number(), objects: v.array(v.any()) })
  ),
  handler: async (ctx, { sessionId, limit = 50 }) => {
    const rows = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .order("desc")
      .take(limit);

    return rows.map((r) => ({
      snapshotIndex: (r as any).snapshot_index ?? 0,
      objects: JSON.parse(r.actions_json ?? "[]"),
    }));
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
 * applyWhiteboardPatch – handles the new coordinate system with absolute coordinates
 * Supports creates, updates, and deletes operations with element versioning
 */
export const applyWhiteboardPatch = mutation({
  args: {
    sessionId: v.id("sessions"),
    patch: v.any(),
    lastKnownVersion: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), newBoardVersion: v.number(), issues: v.array(v.any()), summary: v.string() }),
  handler: async (ctx, { sessionId, patch }) => {
    // allow unauthenticated assistant calls
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const { creates = [], updates = [], deletes = [] } = patch ?? {};
    let inserted = 0, updated = 0, deleted = 0;
    const issues = [];

    // Process deletes first
    for (const objectId of deletes) {
      try {
        const existing = await ctx.db
          .query("whiteboard_objects")
          .withIndex("by_session_object", (q) => 
            q.eq("session_id", sessionId).eq("object_id", objectId)
          )
          .first();
        
        if (existing) {
          await ctx.db.delete(existing._id);
          deleted++;
        } else {
          issues.push({ level: "warning", message: `Object ${objectId} not found for deletion` });
        }
      } catch (e) {
        issues.push({ level: "error", message: `Failed to delete object ${objectId}: ${e}` });
      }
    }

    // Process updates
    for (const updateItem of updates) {
      if (!updateItem.id) {
        issues.push({ level: "error", message: "Update item missing id" });
        continue;
      }

      try {
        const existing = await ctx.db
          .query("whiteboard_objects")
          .withIndex("by_session_object", (q) => 
            q.eq("session_id", sessionId).eq("object_id", updateItem.id)
          )
          .first();
        
        if (!existing) {
          issues.push({ level: "error", message: `Object ${updateItem.id} not found for update` });
        continue;
      }

        const currentSpec = JSON.parse(existing.object_spec);
        const updatedSpec = { 
          ...currentSpec, 
          ...updateItem.diff,
          version: (currentSpec.version || 1) + 1, // Increment version
          metadata: {
            ...currentSpec.metadata,
            ...updateItem.diff.metadata
          }
        };

        await ctx.db.patch(existing._id, {
          object_spec: JSON.stringify(updatedSpec),
          object_kind: updatedSpec.kind,
          updated_at: Date.now(),
        });
        updated++;
      } catch (e) {
        issues.push({ level: "error", message: `Failed to update object ${updateItem.id}: ${e}` });
      }
    }

    // Process creates
    for (const objectSpec of creates) {
      if (!objectSpec.id || !objectSpec.kind) {
        issues.push({ level: "error", message: "Create item missing id or kind" });
        continue;
      }

      if (objectSpec.kind === "widget") {
        const entry = (objectSpec as any).entry as string | undefined;
        if (!entry || !/^[a-zA-Z0-9_-]+$/.test(entry)) {
          issues.push({ level: "error", message: `Invalid widget entry '${entry}'. Use alphanumeric, hyphen or underscore, no spaces.` });
          continue;
        }

        // Ensure widget client code exists
        const tsxPath = `app/widgets/${entry}/client.tsx`;
        const jsPath  = `app/widgets/${entry}/client.js`;
        const widgetFileTsx = await ctx.db
          .query("code_overlays")
          .withIndex("by_project_path", (q: any) => q.eq("project_id", sessionId).eq("path", tsxPath))
          .unique();
        const widgetFileJs = await ctx.db
          .query("code_overlays")
          .withIndex("by_project_path", (q: any) => q.eq("project_id", sessionId).eq("path", jsPath))
          .unique();
        if (!widgetFileTsx && !widgetFileJs) {
          issues.push({ level: "error", message: `Widget '${entry}' has no client code in overlay.` });
          continue;
        }
      }

      try {
      await ctx.db.insert("whiteboard_objects", {
        session_id: sessionId,
          object_id: objectSpec.id,
          object_spec: JSON.stringify(objectSpec),
          object_kind: objectSpec.kind,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      inserted++;
      } catch (e) {
        issues.push({ level: "error", message: `Failed to create object ${objectSpec.id}: ${e}` });
      }
    }

    // Process binding updates
    const bindingUpdates = await processElementBindingUpdates(ctx, sessionId, creates.concat(updates.map((u: { diff: WBObject }) => u.diff)));

    return { 
      success: issues.length === 0,
      newBoardVersion: (creates.length > 0 ? (creates[0].version || 1) : (updates.length > 0 ? (updates[0].diff.version || 1) : -1)),
      issues, 
      summary: `Inserted: ${inserted}, Updated: ${updated}, Deleted: ${deleted}, Binding Updates: ${bindingUpdates.length}`,
    };
  },
});

/**
 * Helper to get all whiteboard elements for a session
 */
async function getWhiteboardElements(ctx: any, sessionId: Id<"sessions">): Promise<WBObject[]> {
    const objects = await ctx.db
      .query("whiteboard_objects")
    .withIndex("by_session", (q: any) => q.eq("session_id", sessionId))
      .collect();
    
  return objects.map((obj: any) => {
      const spec = JSON.parse(obj.object_spec);
      
    // Add version if missing
    if (!spec.version) {
      spec.version = 1;
    }
    
    // Return as WBObject with database id stored in metadata
      return {
        ...spec,
      id: obj.object_id,
      _id: obj._id,  // Store database ID for updates
      _creationTime: obj.created_at,
    } as WBObject & { _id: Id<"whiteboard_objects">; _creationTime: number };
  });
}

/**
 * Process element binding updates after a patch is applied
 * This ensures arrows stay connected to shapes when they move
 */
async function processElementBindingUpdates(
  ctx: any,
  sessionId: Id<"sessions">,
  updatedElements: WBObject[]
): Promise<WBObject[]> {
  const allElements = await getWhiteboardElements(ctx, sessionId);
  const bindingUpdates: WBObject[] = [];
  
  // Find elements that have been moved/updated and might affect bound arrows
  for (const updatedElement of updatedElements) {
    if (isBindableElement(updatedElement)) {
      console.log(`[WhiteboardDB] Processing binding updates for element ${updatedElement.id}`);
      
      // Find all arrows/lines that are bound to this element
      const boundArrows = allElements.filter((el: WBObject) => {
        if (!isLinearElement(el)) return false;
        
        const hasStartBinding = el.startBinding?.elementId === updatedElement.id;
        const hasEndBinding = el.endBinding?.elementId === updatedElement.id;
        
        return hasStartBinding || hasEndBinding;
      });
      
      // Update each bound arrow
      for (const arrow of boundArrows) {
        // Type guard to ensure we're working with linear elements
        if (!isLinearElement(arrow)) continue;
        
        let needsUpdate = false;
        let updatedArrow = { ...arrow };
        
        // Update start binding connection
        if (arrow.startBinding?.elementId === updatedElement.id) {
          const connectionPoint = getConnectionPoint(
            updatedElement,
            arrow.startBinding.focus,
            arrow.startBinding.connectionPoint
          );
          
          // Calculate new relative point
          const newStartPoint: [number, number] = [
            connectionPoint[0] - arrow.x,
            connectionPoint[1] - arrow.y
          ];
          
          const newPoints = [...arrow.points];
          newPoints[0] = newStartPoint;
          updatedArrow.points = newPoints;
          needsUpdate = true;
          
          console.log(`[WhiteboardDB] Updated start binding for arrow ${arrow.id}`);
        }
        
        // Update end binding connection
        if (arrow.endBinding?.elementId === updatedElement.id) {
          const connectionPoint = getConnectionPoint(
            updatedElement,
            arrow.endBinding.focus,
            arrow.endBinding.connectionPoint
          );
          
          // Calculate new relative point
          const newEndPoint: [number, number] = [
            connectionPoint[0] - arrow.x,
            connectionPoint[1] - arrow.y
          ];
          
          const newPoints = [...arrow.points];
          const lastIndex = newPoints.length - 1;
          newPoints[lastIndex] = newEndPoint;
          updatedArrow.points = newPoints;
          needsUpdate = true;
          
          // Regenerate curved arrow path if needed
          if (arrow.kind === "arrow" && arrow.arrowType === "curved" && arrow.curvature) {
            const startPoint = newPoints[0];
            const endPoint = newPoints[lastIndex];
            
            const curvedPath = generateCurvedArrowPath(
              [arrow.x + startPoint[0], arrow.y + startPoint[1]],
              [arrow.x + endPoint[0], arrow.y + endPoint[1]],
              arrow.curvature,
              arrow.arrowType
            );
            
            updatedArrow.points = curvedPath.points.map((point, index) => {
              if (index === 0) return [0, 0] as [number, number]; // First point always [0,0]
              return [point[0] - arrow.x, point[1] - arrow.y] as [number, number];
            });
            
            if (arrow.kind === "arrow") {
              (updatedArrow as WBArrow).controlPoints = curvedPath.controlPoints?.map((point) => 
                [point[0] - arrow.x, point[1] - arrow.y] as [number, number]
              );
            }
            
            console.log(`[WhiteboardDB] Regenerated curved path for arrow ${arrow.id}`);
          }
          
          console.log(`[WhiteboardDB] Updated end binding for arrow ${arrow.id}`);
        }
        
        if (needsUpdate) {
          bindingUpdates.push(updateElementVersion(updatedArrow));
        }
      }
    }
  }
  
  // Store binding updates if any
  if (bindingUpdates.length > 0) {
    console.log(`[WhiteboardDB] Applying ${bindingUpdates.length} binding updates`);
    
    for (const element of bindingUpdates) {
      // Find the database record for this element
      const dbRecord = await ctx.db
        .query("whiteboard_objects")
        .withIndex("by_session_object", (q: any) => 
          q.eq("session_id", sessionId).eq("object_id", element.id)
        )
        .first();
        
      if (dbRecord) {
        // Update the object spec with the new binding data
        await ctx.db.patch(dbRecord._id, {
          object_spec: JSON.stringify(element),
          updated_at: Date.now(),
        });
      }
    }
  }
  
  return bindingUpdates;
}

// ==========================================
// BOARD CONTEXT SNAPSHOT
// ==========================================
export const getWhiteboardContext = query({
  args: {
    sessionId: v.id("sessions"),
    boardId: v.optional(v.number()),
    // Optional list of fields to return per object for compactness
    fields: v.optional(v.array(v.string())),
  },
  returns: v.object({
    boardId: v.number(),
    boardVersion: v.number(),
    objects: v.array(v.any()),
  }),
  handler: async (ctx, { sessionId, boardId, fields }) => {
    // Re-use getWhiteboardObjectsInternal to respect auth semantics
    const objects: any[] = await ctx.runQuery(
      internal.database.whiteboard.getWhiteboardObjectsInternal as any,
      { sessionId, userId: null, boardId },
    );

    const boardVersion: number = objects.reduce((max: number, o: any) => Math.max(max, o.version ?? 1), 0);

    const projected: any[] = objects.map((spec: any) => {
      if (fields && fields.length) {
        const out: any = {};
        for (const f of fields) {
          if (spec[f] !== undefined) out[f] = spec[f];
        }
        // Always include id & kind for context
        out.id = spec.id;
        out.kind = spec.kind;
        return out;
      }
      return spec;
    });

    return { boardId: boardId ?? 0, boardVersion, objects: projected } as { boardId: number; boardVersion: number; objects: any[] };
  },
});