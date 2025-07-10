'use node';
import { action } from "../_generated/server";
import { v } from "convex/values";
import { deleteFileFromOpenAI } from "../openaiClient";
import { internal } from "../_generated/api";

// Clean up files for a specific session
export const cleanupSessionFiles = action({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    sessionId: v.id("sessions"),
    cleanedCount: v.number(),
    errorCount: v.number(),
    totalFiles: v.number(),
  }),
  handler: async (ctx, args): Promise<{sessionId: any; cleanedCount: number; errorCount: number; totalFiles:number}> => {
    console.log(`[File Cleanup] Starting cleanup for session: ${args.sessionId}`);
    const files: any[] = await ctx.runQuery(internal.jobs.fileCleanup_db.getSessionFiles, {
      sessionId: args.sessionId,
    });
    let cleanedCount = 0;
    let errorCount = 0;
    for (const file of files) {
      try {
        const success = await deleteFileFromOpenAI(file.fileId);
        if (success) {
          await ctx.runMutation(internal.jobs.fileCleanup_db.markFileCleanedUp, {
            fileId: file.fileId,
          });
          cleanedCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`[File Cleanup] Error deleting file ${file.fileId}:`, error);
        errorCount++;
      }
    }
    console.log(`[File Cleanup] Session ${args.sessionId}: ${cleanedCount} files cleaned, ${errorCount} errors`);
    return { sessionId: args.sessionId, cleanedCount, errorCount, totalFiles: files.length };
  },
});

// Clean up old files (cron)
export const cleanupOldFiles = action({
  args: { olderThanHours: v.optional(v.number()) },
  returns: v.object({
    cleanedCount: v.number(),
    errorCount: v.number(),
    totalFiles: v.number(),
    cutoffTime: v.number(),
  }),
  handler: async (ctx, args): Promise<{cleanedCount:number; errorCount:number; totalFiles:number; cutoffTime:number}> => {
    const olderThanHours = args.olderThanHours || 24;
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
    console.log(`[File Cleanup] Starting cleanup of files older than ${olderThanHours} hours`);
    const files = await ctx.runQuery(internal.jobs.fileCleanup_db.getOldFiles, { cutoffTime });
    let cleanedCount = 0;
    let errorCount = 0;
    for (const file of files) {
      try {
        const success = await deleteFileFromOpenAI(file.fileId);
        if (success) {
          await ctx.runMutation(internal.jobs.fileCleanup_db.markFileCleanedUp, { fileId: file.fileId });
          cleanedCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`[File Cleanup] Error deleting file ${file.fileId}:`, error);
        errorCount++;
      }
    }
    console.log(`[File Cleanup] Cleaned ${cleanedCount} old files, ${errorCount} errors`);
    return { cleanedCount, errorCount, totalFiles: files.length, cutoffTime };
  },
}); 