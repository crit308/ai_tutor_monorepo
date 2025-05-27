import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Test action to verify document analysis functionality
export const testDocumentAnalysis = action({
  args: {
    vectorStoreId: v.string(),
    sessionId: v.id("sessions"),
    userId: v.string(),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, { vectorStoreId, sessionId, userId, folderId }) => {
    console.log(`[Test] Testing document analysis for vector store: ${vectorStoreId}`);
    
    try {
      // Call the analysis action
      const result = await ctx.runAction(api.aiAgents.analyzeDocuments, {
        sessionId,
        userId,
        vectorStoreId,
        folderId,
      });
      
      console.log("[Test] Analysis result:", result);
      
      // If successful and we have folder ID, test the knowledge base update
      if (result.success && result.data && folderId) {
        const analysisText = (result.data as any).analysis_text;
        if (analysisText) {
          const updateResult = await ctx.runMutation(api.folderCrud.updateKnowledgeBase, {
            folderId,
            knowledgeBase: analysisText,
          });
          console.log("[Test] Knowledge base update result:", updateResult);
        }
      }
      
      return {
        success: true,
        message: "Document analysis test completed successfully",
        data: result,
      };
      
    } catch (error) {
      console.error("[Test] Document analysis test failed:", error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  },
}); 