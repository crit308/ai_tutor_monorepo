import { query, mutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

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
    // Guard-rails: simple allow-list + traversal check
    const allowedPrefixes = [
      "app/",
      "pages/",
      "components/",
      "lib/",
      "public/",
      "src/",
    ];
    if (path.includes("..")) {
      throw new Error("Invalid path: traversal is not allowed");
    }
    if (!allowedPrefixes.some((p) => path.startsWith(p))) {
      throw new Error(`Path '${path}' is not in the allowed whiteboard template directories`);
    }
    if (path === "app/api/health/route.ts") {
      throw new Error("The health route is part of the base template and cannot be patched via overlays");
    }

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

      // If this file belongs to a widget, bump its whiteboard object version for cache-busting
      if (path.startsWith("app/widgets/")) {
        const parts = path.split("/");
        // Expected: ["app", "widgets", <entry>, ...]
        if (parts.length >= 3) {
          const entry = parts[2];
          await bumpWidgetVersion(ctx, projectId, entry);
        }
      }

      // Overlay application now handled immediately in upsertOverlayFileTool
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

    if (path.startsWith("app/widgets/")) {
      const parts = path.split("/");
      if (parts.length >= 3) {
        const entry = parts[2];
        await bumpWidgetVersion(ctx, projectId, entry);
      }
    }

    // Overlay application now handled immediately in upsertOverlayFileTool

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
    // Guard-rails: path validation same as upsertFile
    const allowedPrefixes = ["app/", "pages/", "components/", "lib/", "public/", "src/"];
    if (path.includes("..")) {
      throw new Error("Invalid path: traversal is not allowed");
    }
    if (!allowedPrefixes.some((p) => path.startsWith(p))) {
      throw new Error(`Path '${path}' is not in the allowed whiteboard template directories`);
    }

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

      // Overlay application now handled immediately in upsertOverlayFileTool
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
    // Guard-rails: path validation same as upsertFile
    const allowedPrefixes = ["app/", "pages/", "components/", "lib/", "public/", "src/"];
    if (path.includes("..")) {
      throw new Error("Invalid path: traversal is not allowed");
    }
    if (!allowedPrefixes.some((p) => path.startsWith(p))) {
      throw new Error(`Path '${path}' is not in the allowed whiteboard template directories`);
    }

    const existing = await ctx.db
      .query("code_overlays")
      .withIndex("by_project_path", (q) =>
        q.eq("project_id", projectId).eq("path", path),
      )
      .unique();
    return existing ?? null;
  },
});

async function bumpWidgetVersion(ctx: any, sessionId: string, entry: string) {
  // Iterate all widget objects for this session and matching entry
  const objs = await ctx.db
    .query("whiteboard_objects")
    .withIndex("by_session", (q: any) => q.eq("session_id", sessionId))
    .collect();

  for (const o of objs) {
    if (o.object_kind !== "widget") continue;
    try {
      const spec = JSON.parse(o.object_spec);
      if (spec.entry === entry) {
        spec.version = (spec.version || 1) + 1;
        await ctx.db.patch(o._id, { object_spec: JSON.stringify(spec), updated_at: Date.now() });
      }
    } catch {}
  }
} 