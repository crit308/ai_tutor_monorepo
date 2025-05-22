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

