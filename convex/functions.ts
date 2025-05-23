import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const hello = query({
  args: {},
  handler: async () => {
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

export const createFolder = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const now = Date.now();
    const id = await ctx.db.insert("folders", {
      user_id: identity.subject,
      name: args.name,
      created_at: now,
      updated_at: now,
    });
    const folder = await ctx.db.get(id);
    return folder;
  },
});

export const listFolders = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", identity.subject))
      .collect();
  },
});

export const renameFolder = mutation({
  args: { folderId: v.id("folders"), name: v.string() },
  handler: async (ctx, { folderId, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== identity.subject) {
      throw new Error("Folder not found");
    }
    await ctx.db.patch(folderId, { name, updated_at: Date.now() });
  },
});

export const deleteFolder = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== identity.subject) {
      throw new Error("Folder not found");
    }
    await ctx.db.delete(folderId);
  },
});

export const getFolder = query({
  args: { folderId: v.id("folders") },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== identity.subject) return null;
    return folder;
  },
});

export const createSession = mutation({
  args: { folderId: v.optional(v.id("folders")) },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const now = Date.now();
    const id = await ctx.db.insert("sessions", {
      user_id: identity.subject,
      folder_id: folderId ?? undefined,
      context_data: {},
      created_at: now,
      updated_at: now,
    });
    return { id };
  },
});

export const getSessionMessages = query({
  args: {
    sessionId: v.id("sessions"),
    beforeTurnNo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, beforeTurnNo, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    let q = ctx.db
      .query("session_messages")
      .withIndex("by_session_turn", (q) => q.eq("session_id", sessionId));
    if (beforeTurnNo !== undefined) {
      q = q.lt("turn_no", beforeTurnNo);
    }
    q = q.order("desc");
    const rows = await q.take(limit ?? 50);
    rows.reverse();
    return rows.map((r) => ({ ...r }));
  },
});

export const updateSessionContext = mutation({
  args: { sessionId: v.id("sessions"), context: v.any() },
  handler: async (ctx, { sessionId, context }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error("Session not found");
    }
    await ctx.db.patch(sessionId, {
      context_data: context,
      updated_at: Date.now(),
    });
    return true;
  },
});

export const getSessionContext = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) return null;
    return { context: session.context_data };
  },
});
import { createClient } from 'redis';
import * as Y from 'yjs';

const REDIS_KEY_PREFIX = 'yjs:snapshot:';

export const getBoardSummary = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error("Session not found");
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = createClient({ url: redisUrl });
    await client.connect();
    const redisKey = `${REDIS_KEY_PREFIX}${sessionId}`;
    const snapshot = (await client.getBuffer(redisKey)) as Buffer | null;
    await client.quit();

    if (!snapshot) {
      return {
        counts: { by_kind: {}, by_owner: {} },
        learner_question_tags: [],
        concept_clusters: [],
        ephemeralSummary: {
          activeHighlights: 0,
          activeQuestionTags: [],
          recentPointer: null,
        },
      };
    }

    const ydoc = new Y.Doc();
    try {
      Y.applyUpdate(ydoc, new Uint8Array(snapshot));
    } catch (err) {
      return { error: 'failed_to_decode_snapshot', detail: String(err) };
    }

    const objMap = ydoc.getMap<any>('objects');
    const objects = Array.from(objMap.values());
    const byKind: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    const learnerTags: any[] = [];
    const conceptBoxes: Record<string, Array<[number, number, number, number]>> = {};

    for (const spec of objects) {
      const kind = spec?.kind ?? 'unknown';
      const owner = spec?.metadata?.source ?? 'unknown';
      byKind[kind] = (byKind[kind] || 0) + 1;
      byOwner[owner] = (byOwner[owner] || 0) + 1;

      const md = spec?.metadata ?? {};
      if (md.role === 'question_tag') {
        learnerTags.push({ id: spec.id, x: spec.x, y: spec.y, meta: md });
      }
      const concept = md.concept;
      if (concept) {
        const x = Number(spec.x ?? 0);
        const y = Number(spec.y ?? 0);
        const w = Number(spec.width ?? 0);
        const h = Number(spec.height ?? 0);
        (conceptBoxes[concept] ||= []).push([x, y, x + w, y + h]);
      }
    }

    const conceptClusters = Object.entries(conceptBoxes).map(([concept, boxes]) => {
      const minX = Math.min(...boxes.map((b) => b[0]));
      const minY = Math.min(...boxes.map((b) => b[1]));
      const maxX = Math.max(...boxes.map((b) => b[2]));
      const maxY = Math.max(...boxes.map((b) => b[3]));
      return { concept, bbox: [minX, minY, maxX, maxY], count: boxes.length };
    });

    const ephMap = ydoc.getMap<any>('ephemeral');
    const ephObjs = Array.from(ephMap.values());
    const activeHighlights = ephObjs.filter((s) => s.kind === 'highlight_stroke').length;
    const activeQuestionTags = ephObjs
      .filter((s) => s.kind === 'question_tag')
      .map((s) => ({ id: s.id, linkedObjectId: s.metadata?.linkedObjectId }));
    let recentPointer: any = null;
    const pings = ephObjs.filter((s) => s.kind === 'pointer_ping');
    if (pings.length > 0) {
      const latest = pings.reduce((a, b) =>
        (a.metadata?.expiresAt || 0) > (b.metadata?.expiresAt || 0) ? a : b
      );
      recentPointer = { x: latest.x, y: latest.y, meta: latest.metadata };
    }

    return {
      counts: { by_kind: byKind, by_owner: byOwner },
      learner_question_tags: learnerTags,
      concept_clusters: conceptClusters,
      ephemeralSummary: {
        activeHighlights,
        activeQuestionTags,
        recentPointer,
      },
    };
  },
});

export const insertSnapshot = mutation({
  args: {
    sessionId: v.id('sessions'),
    snapshotIndex: v.number(),
    actionsJson: v.any(),
  },
  handler: async (ctx, { sessionId, snapshotIndex, actionsJson }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    await ctx.db.insert('whiteboard_snapshots', {
      session_id: sessionId,
      snapshot_index: snapshotIndex,
      actions_json: actionsJson,
      created_at: Date.now(),
    });
  },
});

export const getWhiteboardSnapshots = query({
  args: { sessionId: v.id('sessions'), maxIndex: v.optional(v.number()) },
  handler: async (ctx, { sessionId, maxIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) return [];
    let q = ctx.db
      .query('whiteboard_snapshots')
      .withIndex('by_session_snapshot', (q) => q.eq('session_id', sessionId));
    if (maxIndex !== undefined) {
      q = q.lte('snapshot_index', maxIndex);
    }
    q = q.order('asc');
    return await q.collect();
  },
});
