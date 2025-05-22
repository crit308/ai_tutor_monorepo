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

export const getFolders = query({
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

export const startSession = mutation({
  args: { folderId: v.optional(v.string()) },
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

export const fetchSessionMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .order("asc")
      .collect();
  },
});

// ---------------------------------------------------------------
// Board Summary and Whiteboard APIs
// ---------------------------------------------------------------

import { createClient } from "redis";
import * as Y from "yjs";

const REDIS_KEY_PREFIX = "yjs:snapshot:";

async function getRedisClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const client = createClient({ url });
  await client.connect();
  return client;
}

export const boardSummary = query({
  args: { sessionId: v.string() },
  handler: async (_ctx, { sessionId }) => {
    const client = await getRedisClient();
    const key = `${REDIS_KEY_PREFIX}${sessionId}`;
    const snapshot = await client.getBuffer(key);
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

    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(snapshot));

    const objMap = doc.getMap<any>("objects");
    const objects = Array.from(objMap.values());

    const byKind: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    const learnerTags: any[] = [];
    const conceptBboxes: Record<string, Array<[number, number, number, number]>> = {};

    for (const spec of objects) {
      const kind = spec.kind ?? "unknown";
      const owner = spec.metadata?.source ?? "unknown";
      byKind[kind] = (byKind[kind] || 0) + 1;
      byOwner[owner] = (byOwner[owner] || 0) + 1;

      const md = spec.metadata ?? {};
      if (md.role === "question_tag") {
        learnerTags.push({ id: spec.id, x: spec.x, y: spec.y, meta: md });
      }

      if (md.concept) {
        const x = Number(spec.x ?? 0);
        const y = Number(spec.y ?? 0);
        const w = Number(spec.width ?? 0);
        const h = Number(spec.height ?? 0);
        const bbox: [number, number, number, number] = [x, y, x + w, y + h];
        (conceptBboxes[md.concept] ||= []).push(bbox);
      }
    }

    const concept_clusters = Object.entries(conceptBboxes).map(
      ([concept, boxes]) => {
        const minX = Math.min(...boxes.map((b) => b[0]));
        const minY = Math.min(...boxes.map((b) => b[1]));
        const maxX = Math.max(...boxes.map((b) => b[2]));
        const maxY = Math.max(...boxes.map((b) => b[3]));
        return { concept, bbox: [minX, minY, maxX, maxY], count: boxes.length };
      },
    );

    const ephMap = doc.getMap<any>("ephemeral");
    const ephObjects = Array.from(ephMap.values());
    const activeHighlights = ephObjects.filter((o) => o.kind === "highlight_stroke").length;
    const activeQuestionTags = ephObjects
      .filter((o) => o.kind === "question_tag")
      .map((o) => ({ id: o.id, linkedObjectId: o.metadata?.linkedObjectId }));
    const pings = ephObjects.filter((o) => o.kind === "pointer_ping");
    let recentPointer: any = null;
    if (pings.length) {
      pings.sort((a, b) => (b.metadata?.expiresAt ?? 0) - (a.metadata?.expiresAt ?? 0));
      const recent = pings[0];
      recentPointer = { x: recent.x, y: recent.y, meta: recent.metadata };
    }

    return {
      counts: { by_kind: byKind, by_owner: byOwner },
      learner_question_tags: learnerTags,
      concept_clusters,
      ephemeralSummary: {
        activeHighlights,
        activeQuestionTags,
        recentPointer,
      },
    };
  },
});

export const list_whiteboard_snapshots = query({
  args: { session_id: v.string(), target_snapshot_index: v.number() },
  handler: async (ctx, { session_id, target_snapshot_index }) => {
    return await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) =>
        q.eq("session_id", session_id).lte("snapshot_index", target_snapshot_index),
      )
      .order("asc")
      .collect();
  },
});

export const insert_snapshot = mutation({
  args: {
    session_id: v.string(),
    snapshot_index: v.number(),
    actions_json: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("whiteboard_snapshots", {
      session_id: args.session_id,
      snapshot_index: args.snapshot_index,
      actions_json: args.actions_json,
      created_at: Date.now(),
    });
  },
});

export const store_yjs_snapshot = mutation({
  args: { sessionId: v.string(), snapshot: v.string() },
  handler: async (_ctx, { sessionId, snapshot }) => {
    const client = await getRedisClient();
    const key = `${REDIS_KEY_PREFIX}${sessionId}`;
    await client.set(key, Buffer.from(snapshot, "base64"));
    await client.quit();
  },
});

