import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/server";

export interface DocumentProcessingResult {
  success: boolean;
  vectorStoreId?: string;
  fileId?: string;
  filename: string;
  error?: string;
  processingTimeMs: number;
}

export interface BatchProcessingStatus {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  inProgress: boolean;
  results: DocumentProcessingResult[];
  overallSuccess: boolean;
}

// --- Document Processing Actions ---

export const processDocumentBatch = action({
  args: {
    sessionId: v.id("sessions"),
    files: v.array(v.object({
      filename: v.string(),
      content: v.string(), // Base64 encoded
      mimeType: v.string(),
    })),
    queueEmbedding: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BatchProcessingStatus> => {
    const startTime = Date.now();
    const results: DocumentProcessingResult[] = [];
    let vectorStoreId: string | undefined;

    // Get session to ensure it exists
    const session = await ctx.runQuery(api.sessionCrud.getSession, {
      sessionId: args.sessionId,
    });

    if (!session) {
      throw new ConvexError("Session not found");
    }

    // Process each file
    for (const file of args.files) {
      const fileStartTime = Date.now();
      
      try {
        const result = await processIndividualDocument(ctx, {
          sessionId: args.sessionId,
          file,
          existingVectorStoreId: vectorStoreId,
          queueEmbedding: args.queueEmbedding,
        });

        results.push({
          success: true,
          vectorStoreId: result.vectorStoreId,
          fileId: result.fileId,
          filename: file.filename,
          processingTimeMs: Date.now() - fileStartTime,
        });

        // Update vector store ID for subsequent files
        if (result.vectorStoreId) {
          vectorStoreId = result.vectorStoreId;
        }

      } catch (error) {
        results.push({
          success: false,
          filename: file.filename,
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs: Date.now() - fileStartTime,
        });
      }
    }

    // Update session with processing results
    const successfulFiles = results.filter(r => r.success);
    if (successfulFiles.length > 0) {
      await ctx.runMutation(api.sessionCrud.updateSessionContext, {
        sessionId: args.sessionId,
        context: {
          ...session.context,
          uploaded_file_paths: [
            ...(session.context?.uploaded_file_paths || []),
            ...successfulFiles.map(r => r.filename),
          ],
          vector_store_id: vectorStoreId,
          last_upload_batch: {
            timestamp: Date.now(),
            totalFiles: args.files.length,
            successfulFiles: successfulFiles.length,
            processingTimeMs: Date.now() - startTime,
          },
        },
      });
    }

    // Log batch processing analytics
    await ctx.runMutation(api.functions.insertInteractionLog, {
      sessionId: args.sessionId,
      interactionType: "document_batch_upload",
      data: {
        totalFiles: args.files.length,
        successfulFiles: successfulFiles.length,
        failedFiles: results.filter(r => !r.success).length,
        processingTimeMs: Date.now() - startTime,
        vectorStoreId,
      },
    });

    return {
      totalFiles: args.files.length,
      processedFiles: successfulFiles.length,
      failedFiles: results.filter(r => !r.success).length,
      inProgress: false,
      results,
      overallSuccess: successfulFiles.length === args.files.length,
    };
  },
});

// Helper function for processing individual documents
async function processIndividualDocument(
  ctx: any,
  args: {
    sessionId: Id<"sessions">;
    file: { filename: string; content: string; mimeType: string };
    existingVectorStoreId?: string;
    queueEmbedding?: boolean;
  }
): Promise<{ vectorStoreId?: string; fileId?: string }> {
  // For now, simulate document processing
  // In a real implementation, this would:
  // 1. Decode base64 content
  // 2. Upload to OpenAI files endpoint
  // 3. Create/update vector store
  // 4. Add file to vector store
  // 5. Poll for processing completion

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));

  const vectorStoreId = args.existingVectorStoreId || `vs_${Date.now()}_${Math.random()}`;
  const fileId = `file_${Date.now()}_${Math.random()}`;

  // Store file metadata
  await ctx.runMutation(insertUploadedFileRecord, {
    sessionId: args.sessionId,
    filename: args.file.filename,
    mimeType: args.file.mimeType,
    vectorStoreId,
    fileId,
    embeddingStatus: args.queueEmbedding ? "pending" : "completed",
  });

  return { vectorStoreId, fileId };
}

// --- Document Analysis Pipeline ---

export const analyzeDocumentContent = action({
  args: {
    sessionId: v.id("sessions"),
    vectorStoreId: v.string(),
    analysisType: v.optional(v.union(
      v.literal("content_summary"),
      v.literal("learning_objectives"),
      v.literal("difficulty_assessment"),
      v.literal("full_analysis")
    )),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.sessionCrud.getSession, {
      sessionId: args.sessionId,
    });

    if (!session) {
      throw new ConvexError("Session not found");
    }

    const analysisType = args.analysisType || "full_analysis";
    
    try {
      // Trigger document analysis using AI agents
      const analysis = await ctx.runAction(api.aiAgents.analyzeDocuments, {
        vector_store_id: args.vectorStoreId,
        session_id: args.sessionId,
        analysis_type: analysisType,
      });

      // Update session with analysis results
      await ctx.runMutation(api.sessionCrud.updateSessionContext, {
        sessionId: args.sessionId,
        context: {
          ...session.context,
          analysis_result: analysis,
          analysis_completed_at: Date.now(),
          analysis_type: analysisType,
        },
      });

      // Log analysis completion
      await ctx.runMutation(api.functions.insertInteractionLog, {
        sessionId: args.sessionId,
        interactionType: "document_analysis",
        data: {
          vectorStoreId: args.vectorStoreId,
          analysisType,
          analysisSize: JSON.stringify(analysis).length,
          completedAt: Date.now(),
        },
      });

      return analysis;
    } catch (error) {
      throw new ConvexError(`Document analysis failed: ${error}`);
    }
  },
});

