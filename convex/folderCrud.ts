import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { 
  requireAuth, 
  checkRateLimit 
} from "./auth";

// ==========================================
// FOLDER CRUD OPERATIONS
// ==========================================

/**
 * Create a new folder with validation
 */
export const createFolder = mutation({
  args: { 
    name: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("folders")),
    metadata: v.optional(v.object({
      tags: v.optional(v.array(v.string())),
      subject: v.optional(v.string()),
      difficulty: v.optional(v.union(
        v.literal("beginner"),
        v.literal("intermediate"),
        v.literal("advanced")
      )),
    }))
  },
  handler: async (ctx, { name, description, parentFolderId, metadata }) => {
    const userId = await requireAuth(ctx);
    
    // Rate limiting for folder creation
    if (!checkRateLimit(userId, 20, 60000)) {
      throw new Error("Rate limit exceeded for folder creation");
    }
    
    // Validate folder name
    if (!name.trim() || name.length > 100) {
      throw new Error("Folder name must be between 1 and 100 characters");
    }
    
    // Check for duplicate folder names for the user
    const existingFolder = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .filter((q) => q.eq(q.field("name"), name.trim()))
      .first();
    
    if (existingFolder) {
      throw new Error("A folder with this name already exists");
    }
    
    // Verify parent folder ownership if specified
    if (parentFolderId) {
      const parentFolder = await ctx.db.get(parentFolderId);
      if (!parentFolder || parentFolder.user_id !== userId) {
        throw new Error("Parent folder not found or access denied");
      }
    }
    
    const now = Date.now();
    
    const folderId = await ctx.db.insert("folders", {
      user_id: userId,
      name: name.trim(),
      created_at: now,
      updated_at: now,
      vector_store_id: undefined,
      knowledge_base: undefined,
    });
    
    const folder = await ctx.db.get(folderId);
    return {
      id: folderId,
      ...folder,
    };
  },
});

/**
 * Get a specific folder with optional children
 */
export const getFolder = query({
  args: { 
    folderId: v.id("folders"),
    includeChildren: v.optional(v.boolean()),
    includeStats: v.optional(v.boolean()),
  },
  handler: async (ctx, { folderId, includeChildren = false, includeStats = false }) => {
    const userId = await requireAuth(ctx);
    
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      return null;
    }
    
    const result: any = {
      _id: folder._id,
      name: folder.name,
      user_id: folder.user_id,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
      vector_store_id: folder.vector_store_id,
      knowledge_base: folder.knowledge_base,
    };
    
    if (includeStats) {
      // Count sessions associated with this folder
      const sessionCount = await ctx.db
        .query("sessions")
        .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
        .collect()
        .then(sessions => sessions.length);
      
      // Count uploaded files
      const fileCount = await ctx.db
        .query("uploaded_files")
        .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
        .collect()
        .then(files => files.length);
      
      result.stats = {
        sessionCount,
        fileCount,
        hasKnowledgeBase: !!folder.knowledge_base,
        hasVectorStore: !!folder.vector_store_id,
      };
    }
    
    return result;
  },
});

/**
 * List user folders with filtering and pagination
 */
export const listFolders = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeStats: v.optional(v.boolean()),
    sortBy: v.optional(v.union(
      v.literal("name"),
      v.literal("created_at"),
      v.literal("updated_at")
    )),
    sortOrder: v.optional(v.union(
      v.literal("asc"),
      v.literal("desc")
    )),
  },
  handler: async (ctx, { 
    search, 
    limit = 50, 
    includeStats = false,
    sortBy = "updated_at",
    sortOrder = "desc"
  }) => {
    const userId = await requireAuth(ctx);
    
    let query = ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", userId));
    
    const folders = await query.collect();
    
    // Apply search filter
    let filteredFolders = folders;
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      filteredFolders = folders.filter(folder => 
        folder.name.toLowerCase().includes(searchTerm) ||
        (folder.knowledge_base && folder.knowledge_base.toLowerCase().includes(searchTerm))
      );
    }
    
    // Apply sorting
    filteredFolders.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "created_at":
          aValue = a.created_at;
          bValue = b.created_at;
          break;
        case "updated_at":
        default:
          aValue = a.updated_at;
          bValue = b.updated_at;
          break;
      }
      
      if (sortOrder === "desc") {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });
    
    // Apply limit
    const limitedFolders = filteredFolders.slice(0, limit);
    
    // Add stats if requested
    const result = await Promise.all(
      limitedFolders.map(async (folder) => {
        const folderData: any = {
          _id: folder._id,
          name: folder.name,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
          vector_store_id: folder.vector_store_id,
          knowledge_base: folder.knowledge_base,
        };
        
        if (includeStats) {
          const sessionCount = await ctx.db
            .query("sessions")
            .withIndex("by_folder", (q) => q.eq("folder_id", folder._id))
            .collect()
            .then(sessions => sessions.length);
          
          const fileCount = await ctx.db
            .query("uploaded_files")
            .withIndex("by_folder", (q) => q.eq("folder_id", folder._id))
            .collect()
            .then(files => files.length);
          
          folderData.stats = {
            sessionCount,
            fileCount,
            hasKnowledgeBase: !!folder.knowledge_base,
            hasVectorStore: !!folder.vector_store_id,
          };
        }
        
        return folderData;
      })
    );
    
    return {
      folders: result,
      hasMore: filteredFolders.length > limit,
      total: filteredFolders.length,
    };
  },
});

