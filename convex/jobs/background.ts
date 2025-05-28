import { v } from "convex/values";
import { action, mutation, query, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

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

// --- Internal Functions for Cron Jobs ---

export const processEmbeddingQueueBackground = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      // For now, return a mock result since internal.documentProcessor.processEmbeddingQueue doesn't exist yet
      const result = {
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        message: "Embedding queue processing not yet implemented"
      };

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
      // For now, return a mock result since internal.tutorEndpoints.processSessionAnalytics doesn't exist yet
      const result = {
        processedSessions: 0,
        totalSessions: 0,
        message: "Session analytics processing not yet implemented"
      };
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
      // For now, return a mock health status since getSystemHealth doesn't exist yet
      const healthStatus = {
        pendingEmbeddings: 0,
        failedJobsLastHour: 0,
        activeSessionsLastHour: 0,
        systemLoad: "normal",
        lastUpdated: Date.now(),
      };
      
      // Log any concerning metrics
      if (healthStatus.pendingEmbeddings > 100) {
        console.warn(`High embedding queue: ${healthStatus.pendingEmbeddings} pending`);
      }
      
      if (healthStatus.failedJobsLastHour > 10) {
        console.warn(`High failure rate: ${healthStatus.failedJobsLastHour} failed jobs in last hour`);
      }
      
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

export const listJobs = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let jobsQuery = ctx.db.query("background_jobs");

    if (args.status) {
      jobsQuery = jobsQuery.filter((q) => q.eq(q.field("status"), args.status));
    }

    const jobs = await jobsQuery
      .order("desc")
      .take(args.limit || 50);

    return jobs.map(job => ({
      jobId: job._id,
      jobType: job.job_type,
      status: job.status,
      progress: job.progress,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
    }));
  },
}); 