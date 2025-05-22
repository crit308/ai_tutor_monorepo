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
