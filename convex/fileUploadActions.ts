"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import path from "path";
import { api } from "./_generated/api";
import { FileUploadManager } from "./fileUploadManager";

export const uploadSessionDocuments = action({
  args: {
    sessionId: v.id('sessions'),
    filenames: v.array(v.string()),
  },
  handler: async (ctx, { sessionId, filenames }) => {
    // Get the session and verify access through a query
    const session = await ctx.runQuery(api.functions.getSession, { sessionId });
    if (!session) {
      throw new Error('Session not found');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

    const manager = new FileUploadManager(apiKey);
    const uploadDir = process.env.UPLOAD_DIR || '/tmp';
    const processed: string[] = [];
    
    for (const name of filenames) {
      const filePath = path.join(uploadDir, name);
      const info = await manager.uploadAndProcessFile(
        filePath,
        session.user_id,
        session.folder_id ?? '',
        manager.getVectorStoreId(),
      );
      
      // Insert uploaded file record through mutation
      await ctx.runMutation(api.functions.insertUploadedFile, {
        supabasePath: info.supabasePath,
        userId: session.user_id,
        folderId: session.folder_id ?? '',
        embeddingStatus: 'completed',
      });
      
      processed.push(info.filename);
    }

    // Update folder with vector store ID if applicable
    if (session.folder_id) {
      await ctx.runMutation(api.functions.updateFolderVectorStore, {
        folderId: session.folder_id,
        vectorStoreId: manager.getVectorStoreId() || '',
      });
    }

    // Update session analysis status
    await ctx.runMutation(api.functions.updateSessionAnalysisStatus, {
      sessionId,
      status: 'completed',
    });

    return {
      vector_store_id: manager.getVectorStoreId(),
      files_received: processed,
      analysis_status: 'completed',
      message: 'Files processed',
    };
  },
}); 