/**
 * Update folder information
 */
export const updateFolder = mutation({
  args: {
    folderId: v.id("folders"),
    updates: v.object({
      name: v.optional(v.string()),
      vectorStoreId: v.optional(v.string()),
      knowledgeBase: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { folderId, updates }) => {
    const userId = await requireAuth(ctx);
    
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      throw new Error("Folder not found or access denied");
    }
    
    const patchData: any = {
      updated_at: Date.now(),
    };
    
         // Validate and apply updates
     if (updates.name !== undefined) {
       if (!updates.name || !updates.name.trim() || updates.name.length > 100) {
         throw new Error("Folder name must be between 1 and 100 characters");
       }
       
       // Check for duplicate names (excluding current folder)
       const existingFolder = await ctx.db
         .query("folders")
         .withIndex("by_user", (q) => q.eq("user_id", userId))
         .filter((q) => q.eq(q.field("name"), updates.name!.trim()))
         .first();
      
      if (existingFolder && existingFolder._id !== folderId) {
        throw new Error("A folder with this name already exists");
      }
      
      patchData.name = updates.name.trim();
    }
    
    if (updates.vectorStoreId !== undefined) {
      patchData.vector_store_id = updates.vectorStoreId || undefined;
    }
    
    if (updates.knowledgeBase !== undefined) {
      patchData.knowledge_base = updates.knowledgeBase || undefined;
    }
    
    await ctx.db.patch(folderId, patchData);
    
    return { success: true };
  },
});

/**
 * Rename a folder
 */
export const renameFolder = mutation({
  args: { 
    folderId: v.id("folders"), 
    name: v.string() 
  },
  handler: async (ctx, { folderId, name }) => {
    const userId = await requireAuth(ctx);
    
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      throw new Error("Folder not found or access denied");
    }
    
    if (!name.trim() || name.length > 100) {
      throw new Error("Folder name must be between 1 and 100 characters");
    }
    
    // Check for duplicate names
    const existingFolder = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .filter((q) => q.eq(q.field("name"), name.trim()))
      .first();
    
    if (existingFolder && existingFolder._id !== folderId) {
      throw new Error("A folder with this name already exists");
    }
    
    await ctx.db.patch(folderId, { 
      name: name.trim(), 
      updated_at: Date.now() 
    });
    
    return { success: true };
  },
});

/**
 * Delete folder with options for cleanup
 */
export const deleteFolder = mutation({
  args: { 
    folderId: v.id("folders"),
    deleteRelatedData: v.optional(v.boolean()),
    reassignSessionsTo: v.optional(v.id("folders")),
  },
  handler: async (ctx, { folderId, deleteRelatedData = false, reassignSessionsTo }) => {
    const userId = await requireAuth(ctx);
    
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      throw new Error("Folder not found or access denied");
    }
    
    // Verify reassignment folder if specified
    if (reassignSessionsTo) {
      const targetFolder = await ctx.db.get(reassignSessionsTo);
      if (!targetFolder || targetFolder.user_id !== userId) {
        throw new Error("Target folder for reassignment not found or access denied");
      }
    }
    
    // Handle related sessions
    const relatedSessions = await ctx.db
      .query("sessions")
      .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
      .collect();
    
    if (relatedSessions.length > 0) {
      if (deleteRelatedData) {
        // Delete all related sessions (this will cascade delete their related data)
        for (const session of relatedSessions) {
          await ctx.db.delete(session._id);
        }
      } else if (reassignSessionsTo) {
        // Reassign sessions to another folder
        for (const session of relatedSessions) {
          await ctx.db.patch(session._id, {
            folder_id: reassignSessionsTo,
            updated_at: Date.now(),
          });
        }
      } else {
        // Clear folder reference but keep sessions
        for (const session of relatedSessions) {
          await ctx.db.patch(session._id, {
            folder_id: undefined,
            updated_at: Date.now(),
          });
        }
      }
    }
    
    // Handle uploaded files
    const uploadedFiles = await ctx.db
      .query("uploaded_files")
      .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
      .collect();
    
    if (deleteRelatedData && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        await ctx.db.delete(file._id);
      }
    } else if (reassignSessionsTo && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        await ctx.db.patch(file._id, {
          folder_id: reassignSessionsTo,
          updated_at: Date.now(),
        });
      }
    }
    
    // Finally delete the folder
    await ctx.db.delete(folderId);
    
    return { 
      success: true,
      deletedSessions: deleteRelatedData ? relatedSessions.length : 0,
      reassignedSessions: reassignSessionsTo ? relatedSessions.length : 0,
    };
  },
});

