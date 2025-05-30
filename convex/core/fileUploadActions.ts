"use node";

import { action, mutation } from "../_generated/server";
import { v } from "convex/values";
import { FileUploadManager } from "./fileUploadManager";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

export const processUploadedFilesForSession = action({
  args: {
    sessionId: v.id("sessions"),
    uploadedFileInfos: v.array(v.object({
      filename: v.string(),
      mimeType: v.string(),
      content: v.string(), // Base64 encoded
    })),
  },
  handler: async (ctx, { sessionId, uploadedFileInfos }: {
    sessionId: Id<"sessions">;
    uploadedFileInfos: Array<{ filename: string; mimeType: string; content: string }>;
  }): Promise<any> => {
    console.log(`[Action] Processing ${uploadedFileInfos.length} uploaded files for session ${sessionId}`);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConvexError("OpenAI API key not configured");
    }

    const session: any = await ctx.runQuery("functions:getSession" as any, { sessionId });
    if (!session || !session.user_id) {
      throw new Error(`Session ${sessionId} not found or missing user_id`);
    }

    const existingVectorStoreId = session.context_data?.vector_store_id || undefined;
    const manager = new FileUploadManager(apiKey, existingVectorStoreId);

    const results: Array<{ filename: string; success: boolean; error?: string; openAIFileId?: string; vectorStoreId?: string }> = [];
    const processedFilenamesForContext: string[] = [];

    for (const fileInfo of uploadedFileInfos) {
      let openAIFileId: string | undefined = undefined;
      let vsIdForFile: string | undefined = undefined;
      try {
        // Convert base64 content to Uint8Array
        const base64Content = fileInfo.content.split(',')[1] || fileInfo.content;
        const fileContentArray = new Uint8Array(Buffer.from(base64Content, 'base64'));

        const uploadResult = await manager.uploadAndProcessFile(
          fileContentArray,
          fileInfo.filename,
          session.user_id,
          session.folder_id || 'temp-folder-id',
          manager.getVectorStoreId(),
        );
        openAIFileId = uploadResult.fileId;
        vsIdForFile = uploadResult.vectorStoreId;

        await ctx.runMutation("functions:insertUploadedFile" as any, {
          supabasePath: `direct_upload://${fileInfo.filename}`,
          userId: session.user_id,
          folderId: session.folder_id || "default_folder_id_placeholder",
          embeddingStatus: 'completed',
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          vectorStoreId: uploadResult.vectorStoreId || "default_vector_store_id",
          fileId: uploadResult.fileId || "default_file_id",
          sessionId: sessionId,
        });

        results.push({ filename: fileInfo.filename, success: true, openAIFileId, vectorStoreId: vsIdForFile });
        processedFilenamesForContext.push(fileInfo.filename);
      } catch (error) {
        console.error(`[Action] Error processing file ${fileInfo.filename}:`, error);
        results.push({ filename: fileInfo.filename, success: false, error: (error as Error).message });
        await ctx.runMutation("functions:insertUploadedFile" as any, {
          supabasePath: `direct_upload://${fileInfo.filename}`,
          userId: session.user_id,
          folderId: session.folder_id || "default_folder_id_placeholder",
          embeddingStatus: 'failed',
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          sessionId: sessionId,
          vectorStoreId: "failed_upload",
          fileId: "failed_upload",
        });
      }
    }

    const finalVectorStoreId = manager.getVectorStoreId();
    let overallStatus = "completed";
    if (results.some(r => !r.success)) {
        overallStatus = results.every(r => !r.success) ? "failed" : "partial_failure";
    }

    const currentContext = session.context_data || {};
    const updatedFilePaths = Array.from(new Set([
        ...(currentContext.uploaded_file_paths || []),
        ...processedFilenamesForContext
    ]));

    const updatedSessionContext = {
      ...currentContext,
      uploaded_file_paths: updatedFilePaths,
      vector_store_id: finalVectorStoreId,
    };

    await ctx.runMutation("functions:updateSessionContext" as any, {
      sessionId: sessionId,
      context: updatedSessionContext,
    });

    if (session.folder_id && finalVectorStoreId) {
      await ctx.runMutation("functions:updateFolderVectorStore" as any, {
        folderId: session.folder_id as Id<'folders'>,
        vectorStoreId: finalVectorStoreId,
      });
    }
    
    let analysisStepMessage = "Document analysis will proceed if files were successfully processed by OpenAI.";
    if (finalVectorStoreId && (overallStatus === "completed" || overallStatus === "partial_failure")) {
        if (results.some(r => r.success && r.vectorStoreId)) {
            try {
                console.log(`[Action] Triggering document analysis for vector store: ${finalVectorStoreId}`);
                const analysisActionResponse = await ctx.runAction("agents/actions:analyzeDocuments" as any, {
                    sessionId: sessionId,
                    userId: session.user_id,
                    vectorStoreId: finalVectorStoreId,
                    folderId: session.folder_id,
                });

                if (analysisActionResponse.success && analysisActionResponse.data) {
                    analysisStepMessage = (analysisActionResponse.data as any).analysis_text || "Analysis complete, no text summary returned by agent.";
                } else {
                    analysisStepMessage = `Analysis step failed: ${analysisActionResponse.error}`;
                    if (overallStatus === "completed") overallStatus = "analysis_failed";
                }
            } catch (analysisError) {
                console.error(`[Action] Document analysis step failed catastrophically:`, analysisError);
                analysisStepMessage = `Document analysis step threw an error: ${(analysisError as Error).message}`;
                if (overallStatus === "completed") overallStatus = "analysis_failed";
            }
        } else {
             analysisStepMessage = "No files were successfully added to a vector store; skipping analysis.";
             if (overallStatus === "completed") overallStatus = "no_files_for_analysis";
        }
    }

    return {
      vector_store_id: finalVectorStoreId,
      files_received: results.filter(r => r.success).map(r => r.filename),
      analysis_status: overallStatus,
      message: analysisStepMessage,
    };
  },
}); 