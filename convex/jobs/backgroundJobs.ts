import { v } from "convex/values";
import { action, mutation, query, internalAction, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { cronJobs } from "convex/server";

// --- Background Job Types ---

export interface JobProgress {
  jobId: string;
  jobType: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0-100
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  metadata?: any;
}

export interface EmbeddingJob {
  fileId: Id<"uploaded_files">;
  sessionId: Id<"sessions">;
  filename: string;
  vectorStoreId: string;
  priority: "low" | "medium" | "high";
}

// --- Scheduled Jobs ---

// --- Internal Functions for Cron Jobs ---

export const processEmbeddingQueue = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const result = await ctx.runAction(api.documentProcessor.processEmbeddingQueue, {
        batchSize: 5,
      });

      if (result.processedCount > 0) {
        console.log(`Processed ${result.processedCount} embedding jobs, ${result.successCount} successful`);
      }
      return result;
    } catch (error) {
      console.error("Error in embedding queue job:", error);
      throw error;
    }
  }
});

export const cleanupOldLogs = internalMutation({
  args: { daysToKeep: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const daysToKeep = args.daysToKeep || 30;
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      
      // Clean up old interaction logs
      const oldLogs = await ctx.db
        .query("interaction_logs")
        .filter(q => q.lt(q.field("created_at"), cutoffTime))
        .collect();
      
      let deletedCount = 0;
      for (const log of oldLogs) {
        await ctx.db.delete(log._id);
        deletedCount++;
      }
      
      console.log(`Cleaned up ${deletedCount} old interaction logs`);
      return { deletedCount };
    } catch (error) {
      console.error("Error in cleanup job:", error);
      throw error;
    }
  }
});

export const batchProcessSessionAnalytics = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const result = await ctx.runAction(api.tutorEndpoints.processSessionAnalytics, {
        batchSize: 50,
      });
      console.log(`Processed analytics for ${result.processedSessions} sessions`);
      return result;
    } catch (error) {
      console.error("Error in analytics job:", error);
      throw error;
    }
  }
});

export const systemHealthCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      const healthStatus = await getSystemHealth(ctx, {});
      
      // Log any concerning metrics
      if (healthStatus.pendingEmbeddings > 100) {
        console.warn(`High embedding queue: ${healthStatus.pendingEmbeddings} pending`);
      }
      
      if (healthStatus.failedJobsLastHour > 10) {
        console.warn(`High failure rate: ${healthStatus.failedJobsLastHour} failed jobs in last hour`);
      }
      
      // Update system status
      await updateSystemStatus(ctx, {
        component: 'overall',
        status: healthStatus.pendingEmbeddings > 100 || healthStatus.failedJobsLastHour > 10 ? 'warning' : 'healthy',
        metrics: healthStatus,
      });
      
      return healthStatus;
    } catch (error) {
      console.error("Error in health check job:", error);
      throw error;
    }
  }
});

// --- Background Job Management ---

export const createBackgroundJob = mutation({
  args: {
    jobType: v.string(),
    jobData: v.any(),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"background_jobs">> => {
    const jobId = await ctx.db.insert("background_jobs", {
      job_type: args.jobType,
      job_data: args.jobData,
      priority: args.priority || "medium",
      status: "pending",
      progress: 0,
      created_at: Date.now(),
      scheduled_for: args.scheduledFor || Date.now(),
    });

    return jobId;
  },
});

export const updateJobProgress = mutation({
  args: {
    jobId: v.id("background_jobs"),
    progress: v.number(),
    status: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"))),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      progress: Math.min(100, Math.max(0, args.progress)),
    };

    if (args.status) {
      updates.status = args.status;
      
      if (args.status === "running" && !updates.started_at) {
        updates.started_at = Date.now();
      } else if (args.status === "completed" || args.status === "failed") {
        updates.completed_at = Date.now();
      }
    }

    if (args.errorMessage) {
      updates.error_message = args.errorMessage;
    }

    if (args.metadata) {
      updates.metadata = args.metadata;
    }

    await ctx.db.patch(args.jobId, updates);
  },
});

