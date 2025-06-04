import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { requireAuth } from "../auth/middleware";

/**
 * Generate upload URL for file storage
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Require authentication
    await requireAuth(ctx);
    
    // Generate and return upload URL
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Store file metadata after upload
 */
export const storeFileMetadata = mutation({
  args: {
    sessionId: v.id("sessions"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  returns: v.id("files"),
  handler: async (ctx, { sessionId, storageId, fileName, fileType, fileSize }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new ConvexError("Session not found or access denied");
    }
    
    // Store file metadata
    const fileId = await ctx.db.insert("files", {
      session_id: sessionId,
      user_id: userId,
      storage_id: storageId,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      upload_status: "completed",
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    
    return fileId;
  },
});

/**
 * List files for a session
 */
export const listSessionFiles = query({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.array(v.object({
    _id: v.id("files"),
    file_name: v.string(),
    file_type: v.string(),
    file_size: v.number(),
    upload_status: v.string(),
    created_at: v.number(),
    storage_url: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new ConvexError("Session not found or access denied");
    }
    
    // Get files for session
    const files = await ctx.db
      .query("files")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    // Generate URLs for files
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const url = await ctx.storage.getUrl(file.storage_id);
        return {
          _id: file._id,
          file_name: file.file_name,
          file_type: file.file_type,
          file_size: file.file_size,
          upload_status: file.upload_status,
          created_at: file.created_at,
          storage_url: url,
        };
      })
    );
    
    return filesWithUrls;
  },
});

/**
 * Get file download URL
 */
export const getFileUrl = query({
  args: {
    fileId: v.id("files"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { fileId }) => {
    const userId = await requireAuth(ctx);
    
    // Get file metadata
    const file = await ctx.db.get(fileId);
    if (!file || file.user_id !== userId) {
      throw new ConvexError("File not found or access denied");
    }
    
    // Generate and return download URL
    return await ctx.storage.getUrl(file.storage_id);
  },
});

/**
 * Delete file
 */
export const deleteFile = mutation({
  args: {
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, { fileId }) => {
    const userId = await requireAuth(ctx);
    
    // Get file metadata
    const file = await ctx.db.get(fileId);
    if (!file || file.user_id !== userId) {
      throw new ConvexError("File not found or access denied");
    }
    
    // Delete from storage
    await ctx.storage.delete(file.storage_id);
    
    // Delete metadata
    await ctx.db.delete(fileId);
    
    return null;
  },
}); 