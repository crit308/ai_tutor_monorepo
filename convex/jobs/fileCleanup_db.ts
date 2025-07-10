import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Record an uploaded file for later cleanup
export const recordUploadedFile = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    fileId: v.string(),
    purpose: v.string(),
    uploadedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("openai_uploaded_files", {
      sessionId: args.sessionId,
      fileId: args.fileId,
      purpose: args.purpose,
      uploadedAt: args.uploadedAt,
      cleanedUp: false,
    });
  },
});

// Query: get all un-cleaned files for a session
export const getSessionFiles = internalQuery({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("openai_uploaded_files")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("cleanedUp"), false))
      .collect();
  },
});

// Query: get all old un-cleaned files older than cutoffTime
export const getOldFiles = internalQuery({
  args: {
    cutoffTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("openai_uploaded_files")
      .filter((q) =>
        q.and(
          q.lt(q.field("uploadedAt"), args.cutoffTime),
          q.eq(q.field("cleanedUp"), false)
        )
      )
      .collect();
  },
});

// Mark file as cleaned up
export const markFileCleanedUp = internalMutation({
  args: {
    fileId: v.string(),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("openai_uploaded_files")
      .filter((q) => q.eq(q.field("fileId"), args.fileId))
      .first();

    if (file) {
      await ctx.db.patch(file._id, { cleanedUp: true });
    }
  },
}); 