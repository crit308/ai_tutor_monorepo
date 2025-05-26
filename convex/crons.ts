import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process embedding queue every 5 minutes
crons.interval(
  "process embedding queue",
  { minutes: 5 },
  internal.backgroundJobs.processEmbeddingQueue,
);

// Clean up old logs daily at 2 AM UTC
crons.daily(
  "cleanup old logs",
  { hourUTC: 2, minuteUTC: 0 },
  internal.backgroundJobs.cleanupOldLogs,
  { daysToKeep: 30 },
);

// Process session analytics hourly
crons.hourly(
  "process session analytics", 
  { minuteUTC: 0 },
  internal.backgroundJobs.batchProcessSessionAnalytics,
);

// System health check every 10 minutes
crons.interval(
  "system health check",
  { minutes: 10 },
  internal.backgroundJobs.systemHealthCheck,
);

export default crons; 