export const getJobStatus = query({
  args: {
    jobId: v.id("background_jobs"),
  },
  handler: async (ctx, args): Promise<JobProgress | null> => {
    const job = await ctx.db.get(args.jobId);
    
    if (!job) {
      return null;
    }

    return {
      jobId: args.jobId,
      jobType: job.job_type,
      status: job.status,
      progress: job.progress,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
      metadata: job.metadata,
    };
  },
});

export const getJobQueue = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"))),
    jobType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("background_jobs");

    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    const jobs = await query
      .order("desc")
      .take(args.limit || 50);

    return jobs
      .filter(job => !args.jobType || job.job_type === args.jobType)
      .map(job => ({
        jobId: job._id,
        jobType: job.job_type,
        status: job.status,
        progress: job.progress,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        priority: job.priority,
        errorMessage: job.error_message,
      }));
  },
});

// --- Specific Job Processors ---

export const processEmbeddingJob = action({
  args: {
    jobId: v.id("background_jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.backgroundJobs.getJobStatus, {
      jobId: args.jobId,
    });

    if (!job || job.status !== "pending") {
      return { success: false, message: "Job not found or not pending" };
    }

    try {
      // Mark job as running
      await ctx.runMutation(api.backgroundJobs.updateJobProgress, {
        jobId: args.jobId,
        status: "running",
        progress: 0,
      });

      const embeddingData = job.metadata as EmbeddingJob;
      
      // Simulate embedding processing with progress updates
      for (let progress = 0; progress <= 100; progress += 20) {
        await ctx.runMutation(api.backgroundJobs.updateJobProgress, {
          jobId: args.jobId,
          progress,
        });

        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update file status to completed
      await ctx.runMutation(api.documentProcessor.updateEmbeddingStatus, {
        fileId: embeddingData.fileId,
        status: "completed",
      });

      // Mark job as completed
      await ctx.runMutation(api.backgroundJobs.updateJobProgress, {
        jobId: args.jobId,
        status: "completed",
        progress: 100,
      });

      return { success: true, message: "Embedding job completed successfully" };

    } catch (error) {
      // Mark job as failed
      await ctx.runMutation(api.backgroundJobs.updateJobProgress, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw new ConvexError(`Embedding job failed: ${error}`);
    }
  },
});

export const batchProcessSessionAnalytics = action({
  args: {},
  handler: async (ctx, args) => {
    // Get sessions that need analytics processing
    const sessionsNeedingAnalytics = await ctx.runQuery(getSessionsNeedingAnalytics, {
      limit: 50,
    });

    let processedSessions = 0;
    const results = [];

    for (const session of sessionsNeedingAnalytics) {
      try {
        const analytics = await ctx.runAction(api.tutorEndpoints.processSessionAnalytics, {
          sessionId: session._id,
        });

        results.push({
          sessionId: session._id,
          success: true,
          analytics,
        });

        processedSessions++;
      } catch (error) {
        results.push({
          sessionId: session._id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      processedSessions,
      totalSessions: sessionsNeedingAnalytics.length,
      results,
    };
  },
});

export const getSessionsNeedingAnalytics = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    return await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.lt(q.field("updated_at"), cutoffTime),
          q.or(
            q.eq(q.field("context.analytics_processed_at"), undefined),
            q.lt(q.field("context.analytics_processed_at"), q.field("updated_at"))
          )
        )
      )
      .take(args.limit || 50);
  },
});

// --- System Monitoring ---

