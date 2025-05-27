// Analyzer Agent - Document Analysis
// Ported from Python backend/ai_tutor/agents/analyzer_agent.py

import { BaseAgent, createAgentConfig, AgentUtils } from "./base";
import { AgentContext, AgentResponse, AnalysisResult } from "./types";
import { OpenAI } from 'openai';



export class AnalyzerAgent extends BaseAgent {
  private openAIClient: OpenAI;

  constructor(apiKey?: string) {
    const config = createAgentConfig(
      "Document Analyzer",
      "gpt-4-turbo-preview",
      {
        temperature: 0.3,
        max_tokens: 4000
      }
    );
    super(config, apiKey);

    const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;
    if (!effectiveApiKey) {
      this.log("error", "OpenAI API key is not configured for AnalyzerAgent.");
      throw new Error("OpenAI API key is required for document analysis");
    }
    this.openAIClient = new OpenAI({ apiKey: effectiveApiKey });
  }

  async execute(context: AgentContext, input: { vector_store_id: string }): Promise<AgentResponse<AnalysisResult>> {
    AgentUtils.validateSessionContext(context);
    
    this.log("info", `[AnalyzerAgent] Starting document analysis for vector store: ${input.vector_store_id}`);

    try {
      const { result, executionTime } = await this.measureExecution(async () => {
        // Call the method that uses the OpenAI SDK
        const analysisText = await this.performOpenAIDocumentAnalysis(input.vector_store_id);
        
        // Parse the structured data from the analysis text
        const parsedData = this.parseAnalysisText(analysisText);

        return {
          analysis_text: analysisText,
          key_concepts: parsedData.key_concepts,
          key_terms: parsedData.key_terms,
          file_names: parsedData.file_names,
          vector_store_id: input.vector_store_id
        };
      });

      // The saving to KB is handled by the calling action in aiAgents.ts

      this.log("info", `[AnalyzerAgent] Document analysis completed in ${executionTime}ms`);
      return this.createResponse(result, executionTime);

    } catch (error) {
      this.log("error", "[AnalyzerAgent] Document analysis failed", error);
      return this.createErrorResponse(`Document analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }



  private async performOpenAIDocumentAnalysis(vectorStoreId: string): Promise<string> {
    this.log("info", `[AnalyzerAgent] performOpenAIDocumentAnalysis called for VS: ${vectorStoreId}`);
    try {
      // Create an assistant with file search tool
      const assistant = await this.openAIClient.beta.assistants.create({
        name: "Convex Document Analyzer",
        instructions: `You are an expert document analyzer. Your task is to analyze the documents in the vector store
        and extract the following information:
        
        1. File names and metadata (if available directly from search, otherwise list files by their IDs as seen in the vector store).
        2. Key concepts or topics from the documents.
        3. Vector store reference IDs (confirm the one provided).
        4. Key terms and their definitions.
        
        ANALYSIS PROCESS:
        1. Use the file_search tool with broad queries to understand what documents are available.
        2. Conduct systematic searches for common document metadata fields (if possible with file_search).
        3. Extract key concepts by analyzing document content and structure.
        4. Identify and record vector store reference IDs.
        5. Extract important terminology and their definitions.
        6. Organize all findings into a comprehensive analysis.
        
        FORMAT INSTRUCTIONS:
        - Present your analysis in a clear, structured text format.
        - Include the following sections:
          * VECTOR STORE ID: The ID of the vector store (${vectorStoreId})
          * FILES: List of all document names/IDs you discover within this vector store.
          * FILE METADATA: Any metadata you find for each file.
          * KEY CONCEPTS: List of main topics/concepts found across all documents.
          * CONCEPT DETAILS: Examples or details for each key concept.
          * KEY TERMS GLOSSARY: List of important terminology with their definitions.
        
        DO NOT:
        - Do not reference any tools or future steps in your output.
        - Do not return incomplete analysis.`,
        model: this.config.model || "gpt-4-turbo-preview", // Use model from config
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        }
      });
      this.log("info", `[AnalyzerAgent] Assistant created: ${assistant.id}`);

      const thread = await this.openAIClient.beta.threads.create();
      this.log("info", `[AnalyzerAgent] Thread created: ${thread.id}`);

      await this.openAIClient.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Analyze all documents in the vector store ID: ${vectorStoreId}. Provide a comprehensive analysis based on your instructions.`
      });
      this.log("info", `[AnalyzerAgent] Message added to thread ${thread.id}`);

      let run = await this.openAIClient.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id
      });
      this.log("info", `[AnalyzerAgent] Run created: ${run.id}, Status: ${run.status}`);

      const startTime = Date.now();
      const timeoutMs = 180000; // 3 minutes timeout for the run

      while (run.status === 'in_progress' || run.status === 'queued') {
        if (Date.now() - startTime > timeoutMs) {
          this.log("error", `[AnalyzerAgent] Run ${run.id} timed out after ${timeoutMs / 1000}s`);
          await this.openAIClient.beta.threads.runs.cancel(thread.id, run.id); // Attempt to cancel
          throw new Error(`OpenAI run timed out after ${timeoutMs / 1000} seconds.`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
        run = await this.openAIClient.beta.threads.runs.retrieve(thread.id, run.id);
        this.log("info", `[AnalyzerAgent] Run ${run.id} status: ${run.status}`);
      }

      if (run.status !== 'completed') {
        this.log("error", `[AnalyzerAgent] Run ${run.id} failed or was cancelled. Status: ${run.status}. Last Error: ${JSON.stringify(run.last_error)}`);
        throw new Error(`OpenAI run did not complete successfully. Status: ${run.status}. Last Error: ${run.last_error?.message}`);
      }

      const messages = await this.openAIClient.beta.threads.messages.list(thread.id, { order: 'desc', limit: 1 });
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
      
      // Clean up: Delete the assistant (optional, but good practice for one-off assistants)
      try {
        await this.openAIClient.beta.assistants.del(assistant.id);
        this.log("info", `[AnalyzerAgent] Assistant ${assistant.id} deleted.`);
      } catch (delError) {
        this.log("warn", `[AnalyzerAgent] Could not delete assistant ${assistant.id}: ${delError}`);
      }

      if (!assistantMessage || assistantMessage.content[0]?.type !== 'text') {
        this.log("error", "[AnalyzerAgent] No text content found in assistant's final response.");
        throw new Error('No analysis result found in assistant response');
      }

      const analysisText = assistantMessage.content[0].text.value;
      this.log("info", `[AnalyzerAgent] Analysis text received, length: ${analysisText.length}`);
      return analysisText;

    } catch (error) {
      this.log("error", "[AnalyzerAgent] OpenAI API call for document analysis failed", error);
      throw error; // Re-throw to be caught by execute method
    }
  }

  private parseAnalysisText(analysisText: string | null): {
    key_concepts: string[];
    key_terms: Record<string, string>;
    file_names: string[];
  } {
    if (!analysisText) {
      return { key_concepts: [], key_terms: {}, file_names: [] };
    }

    const key_concepts: string[] = [];
    const key_terms: Record<string, string> = {};
    const file_names: string[] = [];

    try {
      const conceptsSection = AgentUtils.extractTextSection(analysisText, "KEY CONCEPTS");
      if (conceptsSection) {
        key_concepts.push(...conceptsSection.split('\n')
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(concept => concept));
      }

      const termsSection = AgentUtils.extractTextSection(analysisText, "KEY TERMS GLOSSARY");
      if (termsSection) {
        Object.assign(key_terms, AgentUtils.parseKeyValuePairs(termsSection));
      }

      const filesSection = AgentUtils.extractTextSection(analysisText, "FILES");
      if (filesSection) {
        file_names.push(...filesSection.split('\n')
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(fileName => fileName));
      }
    } catch (error) {
      this.log("warn", "[AnalyzerAgent] Failed to parse some sections from analysis text", error);
    }
    this.log("info", `[AnalyzerAgent] Parsed analysis: ${key_concepts.length} concepts, ${Object.keys(key_terms).length} terms, ${file_names.length} files.`);
    return { key_concepts, key_terms, file_names };
  }


} 