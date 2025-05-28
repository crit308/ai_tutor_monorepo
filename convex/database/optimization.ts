import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth, requireAdmin, checkRateLimit } from "../auth";

// ==========================================
// DATABASE OPTIMIZATION & MONITORING
// ==========================================

/**
 * Get database performance metrics
 */
export const getDatabaseMetrics = query({
  args: { 
    timeRange: v.optional(v.union(
      v.literal("1h"),
      v.literal("24h"),
      v.literal("7d"),
      v.literal("30d")
    ))
  },
  handler: async (ctx, { timeRange = "24h" }) => {
    const userId = await requireAuth(ctx);
    
    // Calculate time window
    const now = Date.now();
    let startTime: number;
    
    switch (timeRange) {
      case "1h":
        startTime = now - (60 * 60 * 1000);
        break;
      case "24h":
        startTime = now - (24 * 60 * 60 * 1000);
        break;
      case "7d":
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = now - (24 * 60 * 60 * 1000);
    }
    
    // Get counts for user's data
    const [
      totalSessions,
      recentSessions,
      totalFolders,
      totalMessages,
      recentMessages,
      totalSnapshots,
      recentSnapshots,
      totalInteractions,
      recentInteractions,
    ] = await Promise.all([
      // Total sessions
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(sessions => sessions.length),
      
      // Recent sessions
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .filter((q) => q.gte(q.field("created_at"), startTime))
        .collect()
        .then(sessions => sessions.length),
      
      // Total folders
      ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(folders => folders.length),
      
      // Total messages (need to get by user sessions)
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(async (sessions) => {
          const sessionIds = sessions.map(s => s._id);
          let totalMessages = 0;
          
          for (const sessionId of sessionIds) {
            const messages = await ctx.db
              .query("session_messages")
              .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
              .collect();
            totalMessages += messages.length;
          }
          
          return totalMessages;
        }),
      
      // Recent messages
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(async (sessions) => {
          const sessionIds = sessions.map(s => s._id);
          let recentMessages = 0;
          
          for (const sessionId of sessionIds) {
            const messages = await ctx.db
              .query("session_messages")
              .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
              .filter((q) => q.gte(q.field("created_at"), startTime))
              .collect();
            recentMessages += messages.length;
          }
          
          return recentMessages;
        }),
      
      // Total snapshots
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(async (sessions) => {
          const sessionIds = sessions.map(s => s._id);
          let totalSnapshots = 0;
          
          for (const sessionId of sessionIds) {
            const snapshots = await ctx.db
              .query("whiteboard_snapshots")
              .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
              .collect();
            totalSnapshots += snapshots.length;
          }
          
          return totalSnapshots;
        }),
      
      // Recent snapshots
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(async (sessions) => {
          const sessionIds = sessions.map(s => s._id);
          let recentSnapshots = 0;
          
          for (const sessionId of sessionIds) {
            const snapshots = await ctx.db
              .query("whiteboard_snapshots")
              .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
              .filter((q) => q.gte(q.field("created_at"), startTime))
              .collect();
            recentSnapshots += snapshots.length;
          }
          
          return recentSnapshots;
        }),
      
      // Total interactions
      ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(logs => logs.length),
      
      // Recent interactions
      ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .filter((q) => q.gte(q.field("created_at"), startTime))
        .collect()
        .then(logs => logs.length),
    ]);
    
    return {
      timeRange,
      startTime,
      endTime: now,
      metrics: {
        sessions: {
          total: totalSessions,
          recent: recentSessions,
          growth: totalSessions > 0 ? (recentSessions / totalSessions) * 100 : 0,
        },
        folders: {
          total: totalFolders,
        },
        messages: {
          total: totalMessages,
          recent: recentMessages,
          averagePerSession: totalSessions > 0 ? totalMessages / totalSessions : 0,
        },
        snapshots: {
          total: totalSnapshots,
          recent: recentSnapshots,
          averagePerSession: totalSessions > 0 ? totalSnapshots / totalSessions : 0,
        },
        interactions: {
          total: totalInteractions,
          recent: recentInteractions,
          averagePerSession: totalSessions > 0 ? totalInteractions / totalSessions : 0,
        },
      },
    };
  },
});

/**
 * Identify slow queries and performance bottlenecks
 */