export const getSystemHealth = query({
  args: {},
  handler: async (ctx, args) => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // Get pending embeddings count
    const pendingEmbeddings = await ctx.db
      .query("uploaded_files")
      .withIndex("by_embedding_status", (q) => q.eq("embedding_status", "pending"))
      .collect();

    // Get failed jobs in last hour
    const failedJobs = await ctx.db
      .query("background_jobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .filter((q) => q.gt(q.field("created_at"), oneHourAgo))
      .collect();

    // Get active sessions
    const activeSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.gt(q.field("updated_at"), oneHourAgo))
      .collect();

    return {
      pendingEmbeddings: pendingEmbeddings.length,
      failedJobsLastHour: failedJobs.length,
      activeSessionsLastHour: activeSessions.length,
      systemLoad: "normal", // Could be computed based on various metrics
      lastUpdated: Date.now(),
    };
  },
});

export const updateSystemStatus = mutation({
  args: {
    status: v.any(),
  },
  handler: async (ctx, args) => {
    // Store system status for monitoring dashboard
    await ctx.db.insert("system_status", {
      timestamp: Date.now(),
      status: args.status,
    });

    // Keep only last 100 status entries
    const oldStatuses = await ctx.db
      .query("system_status")
      .order("desc")
      .take(200);

    if (oldStatuses.length > 100) {
      for (let i = 100; i < oldStatuses.length; i++) {
        await ctx.db.delete(oldStatuses[i]._id);
      }
    }
  },
});

// --- Cleanup Jobs ---

export const cleanupOldLogs = mutation({
  args: {
    cutoffTime: v.number(),
  },
  handler: async (ctx, args) => {
    const oldLogs = await ctx.db
      .query("interaction_logs")
      .filter((q) => q.lt(q.field("timestamp"), args.cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

export const cleanupCompletedJobs = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - ((args.olderThanDays || 7) * 24 * 60 * 60 * 1000);

    const oldJobs = await ctx.db
      .query("background_jobs")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .filter((q) => q.lt(q.field("completed_at"), cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const job of oldJobs) {
      await ctx.db.delete(job._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// --- Job Queue Management ---

export const retryFailedJob = action({
  args: {
    jobId: v.id("background_jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    
    if (!job || job.status !== "failed") {
      throw new ConvexError("Job not found or not in failed state");
    }

    // Reset job status
    await ctx.runMutation(api.backgroundJobs.updateJobProgress, {
      jobId: args.jobId,
      status: "pending",
      progress: 0,
      errorMessage: undefined,
    });

    return { success: true, message: "Job queued for retry" };
  },
});

export const cancelJob = mutation({
  args: {
    jobId: v.id("background_jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status === "completed") {
      throw new ConvexError("Cannot cancel completed job");
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      error_message: "Cancelled by user",
      completed_at: Date.now(),
    });

    return { success: true, message: "Job cancelled successfully" };
  },
});

export const getJobStatistics = query({
  args: {
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
      endTime: Date.now(),
    };

    const jobs = await ctx.db
      .query("background_jobs")
      .filter((q) => 
        q.and(
          q.gte(q.field("created_at"), timeRange.startTime),
          q.lte(q.field("created_at"), timeRange.endTime)
        )
      )
      .collect();

    const stats = {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === "completed").length,
      failedJobs: jobs.filter(j => j.status === "failed").length,
      pendingJobs: jobs.filter(j => j.status === "pending").length,
      runningJobs: jobs.filter(j => j.status === "running").length,
      averageCompletionTime: 0,
      jobTypeBreakdown: {} as Record<string, number>,
    };

    // Calculate average completion time
    const completedJobs = jobs.filter(j => j.status === "completed" && j.started_at && j.completed_at);
    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, job) => 
        sum + (job.completed_at! - job.started_at!), 0
      );
      stats.averageCompletionTime = totalTime / completedJobs.length;
    }

    // Job type breakdown
    jobs.forEach(job => {
      stats.jobTypeBreakdown[job.job_type] = (stats.jobTypeBreakdown[job.job_type] || 0) + 1;
    });

    return stats;
  },
}); 