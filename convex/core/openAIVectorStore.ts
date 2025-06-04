"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import OpenAI from "openai";

// --- Types ---
interface VectorStoreResult {
  vectorStoreId: string;
  fileId: string;
  filename: string;
  status: "completed" | "pending" | "failed";
  processingTimeMs: number;
}

interface VectorStoreResponse {
  vectorStoreId: string;
  processedFiles: Array<{
    filename: string;
    fileId: string;
    status: string;
    processingTimeMs: number;
  }>;
  totalProcessingTimeMs: number;
  analysis?: string;
}

/**
 * Create OpenAI vector store and process files for real embedding
 */
export const createVectorStoreAndProcessFiles = action({
  args: {
    sessionId: v.id("sessions"),
    files: v.array(v.object({
      filename: v.string(),
      content: v.string(), // Base64 encoded content
      mimeType: v.string(),
    })),
    folderId: v.optional(v.string()),
  },
  returns: v.object({
    vectorStoreId: v.string(),
    processedFiles: v.array(v.object({
      filename: v.string(),
      fileId: v.string(),
      status: v.string(),
      processingTimeMs: v.number(),
    })),
    totalProcessingTimeMs: v.number(),
    analysis: v.optional(v.string()),
  }),
  handler: async (ctx, { sessionId, files, folderId }): Promise<VectorStoreResponse> => {
    const startTime = Date.now();
    
    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConvexError("OpenAI API key not configured");
    }
    
    const openai = new OpenAI({ apiKey });
    
    // Get session data
    const session = await ctx.runQuery("functions:getSession" as any, { sessionId });
    if (!session) {
      throw new ConvexError("Session not found");
    }
    
    let vectorStoreId = session.context_data?.vector_store_id;
    const processedFiles: VectorStoreResult[] = [];
    
    try {
      // Step 1: Create vector store if it doesn't exist
      if (!vectorStoreId) {
        console.log("[OpenAI] Creating new vector store...");
        const vectorStore = await openai.vectorStores.create({
          name: `AI Tutor - ${folderId || session.user_id} - ${Date.now()}`,
          expires_after: {
            anchor: "last_active_at",
            days: 30
          }
        });
        vectorStoreId = vectorStore.id;
        console.log(`[OpenAI] Created vector store: ${vectorStoreId}`);
      }
      
      // Step 2: Process each file
      for (const file of files) {
        const fileStartTime = Date.now();
        
        try {
          console.log(`[OpenAI] Processing file: ${file.filename}`);
          
          // Handle content - assume it's already text since it comes from uploaded files
          // If it's base64, decode it using atob() which is available in browser/Node environment
          let textContent = file.content;
          if (file.content.includes(',')) {
            // If it's a data URL, extract the base64 part
            const base64Content = file.content.split(',')[1];
            try {
              textContent = atob(base64Content);
            } catch (e) {
              // If atob fails, use the content as-is
              textContent = file.content;
            }
          }
          
          // Create File object for OpenAI using text content directly
          const fileBlob = new File([textContent], file.filename, {
            type: file.mimeType || 'text/plain'
          });
          
          // Upload file to OpenAI
          const uploadedFile = await openai.files.create({
            file: fileBlob,
            purpose: "assistants"
          });
          
          console.log(`[OpenAI] Uploaded file ${file.filename} with ID: ${uploadedFile.id}`);
          
          // Add file to vector store
          const vectorStoreFile = await openai.vectorStores.files.create(
            vectorStoreId,
            {
              file_id: uploadedFile.id
            }
          );
          
          console.log(`[OpenAI] Added file to vector store: ${vectorStoreFile.id}`);
          
          // Poll for processing completion
          let attempts = 0;
          const maxAttempts = 30; // 30 seconds timeout
          let fileStatus = "in_progress";
          
          while (fileStatus === "in_progress" && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const fileCheck = await openai.vectorStores.files.retrieve(
              vectorStoreId,
              uploadedFile.id
            );
            fileStatus = fileCheck.status;
            attempts++;
          }
          
          const finalStatus = fileStatus === "completed" ? "completed" : 
                            fileStatus === "failed" ? "failed" : "pending";
          
          processedFiles.push({
            vectorStoreId,
            fileId: uploadedFile.id,
            filename: file.filename,
            status: finalStatus,
            processingTimeMs: Date.now() - fileStartTime,
          });
          
          // Store file metadata in database
          await ctx.runMutation("functions:insertUploadedFile" as any, {
            supabasePath: `openai://${uploadedFile.id}`,
            userId: session.user_id,
            folderId: folderId || "default_folder",
            embeddingStatus: finalStatus,
            filename: file.filename,
            mimeType: file.mimeType,
            vectorStoreId,
            fileId: uploadedFile.id,
            sessionId,
          });
          
          console.log(`[OpenAI] Successfully processed ${file.filename} in ${Date.now() - fileStartTime}ms`);
          
        } catch (fileError) {
          console.error(`[OpenAI] Error processing file ${file.filename}:`, fileError);
          processedFiles.push({
            vectorStoreId: vectorStoreId || "error",
            fileId: "error",
            filename: file.filename,
            status: "failed",
            processingTimeMs: Date.now() - fileStartTime,
          });
          
          // Store failed file metadata
          await ctx.runMutation("functions:insertUploadedFile" as any, {
            supabasePath: `failed://${file.filename}`,
            userId: session.user_id,
            folderId: folderId || "default_folder",
            embeddingStatus: "failed",
            filename: file.filename,
            mimeType: file.mimeType,
            vectorStoreId: vectorStoreId || "failed",
            fileId: "failed",
            sessionId,
          });
        }
      }
      
      // Step 3: Update session context
      const updatedContext = {
        ...session.context_data,
        vector_store_id: vectorStoreId,
        uploaded_file_paths: [
          ...(session.context_data?.uploaded_file_paths || []),
          ...processedFiles.filter(f => f.status === "completed").map(f => f.filename)
        ],
        last_upload_batch: {
          timestamp: Date.now(),
          totalFiles: files.length,
          successfulFiles: processedFiles.filter(f => f.status === "completed").length,
          processingTimeMs: Date.now() - startTime,
        }
      };
      
      await ctx.runMutation("functions:updateSessionContext" as any, {
        sessionId,
        context: updatedContext,
      });
      
      // Step 4: Update folder vector store ID if provided
      if (folderId && vectorStoreId) {
        await ctx.runMutation("functions:updateFolderVectorStore" as any, {
          folderId: folderId as Id<'folders'>,
          vectorStoreId,
        });
      }
      
      // Step 5: Generate knowledge base analysis if files were successfully processed
      let analysis = undefined;
      const successfulFiles = processedFiles.filter(f => f.status === "completed");
      if (successfulFiles.length > 0) {
        try {
          const knowledgeBase = await ctx.runAction("functions:generateKnowledgeBase" as any, {
            vectorStoreId,
            sessionId,
            fileNames: successfulFiles.map(f => f.filename),
          });
          analysis = knowledgeBase.analysis;
        } catch (analysisError) {
          console.error("[OpenAI] Knowledge base generation failed:", analysisError);
        }
      }
      
      const totalProcessingTime = Date.now() - startTime;
      console.log(`[OpenAI] Vector store processing completed in ${totalProcessingTime}ms`);
      
      return {
        vectorStoreId,
        processedFiles: processedFiles.map(f => ({
          filename: f.filename,
          fileId: f.fileId,
          status: f.status,
          processingTimeMs: f.processingTimeMs,
        })),
        totalProcessingTimeMs: totalProcessingTime,
        analysis,
      };
      
    } catch (error) {
      console.error("[OpenAI] Vector store creation failed:", error);
      throw new ConvexError(`Vector store creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

/**
 * Generate knowledge base analysis using OpenAI Assistant with vector store
 */
export const generateKnowledgeBase = action({
  args: {
    vectorStoreId: v.string(),
    sessionId: v.id("sessions"),
    fileNames: v.array(v.string()),
  },
  returns: v.object({
    analysis: v.string(),
    keyConcepts: v.array(v.string()),
    keyTerms: v.record(v.string(), v.string()),
    summary: v.string(),
  }),
  handler: async (ctx, { vectorStoreId, sessionId, fileNames }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConvexError("OpenAI API key not configured");
    }
    
    const openai = new OpenAI({ apiKey });
    
    try {
      console.log(`[OpenAI] Generating knowledge base for vector store: ${vectorStoreId}`);
      
      // Create assistant with vector store
      const assistant = await openai.beta.assistants.create({
        name: "Document Analyzer",
        instructions: `You are an educational document analyzer. Analyze the uploaded documents and provide:
1. A comprehensive summary of all content
2. Key concepts (as a numbered list)
3. Important terms and definitions (as key: definition pairs)
4. Learning objectives

Format your response as:

SUMMARY:
[Comprehensive summary here]

KEY CONCEPTS:
1. [Concept 1]
2. [Concept 2]
[... etc]

KEY TERMS:
Term1: Definition of term1
Term2: Definition of term2
[... etc]

LEARNING OBJECTIVES:
- [Objective 1]
- [Objective 2]
[... etc]`,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        }
      });
      
      // Create thread
      const thread = await openai.beta.threads.create();
      
      // Send analysis request
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Please analyze all the uploaded documents (${fileNames.join(', ')}) and provide a comprehensive educational analysis following the format specified in your instructions.`
      });
      
      // Run assistant
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id
      });
      
      // Poll for completion
      let runStatus = run.status;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds timeout
      
      while (runStatus === "in_progress" || runStatus === "queued") {
        if (attempts >= maxAttempts) {
          throw new Error("Knowledge base generation timed out");
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        const runCheck = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        runStatus = runCheck.status;
        attempts++;
      }
      
      if (runStatus !== "completed") {
        throw new Error(`Knowledge base generation failed with status: ${runStatus}`);
      }
      
      // Get response
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find((msg: any) => msg.role === "assistant");
      
      if (!assistantMessage?.content[0] || assistantMessage.content[0].type !== "text") {
        throw new Error("No valid response from assistant");
      }
      
      const analysisText = assistantMessage.content[0].text.value;
      
      // Parse the structured response
      const keyConcepts = extractKeyConceptsFromAnalysis(analysisText);
      const keyTerms = extractKeyTermsFromAnalysis(analysisText);
      const summary = extractSummaryFromAnalysis(analysisText);
      
      // Store knowledge base in folder if session has folder
      const session = await ctx.runQuery("functions:getSession" as any, { sessionId });
      if (session?.folder_id) {
        await ctx.runMutation("functions:updateKnowledgeBase" as any, {
          folderId: session.folder_id as Id<'folders'>,
          knowledgeBase: analysisText,
        });
      }
      
      // Cleanup assistant and thread
      await openai.beta.assistants.del(assistant.id);
      await openai.beta.threads.del(thread.id);
      
      console.log(`[OpenAI] Knowledge base generated successfully`);
      
      return {
        analysis: analysisText,
        keyConcepts,
        keyTerms,
        summary,
      };
      
    } catch (error) {
      console.error("[OpenAI] Knowledge base generation failed:", error);
      throw new ConvexError(`Knowledge base generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// Helper functions for parsing analysis text
function extractKeyConceptsFromAnalysis(text: string): string[] {
  const concepts: string[] = [];
  const conceptsMatch = text.match(/KEY CONCEPTS:\s*(.*?)\s*(?:KEY TERMS:|LEARNING OBJECTIVES:|$)/s);
  if (conceptsMatch) {
    const conceptsText = conceptsMatch[1];
    const conceptLines = conceptsText.split('\n');
    conceptLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.match(/^\d+\./)) {
        concepts.push(trimmed.replace(/^\d+\.\s*/, ''));
      }
    });
  }
  return concepts;
}

function extractKeyTermsFromAnalysis(text: string): Record<string, string> {
  const terms: Record<string, string> = {};
  const termsMatch = text.match(/KEY TERMS:\s*(.*?)\s*(?:LEARNING OBJECTIVES:|$)/s);
  if (termsMatch) {
    const termsText = termsMatch[1];
    const termLines = termsText.split('\n');
    termLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.includes(':')) {
        const [term, definition] = trimmed.split(':', 2);
        if (term && definition) {
          terms[term.trim()] = definition.trim();
        }
      }
    });
  }
  return terms;
}

function extractSummaryFromAnalysis(text: string): string {
  const summaryMatch = text.match(/SUMMARY:\s*(.*?)\s*(?:KEY CONCEPTS:|$)/s);
  return summaryMatch ? summaryMatch[1].trim() : text.substring(0, 500) + '...';
} 