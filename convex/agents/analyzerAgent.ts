// Analyzer Agent - Document Analysis
// Ported from Python backend/ai_tutor/agents/analyzer_agent.py

import { BaseAgent, createAgentConfig, AgentUtils } from "./base";
import { AgentContext, AgentResponse, AnalysisResult, DocumentAnalysis, FileMetadata } from "./types";
import { api } from "../_generated/api";

export interface AnalyzerInput {
  vector_store_id: string;
  max_results?: number;
}

export class AnalyzerAgent extends BaseAgent {
  constructor(apiKey?: string) {
    const config = createAgentConfig(
      "Document Analyzer",
      "gpt-4-turbo-preview",
      {
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 4000
      }
    );
    super(config, apiKey);
  }

  async execute(context: AgentContext, input: AnalyzerInput): Promise<AgentResponse<AnalysisResult>> {
    AgentUtils.validateSessionContext(context);
    
    this.log("info", `Starting document analysis for vector store: ${input.vector_store_id}`);

    try {
      const { result, executionTime } = await this.measureExecution(async () => {
        return await this.analyzeDocuments(input.vector_store_id, context, input.max_results);
      });

      // Save analysis to knowledge base if we have folder context
      if (context.folder_id && result.analysis_text) {
        await this.saveToKnowledgeBase(context.folder_id, result.analysis_text);
      }

      this.log("info", `Document analysis completed in ${executionTime}ms`);
      return this.createResponse(result, executionTime);

    } catch (error) {
      this.log("error", "Document analysis failed", error);
      return this.createErrorResponse(`Document analysis failed: ${error}`);
    }
  }

  private async analyzeDocuments(
    vectorStoreId: string,
    context: AgentContext,
    maxResults: number = 10
  ): Promise<AnalysisResult> {
    // Simulate file search tool functionality 
    // In a real implementation, this would integrate with OpenAI's file search API
    const searchResults = await this.performDocumentSearch(vectorStoreId, maxResults);

    const analysisPrompt = this.createAnalysisPrompt(vectorStoreId, searchResults);
    
    const response = await this.callOpenAI([
      {
        role: "system",
        content: `You are an expert document analyzer. Your task is to analyze the documents in the vector store
        and extract the following information:
        
        1. File names and metadata
        2. Key concepts or topics from the documents
        3. Vector store reference IDs
        4. Key terms and their definitions
        
        ANALYSIS PROCESS:
        1. Use the provided search results to understand what documents are available
        2. Extract key concepts by analyzing document content and structure
        3. Identify and record vector store reference IDs
        4. Extract important terminology and their definitions
        5. Organize all findings into a comprehensive analysis
        
        FORMAT INSTRUCTIONS:
        - Present your analysis in a clear, structured text format
        - Include the following sections:
          * VECTOR STORE ID: The ID of the vector store
          * FILES: List of all document names you discover
          * FILE METADATA: Any metadata you find for each file
          * KEY CONCEPTS: List of main topics/concepts found across all documents
          * CONCEPT DETAILS: Examples or details for each key concept
          * KEY TERMS GLOSSARY: List of important terminology with their definitions
          * FILE IDS: Any reference IDs you discover
        
        DO NOT:
        - Do not reference any tools or future steps in your output
        - Do not return incomplete analysis`
      },
      {
        role: "user",
        content: analysisPrompt
      }
    ]);

    const analysisText = response.content;
    
    // Parse the structured data from the analysis text
    const parsedData = this.parseAnalysisText(analysisText);

    return {
      analysis_text: analysisText,
      key_concepts: parsedData.key_concepts,
      key_terms: parsedData.key_terms,
      file_names: parsedData.file_names,
      vector_store_id: vectorStoreId
    };
  }

  private async performDocumentSearch(vectorStoreId: string, maxResults: number): Promise<any[]> {
    // This would integrate with OpenAI's file search API or vector database
    // For now, return mock search results that represent what would be found
    
    // Simulate different types of searches as done in Python version
    const searches = [
      "document overview introduction",
      "author date title version metadata",
      "key concepts topics themes",
      "definitions terminology glossary",
      "file references identifiers"
    ];

    const allResults: any[] = [];
    
    for (const query of searches) {
      // Simulate API call to vector store search
      // In production, this would call OpenAI's file search API
      const results = await this.simulateVectorSearch(vectorStoreId, query, Math.min(maxResults, 3));
      allResults.push(...results);
    }

    return allResults.slice(0, maxResults);
  }

  private async simulateVectorSearch(vectorStoreId: string, query: string, limit: number): Promise<any[]> {
    // Simulate vector search results
    // In production, this would call the actual OpenAI Files API
    return [
      {
        content: `Search results for "${query}" in vector store ${vectorStoreId}`,
        metadata: {
          file_name: `document_${Math.random().toString(36).substr(2, 9)}.pdf`,
          score: 0.8 + Math.random() * 0.2
        }
      }
    ];
  }