export const analyzeQueryPerformance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    
    // Analyze data distribution to identify potential performance issues
    const [sessions, folders, messages] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      // Sample some messages to analyze distribution
      ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .take(1000), // Sample recent 1000 interactions
    ]);
    
    const recommendations = [];
    const warnings = [];
    
    // Check for sessions with very large context data
    const largeSessions = sessions.filter(session => {
      if (session.context_data) {
        const contextSize = JSON.stringify(session.context_data).length;
        return contextSize > 100000; // 100KB threshold
      }
      return false;
    });
    
    if (largeSessions.length > 0) {
      warnings.push(`${largeSessions.length} sessions have very large context data (>100KB)`);
      recommendations.push("Consider implementing context data compression or archival");
    }
    
    // Check for old sessions that could be archived
    const oldSessions = sessions.filter(session => {
      const ageInDays = (Date.now() - session.created_at) / (24 * 60 * 60 * 1000);
      return ageInDays > 90 && !session.ended_at;
    });
    
    if (oldSessions.length > 0) {
      recommendations.push(`${oldSessions.length} sessions older than 90 days could be archived`);
    }
    
    // Check for folders with too many sessions
    const busyFolders = [];
    for (const folder of folders) {
      const folderSessions = sessions.filter(s => s.folder_id === folder._id);
      if (folderSessions.length > 100) {
        busyFolders.push({
          folderId: folder._id,
          name: folder.name,
          sessionCount: folderSessions.length,
        });
      }
    }
    
    if (busyFolders.length > 0) {
      recommendations.push("Consider splitting large folders with many sessions");
    }
    
    // Check message distribution
    const sessionMessageCounts = new Map();
    for (const message of messages) {
      const count = sessionMessageCounts.get(message.session_id) || 0;
      sessionMessageCounts.set(message.session_id, count + 1);
    }
    
    const heavySessions = Array.from(sessionMessageCounts.entries())
      .filter(([_, count]) => count > 1000)
      .map(([sessionId, count]) => ({ sessionId, messageCount: count }));
    
    if (heavySessions.length > 0) {
      warnings.push(`${heavySessions.length} sessions have >1000 messages`);
      recommendations.push("Consider implementing message pagination or archival");
    }
    
    return {
      analysis: {
        totalSessions: sessions.length,
        totalFolders: folders.length,
        sampledMessages: messages.length,
        largeSessions: largeSessions.length,
        oldSessions: oldSessions.length,
        busyFolders: busyFolders.length,
        heavySessions: heavySessions.length,
      },
      warnings,
      recommendations,
      details: {
        busyFolders,
        heavySessions,
      },
    };
  },
});

/**
 * Clean up old and unused data
 */
export const cleanupOldData = mutation({
  args: {
    archiveOlderThanDays: v.optional(v.number()),
    deleteOlderThanDays: v.optional(v.number()),
    cleanupOrphanedData: v.optional(v.boolean()),
    compressLargeContexts: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { 
    archiveOlderThanDays = 90,
    deleteOlderThanDays = 365,
    cleanupOrphanedData = true,
    compressLargeContexts = false,
    dryRun = true 
  }) => {
    const userId = await requireAuth(ctx);
    
    const now = Date.now();
    const archiveCutoff = now - (archiveOlderThanDays * 24 * 60 * 60 * 1000);
    const deleteCutoff = now - (deleteOlderThanDays * 24 * 60 * 60 * 1000);
    
    const operations = [];
    let totalSavings = 0;
    
    // Find sessions to archive
    const sessionsToArchive = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .filter((q) => q.lt(q.field("updated_at"), archiveCutoff))
      .filter((q) => q.eq(q.field("ended_at"), undefined))
      .collect();
    
    if (sessionsToArchive.length > 0) {
      operations.push({
        operation: "archive_old_sessions",
        count: sessionsToArchive.length,
        description: `Archive ${sessionsToArchive.length} sessions older than ${archiveOlderThanDays} days`,
      });
      
      if (!dryRun) {
        for (const session of sessionsToArchive) {
          await ctx.db.patch(session._id, {
            analysis_status: "archived",
            ended_at: now,
            updated_at: now,
          });
        }
      }
    }
    
    // Find very old sessions to delete
    const sessionsToDelete = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .filter((q) => q.lt(q.field("created_at"), deleteCutoff))
      .filter((q) => q.eq(q.field("analysis_status"), "archived"))
      .collect();
    
    if (sessionsToDelete.length > 0) {
      operations.push({
        operation: "delete_archived_sessions",
        count: sessionsToDelete.length,
        description: `Delete ${sessionsToDelete.length} archived sessions older than ${deleteOlderThanDays} days`,
      });
      
      if (!dryRun) {
        for (const session of sessionsToDelete) {
          // Delete related data first
          const messages = await ctx.db
            .query("session_messages")
            .withIndex("by_session_created", (q) => q.eq("session_id", session._id))
            .collect();
          
          for (const message of messages) {
            await ctx.db.delete(message._id);
          }
          
          // Delete the session
          await ctx.db.delete(session._id);
        }
      }
    }
    
    // Clean up orphaned data
    if (cleanupOrphanedData) {
      // Find messages without valid sessions
      const allUserSessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect();
      
      const validSessionIds = new Set(allUserSessions.map(s => s._id));
      
      // Check for orphaned messages (this is a simplified check)
      const recentMessages = await ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .take(1000);
      
      const orphanedMessages = recentMessages.filter(msg => 
        !validSessionIds.has(msg.session_id as any)
      );
      
      if (orphanedMessages.length > 0) {
        operations.push({
          operation: "cleanup_orphaned_messages",
          count: orphanedMessages.length,
          description: `Clean up ${orphanedMessages.length} orphaned messages`,
        });
        
        if (!dryRun) {
          for (const message of orphanedMessages) {
            await ctx.db.delete(message._id);
          }
        }
      }
    }
    
    // Compress large contexts
    if (compressLargeContexts) {
      const largeSessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(sessions => sessions.filter(session => {
          if (session.context_data) {
            const contextSize = JSON.stringify(session.context_data).length;
            return contextSize > 50000; // 50KB threshold
          }
          return false;
        }));
      
      if (largeSessions.length > 0) {
        operations.push({
          operation: "compress_large_contexts",
          count: largeSessions.length,
          description: `Compress context data for ${largeSessions.length} sessions`,
        });
        
        if (!dryRun) {
          for (const session of largeSessions) {
            // Simplified compression: remove conversation history but keep essential data
            const compressedContext = {
              ...session.context_data,
              conversation_history: [], // Clear history
              recent_uploads: [], // Clear upload history
              tool_usage_stats: {}, // Clear stats
              compressed_at: now,
            };
            
            await ctx.db.patch(session._id, {
              context_data: compressedContext,
              updated_at: now,
            });
          }
        }
      }
    }
    
    return {
      dryRun,
      totalOperations: operations.length,
      operations,
      estimatedSavings: totalSavings,
      timestamp: now,
    };
  },
});

