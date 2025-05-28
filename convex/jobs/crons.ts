import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

const crons = cronJobs();

// Process embedding queue every 5 minutes
crons.interval(
  "process embedding queue",
  { minutes: 5 },
  internal.jobs.background.processEmbeddingQueue,
);

// Clean up old logs daily at 2 AM
crons.daily(
  "cleanup old logs",
  { hourUTC: 2 },
  internal.jobs.background.cleanupOldLogs,
  {},
);

// Process session analytics hourly
crons.hourly(
  "batch process session analytics",
  { minuteUTC: 0 },
  internal.jobs.background.batchProcessSessionAnalytics,
);

// System health check every 15 minutes
crons.interval(
  "system health check",
  { minutes: 15 },
  internal.jobs.background.systemHealthCheck,
);

export default crons; 