  private createAnalysisPrompt(vectorStoreId: string, searchResults: any[]): string {
    const resultsText = searchResults.map((result, index) => 
      `Result ${index + 1}: ${result.content}\nMetadata: ${JSON.stringify(result.metadata)}\n`
    ).join("\n");

    return `Analyze all documents in the vector store thoroughly.
    
    Vector Store ID: ${vectorStoreId}
    
    Search Results from Documents:
    ${resultsText}
    
    Based on these search results, provide a comprehensive analysis following the required format.
    Be methodical and thorough in extracting:
    1. All file names and their metadata
    2. Key concepts, topics, and themes
    3. Important terminology with clear definitions
    4. Any reference IDs or identifiers found
    
    Present your findings in the structured format specified in the system instructions.`;
  }

  private parseAnalysisText(analysisText: string): {
    key_concepts: string[];
    key_terms: Record<string, string>;
    file_names: string[];
  } {
    const key_concepts: string[] = [];
    const key_terms: Record<string, string> = {};
    const file_names: string[] = [];

    try {
      // Extract key concepts
      const conceptsSection = AgentUtils.extractTextSection(analysisText, "KEY CONCEPTS");
      if (conceptsSection) {
        const concepts = conceptsSection.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('-') && !line.startsWith('*'))
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(concept => concept);
        key_concepts.push(...concepts);
      }

      // Extract key terms
      const termsSection = AgentUtils.extractTextSection(analysisText, "KEY TERMS GLOSSARY");
      if (termsSection) {
        const parsedTerms = AgentUtils.parseKeyValuePairs(termsSection);
        Object.assign(key_terms, parsedTerms);
      }

      // Extract file names
      const filesSection = AgentUtils.extractTextSection(analysisText, "FILES");
      if (filesSection) {
        const files = filesSection.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('-') && !line.startsWith('*'))
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(fileName => fileName);
        file_names.push(...files);
      }

    } catch (error) {
      this.log("warn", "Failed to parse some sections from analysis text", error);
    }

    return { key_concepts, key_terms, file_names };
  }

  private async saveToKnowledgeBase(folderId: string, analysisText: string): Promise<void> {
    try {
      // Use Convex mutation to update the folder's knowledge base
      // This would call a Convex function to update the folder
      this.log("info", `Saving analysis to knowledge base for folder: ${folderId}`);
      
      // Note: In a real implementation, this would call a Convex mutation
      // await ctx.runMutation(api.folderCrud.updateKnowledgeBase, {
      //   folderId,
      //   knowledgeBase: analysisText
      // });
      
    } catch (error) {
      this.log("error", "Failed to save analysis to knowledge base", error);
      // Don't throw - this is not critical for the analysis itself
    }
  }
}

// Factory function for creating analyzer agent instances
export function createAnalyzerAgent(apiKey?: string): AnalyzerAgent {
  return new AnalyzerAgent(apiKey);
}

// Analysis validation utilities
export class AnalysisValidator {
  static validateAnalysisResult(result: AnalysisResult): boolean {
    if (!result.vector_store_id) {
      throw new Error("Analysis result must include vector_store_id");
    }
    
    if (!result.analysis_text || result.analysis_text.trim().length === 0) {
      throw new Error("Analysis result must include non-empty analysis_text");
    }

    return true;
  }

  static validateDocumentAnalysis(analysis: DocumentAnalysis): boolean {
    if (!analysis.vector_store_id) {
      throw new Error("Document analysis must include vector_store_id");
    }

    if (!Array.isArray(analysis.file_names)) {
      throw new Error("Document analysis must include file_names array");
    }

    if (!Array.isArray(analysis.key_concepts)) {
      throw new Error("Document analysis must include key_concepts array");
    }

    return true;
  }

  static extractMetrics(result: AnalysisResult): {
    conceptCount: number;
    termCount: number;
    fileCount: number;
    textLength: number;
  } {
    return {
      conceptCount: result.key_concepts?.length || 0,
      termCount: Object.keys(result.key_terms || {}).length,
      fileCount: result.file_names?.length || 0,
      textLength: result.analysis_text?.length || 0
    };
  }
}

// Helper function for processing analysis results
export async function analyzeDocuments(
  vectorStoreId: string,
  context: AgentContext,
  apiKey?: string
): Promise<AnalysisResult | null> {
  try {
    const agent = createAnalyzerAgent(apiKey);
    const response = await agent.execute(context, { vector_store_id: vectorStoreId });
    
    if (response.success && response.data) {
      AnalysisValidator.validateAnalysisResult(response.data);
      return response.data;
    }
    
    console.error("Document analysis failed:", response.error);
    return null;
    
  } catch (error) {
    console.error("Error in analyzeDocuments:", error);
    return null;
  }
} 