/**
 * Get folder usage statistics
 */
export const getFolderStats = query({
  args: { folderId: v.optional(v.id("folders")) },
  handler: async (ctx, { folderId }) => {
    const userId = await requireAuth(ctx);
    
    if (folderId) {
      // Stats for specific folder
      const folder = await ctx.db.get(folderId);
      if (!folder || folder.user_id !== userId) {
        return null;
      }
      
      const [sessions, files] = await Promise.all([
        ctx.db
          .query("sessions")
          .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
          .collect(),
        ctx.db
          .query("uploaded_files")
          .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
          .collect(),
      ]);
      
      const activeSessions = sessions.filter(s => !s.ended_at).length;
      const completedSessions = sessions.filter(s => s.ended_at).length;
      const totalStudyTime = sessions.reduce((total, session) => {
        if (session.ended_at && session.created_at) {
          return total + (session.ended_at - session.created_at);
        }
        return total;
      }, 0);
      
      return {
        folder: {
          _id: folder._id,
          name: folder.name,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
        },
        stats: {
          totalSessions: sessions.length,
          activeSessions,
          completedSessions,
          totalFiles: files.length,
          totalStudyTime,
          hasKnowledgeBase: !!folder.knowledge_base,
          hasVectorStore: !!folder.vector_store_id,
        }
      };
    } else {
      // Overall user stats
      const [allFolders, allSessions, allFiles] = await Promise.all([
        ctx.db
          .query("folders")
          .withIndex("by_user", (q) => q.eq("user_id", userId))
          .collect(),
        ctx.db
          .query("sessions")
          .withIndex("by_user", (q) => q.eq("user_id", userId))
          .collect(),
        ctx.db
          .query("uploaded_files")
          .withIndex("by_user", (q) => q.eq("user_id", userId))
          .collect(),
      ]);
      
      const foldersWithKB = allFolders.filter(f => f.knowledge_base).length;
      const foldersWithVS = allFolders.filter(f => f.vector_store_id).length;
      const activeSessions = allSessions.filter(s => !s.ended_at).length;
      
      return {
        overall: {
          totalFolders: allFolders.length,
          foldersWithKnowledgeBase: foldersWithKB,
          foldersWithVectorStore: foldersWithVS,
          totalSessions: allSessions.length,
          activeSessions,
          totalFiles: allFiles.length,
        }
      };
    }
  },
});

// ==========================================
// FOLDER DATA CONSISTENCY CHECKS
// ==========================================

/**
 * Validate folder data consistency
 */