/**
 * Optimize database indexes (recommendations)
 */
export const getIndexOptimizations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    
    // Analyze query patterns and suggest optimizations
    const recommendations = [];
    
    // Check for common query patterns
    const userSessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .take(100);
    
    // Analyze session access patterns
    const sessionsByFolder = new Map();
    const sessionsByDate = new Map();
    
    for (const session of userSessions) {
      // Count sessions by folder
      const folderCount = sessionsByFolder.get(session.folder_id) || 0;
      sessionsByFolder.set(session.folder_id, folderCount + 1);
      
      // Count sessions by date (day)
      const day = new Date(session.created_at).toDateString();
      const dayCount = sessionsByDate.get(day) || 0;
      sessionsByDate.set(day, dayCount + 1);
    }
    
    // Generate recommendations based on patterns
    if (sessionsByFolder.size > 10) {
      recommendations.push({
        type: "index",
        table: "sessions",
        field: "folder_id",
        reason: "High folder diversity suggests folder-based queries are common",
        priority: "high",
        existing: true, // We already have this index
      });
    }
    
    recommendations.push({
      type: "index",
      table: "sessions",
      field: "analysis_status",
      reason: "Filtering by analysis status is common for data management",
      priority: "medium",
      existing: false,
    });
    
    recommendations.push({
      type: "compound_index",
      table: "sessions",
      fields: ["user_id", "ended_at"],
      reason: "Querying for active sessions by user is common",
      priority: "high",
      existing: false,
    });
    
    recommendations.push({
      type: "compound_index",
      table: "session_messages",
      fields: ["session_id", "role"],
      reason: "Filtering messages by role within sessions improves conversation queries",
      priority: "medium",
      existing: false,
    });
    
    recommendations.push({
      type: "index",
      table: "folders",
      field: "vector_store_id",
      reason: "Querying folders by vector store for AI operations",
      priority: "medium",
      existing: true, // We already have this index
    });
    
    return {
      currentIndexes: [
        { table: "sessions", field: "user_id", type: "single" },
        { table: "sessions", field: "folder_id", type: "single" },
        { table: "folders", field: "user_id", type: "single" },
        { table: "folders", field: "vector_store_id", type: "single" },
        { table: "session_messages", fields: ["session_id", "turn_no"], type: "compound" },
        { table: "session_messages", fields: ["session_id", "created_at"], type: "compound" },
        { table: "whiteboard_snapshots", fields: ["session_id", "snapshot_index"], type: "compound" },
        { table: "interaction_logs", fields: ["session_id", "created_at"], type: "compound" },
      ],
      recommendations,
      summary: {
        totalRecommendations: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === "high").length,
        mediumPriority: recommendations.filter(r => r.priority === "medium").length,
        lowPriority: recommendations.filter(r => r.priority === "low").length,
      },
    };
  },
});

