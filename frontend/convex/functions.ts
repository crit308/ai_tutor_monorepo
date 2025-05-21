import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Example query function
export const hello = query({
  args: {},
  handler: async (ctx) => {
    return "Hello from Convex!";
  },
});

// Placeholder folder creation mutation
export const createFolder = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const id = await ctx.db.insert("folders", { name });
    return { id };
  },
});

// Fetch all folders for the current user
export const getFolders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("folders").collect();
  },
});

// Start a new session record
export const startSession = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, { folderId }) => {
    const sessionId = await ctx.db.insert("sessions", {
      folderId,
      createdAt: Date.now(),
    });
    return { session_id: sessionId };
  },
});

// Fetch messages for a session
export const fetchSessionMessages = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("session_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
  },
});
