// Analyzer Agent - Document Analysis
// Ported from Python backend/ai_tutor/agents/analyzer_agent.py

import { BaseAgent, createAgentConfig, AgentUtils } from "./base";
import { AgentContext, AgentResponse, AnalysisResult } from "./types";
import { Agent as OAAgent, run as runAgent, setOpenAIAPI } from "@openai/agents";
import { fileSearchTool } from "@openai/agents-openai";
import { getGlobalTraceProvider } from "@openai/agents-core";

// Ensure we opt into the Responses API (required for hosted tools & tracing)
setOpenAIAPI("responses");

export class AnalyzerAgent extends BaseAgent {
  constructor(apiKey?: string) {
    const config = createAgentConfig(
      "Document Analyzer",
      "gpt-4o",
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
    this.log("info", `[AnalyzerAgent] (OA SDK) performOpenAIDocumentAnalysis called for VS: ${vectorStoreId}`);

    const analyzerLLM = new OAAgent({
      name: "Document Analyzer",
      instructions: `You are an expert document analyzer. Your task is to analyze the documents in the vector store and extract the following information:\n\n1. File names and metadata (if available).\n2. Key concepts or topics from the documents.\n3. Vector store reference IDs (confirm the one provided).\n4. Key terms and their definitions.\n\nFORMAT INSTRUCTIONS:\n- Present your analysis in a clear, structured text format.\n- Include the following sections:\n  * VECTOR STORE ID: The ID of the vector store (${vectorStoreId})\n  * FILES: List of all document names/IDs you discover within this vector store.\n  * FILE METADATA: Any metadata you find for each file.\n  * KEY CONCEPTS: List of main topics/concepts found across all documents.\n  * CONCEPT DETAILS: Examples or details for each key concept.\n  * KEY TERMS GLOSSARY: List of important terminology with their definitions.\n\nDO NOT:\n- Reference any tools or future steps in your output.\n- Return incomplete analysis.`,
      model: this.config.model || "gpt-4o",
      tools: [fileSearchTool(vectorStoreId)],
    });

    try {
      const runResult = await runAgent(
        analyzerLLM,
        `Analyze all documents in the vector store ID: ${vectorStoreId}. Provide a comprehensive analysis based on your instructions.`
      );

      const analysisText = (runResult.finalOutput ?? "").toString();

      if (!analysisText) {
        throw new Error("No analysis text returned by agent");
      }

      this.log("info", `[AnalyzerAgent] Analysis text received, length: ${analysisText.length}`);

      // Ensure traces are exported before the action finishes
      await getGlobalTraceProvider().forceFlush();

      return analysisText;
    } catch (error) {
      this.log("error", "[AnalyzerAgent] Agent run failed", error);
      throw error;
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