/**
 * Get storage usage statistics
 */
export const getStorageUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    
    // Get all user data and estimate storage usage
    const [sessions, folders, messages, snapshots, interactions, files] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect()
        .then(async (sessions) => {
          let totalSnapshots = 0;
          for (const session of sessions) {
            const snapshots = await ctx.db
              .query("whiteboard_snapshots")
              .withIndex("by_session_created", (q) => q.eq("session_id", session._id))
              .collect();
            totalSnapshots += snapshots.length;
          }
          return totalSnapshots;
        }),
      
      ctx.db
        .query("interaction_logs")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
      
      ctx.db
        .query("uploaded_files")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect(),
    ]);
    
    // Estimate storage sizes (in bytes)
    const sessionStorage = sessions.reduce((total, session) => {
      const contextSize = session.context_data ? 
        JSON.stringify(session.context_data).length * 2 : 0; // UTF-16 approximation
      return total + contextSize + 500; // Base metadata size
    }, 0);
    
    const folderStorage = folders.reduce((total, folder) => {
      const kbSize = folder.knowledge_base ? folder.knowledge_base.length * 2 : 0;
      return total + kbSize + 200; // Base metadata size
    }, 0);
    
    const messageStorage = messages.reduce((total, message) => {
      return total + (message.content?.length || 0) * 2 + 300; // Content + metadata
    }, 0);
    
    const interactionStorage = interactions.reduce((total, interaction) => {
      return total + interaction.content.length * 2 + 200; // Content + metadata
    }, 0);
    
    const snapshotStorage = snapshots * 5000; // Estimated 5KB per snapshot
    
    const totalStorage = sessionStorage + folderStorage + messageStorage + 
                        interactionStorage + snapshotStorage;
    
    return {
      breakdown: {
        sessions: {
          count: sessions.length,
          storage: sessionStorage,
          percentage: totalStorage > 0 ? (sessionStorage / totalStorage) * 100 : 0,
        },
        folders: {
          count: folders.length,
          storage: folderStorage,
          percentage: totalStorage > 0 ? (folderStorage / totalStorage) * 100 : 0,
        },
        messages: {
          count: messages.length,
          storage: messageStorage,
          percentage: totalStorage > 0 ? (messageStorage / totalStorage) * 100 : 0,
        },
        interactions: {
          count: interactions.length,
          storage: interactionStorage,
          percentage: totalStorage > 0 ? (interactionStorage / totalStorage) * 100 : 0,
        },
        snapshots: {
          count: snapshots,
          storage: snapshotStorage,
          percentage: totalStorage > 0 ? (snapshotStorage / totalStorage) * 100 : 0,
        },
        files: {
          count: files.length,
          // File storage is handled separately (Supabase/external)
          storage: 0,
          percentage: 0,
        },
      },
      totals: {
        totalItems: sessions.length + folders.length + messages.length + 
                    interactions.length + snapshots + files.length,
        totalStorage,
        formattedSize: formatBytes(totalStorage),
      },
      recommendations: generateStorageRecommendations(
        sessionStorage, folderStorage, messageStorage, 
        interactionStorage, snapshotStorage, totalStorage
      ),
    };
  },
});

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to generate storage recommendations
function generateStorageRecommendations(
  sessionStorage: number,
  folderStorage: number,
  messageStorage: number,
  interactionStorage: number,
  snapshotStorage: number,
  totalStorage: number
): string[] {
  const recommendations = [];
  
  if (sessionStorage / totalStorage > 0.5) {
    recommendations.push("Session contexts are using >50% of storage. Consider context compression.");
  }
  
  if (messageStorage / totalStorage > 0.3) {
    recommendations.push("Messages are using >30% of storage. Consider message archival.");
  }
  
  if (snapshotStorage / totalStorage > 0.4) {
    recommendations.push("Whiteboard snapshots are using >40% of storage. Consider snapshot cleanup.");
  }
  
  if (folderStorage / totalStorage > 0.3) {
    recommendations.push("Folder knowledge bases are using >30% of storage. Consider KB optimization.");
  }
  
  if (totalStorage > 100 * 1024 * 1024) { // 100MB
    recommendations.push("Total storage usage is high. Consider implementing data lifecycle management.");
  }
  
  return recommendations;
} 