import { query, mutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Fetch all overlay files for a given project (session).
 */
export const listFiles = query({
  args: {
    projectId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("code_overlays"),
      project_id: v.string(),
      path: v.string(),
      content: v.optional(v.string()),
      blob_id: v.optional(v.id("_storage")),
      sha: v.optional(v.string()),
      created_at: v.number(),
      updated_at: v.number(),
    }),
  ),
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("code_overlays")
      .withIndex("by_project", (q) => q.eq("project_id", projectId))
      .collect();
  },
});

/**
 * Upsert (create or update) a text overlay file. For binary assets use uploadAsset.
 */
export const upsertFile = mutation({
  args: {
    projectId: v.string(),
    path: v.string(),
    content: v.optional(v.string()),
    blobId: v.optional(v.id("_storage")),
    sha: v.optional(v.string()),
  },
  returns: v.id("code_overlays"),
  handler: async (ctx, { projectId, path, content, blobId, sha }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("code_overlays")
      .withIndex("by_project_path", (q) => q.eq("project_id", projectId).eq("path", path))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        blob_id: blobId,
        sha,
        updated_at: now,
      });

      // Schedule sandbox write
      await ctx.scheduler.runAfter(0, internal.actions.overlay.applyPatch, {
        sessionId: projectId,
        path,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("code_overlays", {
      project_id: projectId,
      path,
      content,
      blob_id: blobId,
      sha,
      created_at: now,
      updated_at: now,
    });

    await ctx.scheduler.runAfter(0, internal.actions.overlay.applyPatch, {
      sessionId: projectId,
      path,
    });

    return id;
  },
});

/**
 * Delete an overlay file (mark as deleted). If content is null, sandbox should delete file.
 */
export const deleteFile = mutation({
  args: {
    projectId: v.string(),
    path: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, path }) => {
    const existing = await ctx.db
      .query("code_overlays")
      .withIndex("by_project_path", (q) => q.eq("project_id", projectId).eq("path", path))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        content: undefined,
        blob_id: undefined,
        sha: undefined,
        updated_at: now,
      });

      await ctx.scheduler.runAfter(0, internal.actions.overlay.applyPatch, {
        sessionId: projectId,
        path,
      });
    }
    return null;
  },
});

export const getByProjectPath = internalQuery({
  args: {
    projectId: v.id("sessions"),
    path: v.string(),
  },
  handler: async (ctx, { projectId, path }) => {
    const existing = await ctx.db
      .query("code_overlays")
      .withIndex("by_project_path", (q) =>
        q.eq("project_id", projectId).eq("path", path),
      )
      .unique();
    return existing ?? null;
  },
}); 