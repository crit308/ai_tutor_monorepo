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

// ------------------------------------------------------------
// Tutor Workflow Mutations (Task #4 Migration)
// ------------------------------------------------------------

export const uploadDocuments = mutation({
  args: {
    sessionId: v.string(),
    fileNames: v.array(v.string()),
  },
  handler: async (ctx, { sessionId, fileNames }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const now = Date.now();
    for (const name of fileNames) {
      await ctx.db.insert("uploaded_files", {
        supabase_path: name,
        user_id: identity.subject,
        folder_id: session.folder_id ?? "",
        embedding_status: "pending",
        created_at: now,
        updated_at: now,
      });
    }

    await ctx.db.patch(sessionId, {
      analysis_status: "pending",
      updated_at: now,
    });

    return {
      vector_store_id: null,
      files_received: fileNames,
      analysis_status: "pending",
      message: "Upload recorded",
    };
  },
});

export const triggerLessonPlan = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const context = (session.context_data as any) ?? {};
    context.lesson_plan_status = "pending";

    await ctx.db.patch(sessionId, {
      context_data: context,
      updated_at: Date.now(),
    });

    return { message: "Lesson planning started" };
  },
});

export const triggerQuizGeneration = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const context = (session.context_data as any) ?? {};
    context.quiz_status = "pending";

    await ctx.db.patch(sessionId, {
      context_data: context,
      updated_at: Date.now(),
    });

    return { message: "Quiz generation started" };
  },
});

export const interactWithTutor = mutation({
  args: { sessionId: v.string(), message: v.string() },
  handler: async (ctx, { sessionId, message }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const last = await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .order("desc")
      .first();
    const nextTurn = last ? (last.turn_no as number) + 1 : 1;
    const now = Date.now();

    await ctx.db.insert("session_messages", {
      session_id: sessionId,
      turn_no: nextTurn,
      role: "user",
      text: message,
      created_at: now,
    });

    const reply = "Thanks for your message.";

    await ctx.db.insert("session_messages", {
      session_id: sessionId,
      turn_no: nextTurn + 1,
      role: "assistant",
      text: reply,
      created_at: now,
    });

    return {
      content_type: "message",
      data: { text: reply },
      user_model_state: {},
    };
  },
});

