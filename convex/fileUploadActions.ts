"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { FileUploadManager } from "./fileUploadManager";
import { Id } from "./_generated/dataModel";

export const processUploadedFilesForSession = action({
  args: {
    sessionId: v.id('sessions'),
    uploadedFileInfos: v.array(v.object({
      storageId: v.id('_storage'),
      filename: v.string(),
      mimeType: v.string(),
    })),
  },
  handler: async (ctx, { sessionId, uploadedFileInfos }) => {
    console.log(`[Action] Processing ${uploadedFileInfos.length} uploaded files for session ${sessionId}`);
    const session = await ctx.runQuery(api.functions.getSessionEnhanced, { sessionId });
    if (!session || !session.user_id) {
      throw new Error(`Session ${sessionId} not found or missing user_id`);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY not set in Convex action environment.");
      throw new Error('Missing OPENAI_API_KEY for file processing.');
    }

    const existingVectorStoreId = session.context_data?.vector_store_id || undefined;
    const manager = new FileUploadManager(apiKey, existingVectorStoreId);

    const results: Array<{ filename: string; success: boolean; error?: string; openAIFileId?: string; vectorStoreId?: string }> = [];
    const processedFilenamesForContext: string[] = [];

    for (const fileInfo of uploadedFileInfos) {
      let openAIFileId: string | undefined = undefined;
      let vsIdForFile: string | undefined = undefined;
      try {
        const fileContentBlob = await ctx.storage.get(fileInfo.storageId);
        if (!fileContentBlob) {
          throw new Error(`File content not found in Convex storage for ${fileInfo.filename}`);
        }
        const fileContentArray = new Uint8Array(await fileContentBlob.arrayBuffer());

        const uploadResult = await manager.uploadAndProcessFile(
          fileContentArray,
          fileInfo.filename,
          session.user_id,
          session.folder_id || 'temp-folder-id',
          manager.getVectorStoreId(),
        );
        openAIFileId = uploadResult.fileId;
        vsIdForFile = uploadResult.vectorStoreId;

        await ctx.runMutation(api.functions.insertUploadedFile, {
          supabasePath: `convex_storage://${fileInfo.storageId}`,
          userId: session.user_id,
          folderId: session.folder_id || "default_folder_id_placeholder",
          embeddingStatus: 'completed',
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          vectorStoreId: uploadResult.vectorStoreId,
          fileId: uploadResult.fileId,
        });

        results.push({ filename: fileInfo.filename, success: true, openAIFileId, vectorStoreId: vsIdForFile });
        processedFilenamesForContext.push(fileInfo.filename);
      } catch (error) {
        console.error(`[Action] Error processing file ${fileInfo.filename}:`, error);
        results.push({ filename: fileInfo.filename, success: false, error: (error as Error).message });
        await ctx.runMutation(api.functions.insertUploadedFile, {
          supabasePath: `convex_storage://${fileInfo.storageId}`,
          userId: session.user_id,
          folderId: session.folder_id || "default_folder_id_placeholder",
          embeddingStatus: 'failed',
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
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

    await ctx.runMutation(api.functions.updateSessionContextEnhanced, {
      sessionId: sessionId,
      context: updatedSessionContext,
    });

    if (session.folder_id && finalVectorStoreId) {
      await ctx.runMutation(api.functions.updateFolderVectorStore, {
        folderId: session.folder_id as Id<'folders'>,
        vectorStoreId: finalVectorStoreId,
      });
    }
    
    let analysisStepMessage = "Document analysis will proceed if files were successfully processed by OpenAI.";
    if (finalVectorStoreId && (overallStatus === "completed" || overallStatus === "partial_failure")) {
        if (results.some(r => r.success && r.vectorStoreId)) {
            try {
                console.log(`[Action] Triggering document analysis for vector store: ${finalVectorStoreId}`);
                // TODO: Re-enable once aiAgents API is properly resolved
                // const analysisActionResponse = await ctx.runAction(api.aiAgents.analyzeDocuments, {
                //     sessionId: sessionId,
                //     userId: session.user_id,
                //     vectorStoreId: finalVectorStoreId,
                //     folderId: session.folder_id,
                // });

                // if (analysisActionResponse.success && analysisActionResponse.data) {
                //     analysisStepMessage = (analysisActionResponse.data as any).analysis_text || "Analysis complete, no text summary returned by agent.";
                // } else {
                //     analysisStepMessage = `Analysis step failed: ${analysisActionResponse.error}`;
                //     if (overallStatus === "completed") overallStatus = "analysis_failed";
                // }

                // For now, skip analysis but mark as successful
                analysisStepMessage = "Files processed successfully. Document analysis will be enabled in next phase.";
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