export const validateFolderConsistency = query({
  args: { folderId: v.optional(v.id("folders")) },
  handler: async (ctx, { folderId }) => {
    const userId = await requireAuth(ctx);
    
    if (folderId) {
      // Validate specific folder
      const folder = await ctx.db.get(folderId);
      if (!folder || folder.user_id !== userId) {
        throw new Error("Folder not found or access denied");
      }
      
      const issues = [];
      
      // Check for orphaned sessions
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
        .collect();
      
      const orphanedSessions = sessions.filter(session => 
        session.user_id !== userId
      );
      
      if (orphanedSessions.length > 0) {
        issues.push(`${orphanedSessions.length} sessions belong to different users`);
      }
      
      // Check for orphaned files
      const files = await ctx.db
        .query("uploaded_files")
        .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
        .collect();
      
      const orphanedFiles = files.filter(file => file.user_id !== userId);
      
      if (orphanedFiles.length > 0) {
        issues.push(`${orphanedFiles.length} files belong to different users`);
      }
      
      // Check vector store consistency
      if (folder.vector_store_id) {
        const filesWithDifferentVS = files.filter(file => 
          // Note: files don't store vector_store_id in current schema
          // This would need to be added to the schema for full validation
          false
        );
      }
      
      return {
        valid: issues.length === 0,
        issues,
        metadata: {
          sessionCount: sessions.length,
          fileCount: files.length,
          orphanedSessions: orphanedSessions.length,
          orphanedFiles: orphanedFiles.length,
        }
      };
    } else {
      // Validate all user folders
      const folders = await ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .collect();
      
      const globalIssues = [];
      let totalOrphanedSessions = 0;
      let totalOrphanedFiles = 0;
      
      // Check for duplicate folder names
      const nameMap = new Map<string, number>();
      folders.forEach(folder => {
        const count = nameMap.get(folder.name) || 0;
        nameMap.set(folder.name, count + 1);
      });
      
      const duplicateNames = Array.from(nameMap.entries())
        .filter(([name, count]) => count > 1)
        .map(([name]) => name);
      
      if (duplicateNames.length > 0) {
        globalIssues.push(`Duplicate folder names: ${duplicateNames.join(", ")}`);
      }
      
      // Check each folder for orphaned data
      for (const folder of folders) {
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_folder", (q) => q.eq("folder_id", folder._id))
          .collect();
        
        const orphanedSessions = sessions.filter(s => s.user_id !== userId);
        totalOrphanedSessions += orphanedSessions.length;
        
        const files = await ctx.db
          .query("uploaded_files")
          .withIndex("by_folder", (q) => q.eq("folder_id", folder._id))
          .collect();
        
        const orphanedFiles = files.filter(f => f.user_id !== userId);
        totalOrphanedFiles += orphanedFiles.length;
      }
      
      if (totalOrphanedSessions > 0) {
        globalIssues.push(`${totalOrphanedSessions} total orphaned sessions`);
      }
      
      if (totalOrphanedFiles > 0) {
        globalIssues.push(`${totalOrphanedFiles} total orphaned files`);
      }
      
      return {
        valid: globalIssues.length === 0,
        issues: globalIssues,
        metadata: {
          totalFolders: folders.length,
          duplicateNames: duplicateNames.length,
          totalOrphanedSessions,
          totalOrphanedFiles,
        }
      };
    }
  },
});

/**
 * Repair folder data inconsistencies
 */
export const repairFolderData = mutation({
  args: { 
    folderId: v.optional(v.id("folders")),
    fixes: v.array(v.string()),
  },
  handler: async (ctx, { folderId, fixes }) => {
    const userId = await requireAuth(ctx);
    
    const applied = [];
    
    for (const fix of fixes) {
      switch (fix) {
        case "remove_orphaned_sessions":
          if (folderId) {
            const sessions = await ctx.db
              .query("sessions")
              .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
              .filter((q) => q.neq(q.field("user_id"), userId))
              .collect();
            
            for (const session of sessions) {
              await ctx.db.patch(session._id, {
                folder_id: undefined,
                updated_at: Date.now(),
              });
            }
            applied.push(`${fix}: ${sessions.length} sessions`);
          }
          break;
          
        case "remove_orphaned_files":
          if (folderId) {
            const files = await ctx.db
              .query("uploaded_files")
              .withIndex("by_folder", (q) => q.eq("folder_id", folderId))
              .filter((q) => q.neq(q.field("user_id"), userId))
              .collect();
            
            for (const file of files) {
              await ctx.db.delete(file._id);
            }
            applied.push(`${fix}: ${files.length} files`);
          }
          break;
          
        case "resolve_duplicate_names":
          const folders = await ctx.db
            .query("folders")
            .withIndex("by_user", (q) => q.eq("user_id", userId))
            .collect();
          
          const nameMap = new Map<string, any[]>();
          folders.forEach(folder => {
            const existing = nameMap.get(folder.name) || [];
            existing.push(folder);
            nameMap.set(folder.name, existing);
          });
          
          let renamedCount = 0;
          for (const [name, folderList] of nameMap.entries()) {
            if (folderList.length > 1) {
              // Keep the oldest folder with original name, rename others
              folderList.sort((a, b) => a.created_at - b.created_at);
              
              for (let i = 1; i < folderList.length; i++) {
                const newName = `${name} (${i})`;
                await ctx.db.patch(folderList[i]._id, {
                  name: newName,
                  updated_at: Date.now(),
                });
                renamedCount++;
              }
            }
          }
          applied.push(`${fix}: ${renamedCount} folders`);
          break;
      }
    }
    
    return { 
      success: true, 
      appliedFixes: applied 
    };
  },
}); 