// --- File Metadata Management ---

export const insertUploadedFileRecord = mutation({
  args: {
    sessionId: v.id("sessions"),
    filename: v.string(),
    mimeType: v.string(),
    vectorStoreId: v.string(),
    fileId: v.string(),
    embeddingStatus: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("uploaded_files", {
      session_id: args.sessionId,
      filename: args.filename,
      mime_type: args.mimeType,
      vector_store_id: args.vectorStoreId,
      file_id: args.fileId,
      embedding_status: args.embeddingStatus,
      uploaded_at: Date.now(),
    });
  },
});

export const getSessionFiles = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("uploaded_files")
      .withIndex("by_session_id", (q) => q.eq("session_id", args.sessionId))
      .collect();

    return files.map(file => ({
      id: file._id,
      filename: file.filename,
      mimeType: file.mime_type,
      vectorStoreId: file.vector_store_id,
      fileId: file.file_id,
      embeddingStatus: file.embedding_status,
      uploadedAt: file.uploaded_at,
    }));
  },
});

// --- Document Processing Queue Management ---

export const processEmbeddingQueue = action({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 10;

    // Get pending embedding tasks
    const pendingFiles = await ctx.runQuery(getPendingEmbeddings, {
      limit: batchSize,
    });

    const results = [];

    for (const file of pendingFiles) {
      try {
        // Process the embedding
        // In real implementation, this would:
        // 1. Retrieve file from storage
        // 2. Upload to OpenAI
        // 3. Add to vector store
        // 4. Poll for completion

        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 50));

        // Update status to completed
        await ctx.runMutation(updateEmbeddingStatus, {
          fileId: file._id,
          status: "completed",
        });

        results.push({
          fileId: file._id,
          filename: file.filename,
          success: true,
        });

      } catch (error) {
        // Update status to failed
        await ctx.runMutation(updateEmbeddingStatus, {
          fileId: file._id,
          status: "failed",
        });

        results.push({
          fileId: file._id,
          filename: file.filename,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      processedCount: results.length,
      successCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results,
    };
  },
});

export const getPendingEmbeddings = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    return await ctx.db
      .query("uploaded_files")
      .withIndex("by_embedding_status", (q) => q.eq("embedding_status", "pending"))
      .order("asc")
      .take(limit);
  },
});

export const updateEmbeddingStatus = mutation({
  args: {
    fileId: v.id("uploaded_files"),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      embedding_status: args.status,
      processed_at: Date.now(),
    });
  },
});

// --- Document Processing Analytics ---

export const getDocumentProcessingStats = query({
  args: {
    sessionId: v.optional(v.id("sessions")),
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    let filesQuery = ctx.db.query("uploaded_files");

    if (args.sessionId) {
      filesQuery = filesQuery.withIndex("by_session_id", (q) => 
        q.eq("session_id", args.sessionId)
      );
    }

    const files = await filesQuery.collect();

    // Filter by time range if provided
    const filteredFiles = args.timeRange
      ? files.filter(f => 
          f.uploaded_at >= args.timeRange!.startTime && 
          f.uploaded_at <= args.timeRange!.endTime
        )
      : files;

    const stats = {
      totalFiles: filteredFiles.length,
      completedEmbeddings: filteredFiles.filter(f => f.embedding_status === "completed").length,
      pendingEmbeddings: filteredFiles.filter(f => f.embedding_status === "pending").length,
      failedEmbeddings: filteredFiles.filter(f => f.embedding_status === "failed").length,
      averageProcessingTime: 0,
      fileTypes: {} as Record<string, number>,
      uploadTrends: [] as Array<{ date: string; count: number }>,
    };

    // Calculate file type distribution
    filteredFiles.forEach(file => {
      const mimeType = file.mime_type || "unknown";
      stats.fileTypes[mimeType] = (stats.fileTypes[mimeType] || 0) + 1;
    });

    // Calculate upload trends (daily)
    const dailyUploads = new Map<string, number>();
    filteredFiles.forEach(file => {
      const date = new Date(file.uploaded_at).toISOString().split('T')[0];
      dailyUploads.set(date, (dailyUploads.get(date) || 0) + 1);
    });

    stats.uploadTrends = Array.from(dailyUploads.entries()).map(([date, count]) => ({
      date,
      count,
    })).sort((a, b) => a.date.localeCompare(b.date));

    return stats;
  },
});

// --- Document Content Extraction ---

export const extractDocumentContent = action({
  args: {
    fileId: v.string(),
    extractionType: v.optional(v.union(
      v.literal("text_only"),
      v.literal("structured"),
      v.literal("metadata"),
      v.literal("full")
    )),
  },
  handler: async (ctx, args) => {
    const extractionType = args.extractionType || "text_only";

    try {
      // In real implementation, this would:
      // 1. Retrieve file from OpenAI
      // 2. Extract content based on type
      // 3. Process and structure the content

      // Simulate content extraction
      const extractedContent = {
        fileId: args.fileId,
        extractionType,
        content: {
          text: "Simulated extracted text content...",
          metadata: {
            pages: 10,
            wordCount: 2500,
            language: "en",
          },
          structure: {
            headings: ["Introduction", "Chapter 1", "Conclusion"],
            sections: 3,
          },
        },
        extractedAt: Date.now(),
      };

      return extractedContent;
    } catch (error) {
      throw new ConvexError(`Content extraction failed: ${error}`);
    }
  },
}); 