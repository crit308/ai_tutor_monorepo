import { cronJobs } from "convex/server";
import { api } from "../_generated/api";

const crons = cronJobs();

// Process embedding queue every 5 minutes
crons.interval(
  "process embedding queue",
  { minutes: 5 },
  "jobs/background:processEmbeddingQueueBackground" as any,
  {}
);

// Clean up old logs daily at 2 AM
crons.cron(
  "cleanup old logs",
  "0 2 * * *", // Daily at 2 AM UTC
  "jobs/background:cleanupOldLogs" as any,
  { daysToKeep: 30 }
);

// Process session analytics hourly
crons.interval(
  "batch process session analytics",
  { hours: 1 },
  "jobs/background:batchProcessSessionAnalytics" as any,
  {}
);

// System health check every 15 minutes
crons.interval(
  "system health check",
  { minutes: 15 },
  "jobs/background:systemHealthCheck" as any,
  {}
);

// Daily cleanup of old OpenAI uploaded files (older than 24 hours)
crons.daily(
  "cleanup-old-openai-files",
  { hourUTC: 2, minuteUTC: 0 }, // Run at 2 AM UTC
  api.jobs.fileCleanup.cleanupOldFiles,
  { olderThanHours: 24 }
);

export default crons; 