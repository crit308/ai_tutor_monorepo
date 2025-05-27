// Planner Agent - Session Focus Planning
// Ported from Python backend/ai_tutor/agents/planner_agent.py

import { BaseAgent, createAgentConfig, AgentUtils } from "./base";
import { AgentContext, AgentResponse, FocusObjective, PlannerOutput, ActionSpec } from "./types";
import { api } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

export interface PlannerInput {
  user_model_state?: any; // User's learning progress and mastery
  force_focus?: string; // Optional: force focus on specific topic
}

export interface UserModelState {
  concepts: Record<string, ConceptState>;
}

export interface ConceptState {
  mastery: number; // 0-1 scale
  confidence: number; // 1-10 scale
  attempts: number;
  last_interaction?: string;
}

export class PlannerAgent extends BaseAgent {
  private static readonly KB_INPUT_LIMIT_BYTES = 8000; // ~2k tokens
  private conceptGraphCache: { edges: any[] | null; updatedAt: number | null } = {
    edges: null,
    updatedAt: null
  };
  private convexCtx?: ActionCtx;

  constructor(apiKey?: string, convexCtx?: ActionCtx) {
    const config = createAgentConfig(
      "Focus Planner",
      "gpt-4-turbo-preview",
      {
        temperature: 0.5, // Balanced temperature for planning decisions
        max_tokens: 3000
      }
    );
    super(config, apiKey);
    this.convexCtx = convexCtx;
  }

  async execute(context: AgentContext, input: PlannerInput): Promise<AgentResponse<FocusObjective>> {
    AgentUtils.validateSessionContext(context);
    
    this.log("info", `Starting session focus planning for session: ${context.session_id}`);

    try {
      const { result, executionTime } = await this.measureExecution(async () => {
        return await this.determineSessionFocus(context, input);
      });

      this.log("info", `Session focus planning completed in ${executionTime}ms: ${result.topic}`);
      return this.createResponse(result, executionTime);

    } catch (error) {
      this.log("error", "Session focus planning failed", error);
      return this.createErrorResponse(`Session focus planning failed: ${error}`);
    }
  }

  private async determineSessionFocus(
    context: AgentContext,
    input: PlannerInput
  ): Promise<FocusObjective> {
    // 1. Read knowledge base
    const knowledgeBase = await this.readKnowledgeBase(context);
    
    // 2. Process user model state
    const { masteredConcepts, userModelSummary } = this.processUserModelState(input.user_model_state);
    
    // 3. Query concept graph for next learnable concepts
    const nextConcepts = await this.queryConceptGraph(masteredConcepts);
    
    // 4. Generate focus objective using LLM
    const focusObjective = await this.generateFocusObjective(
      context,
      knowledgeBase,
      userModelSummary,
      nextConcepts,
      input.force_focus
    );
    
    // 5. Store in context for future reference
    context.focus_objective = focusObjective;
    
    return focusObjective;
  }

  private async readKnowledgeBase(context: AgentContext): Promise<string> {
    try {
      // Check if analysis result is already in context
      if (context.analysis_result?.analysis_text) {
        this.log("info", "Found knowledge base in context, using cached version");
        return context.analysis_result.analysis_text;
      }

      // If folder_id is available, read from database
      if (context.folder_id && this.convexCtx) {
        this.log("info", `Reading knowledge base for folder: ${context.folder_id}`);
        
        try {
          const folderData = await this.convexCtx.runQuery(api.functions.getFolderEnhanced, {
            folderId: context.folder_id as any
          });
          
          if (folderData?.knowledge_base) {
            this.log("info", `Knowledge base found for folder: ${context.folder_id}`);
            return folderData.knowledge_base;
          }
        } catch (dbError) {
          this.log("error", "Failed to query folder knowledge base", dbError);
        }
      }

      this.log("warn", "No knowledge base available for planning");
      return "Knowledge base is empty or unavailable.";
      
    } catch (error) {
      this.log("error", "Failed to read knowledge base", error);
      return `Error reading knowledge base: ${error}`;
    }
  }

  private processUserModelState(userModelState?: UserModelState): {
    masteredConcepts: string[];
    userModelSummary: string;
  } {
    let masteredConcepts: string[] = [];
    let userModelSummary = "No user model state available.";

    try {
      if (userModelState?.concepts) {
        // Determine mastered concepts (mastery > 0.8 and confidence >= 5)
        masteredConcepts = Object.entries(userModelState.concepts)
          .filter(([_, state]) => state.mastery > 0.8 && state.confidence >= 5)
          .map(([topic, _]) => topic);

        // Create summary for LLM prompt
        const stateItems = Object.entries(userModelState.concepts).map(
          ([topic, state]) => 
            `- ${topic}: Mastery=${state.mastery.toFixed(2)}, Confidence=${state.confidence}, Attempts=${state.attempts}`
        );

        if (stateItems.length > 0) {
          userModelSummary = "Current user concept understanding:\n" + stateItems.join("\n");
        } else {
          userModelSummary = "User has no tracked concepts yet.";
        }
      }

      this.log("info", `Processed user model: ${masteredConcepts.length} mastered concepts`);
      
    } catch (error) {
      this.log("error", "Error processing user model state", error);
    }

    return { masteredConcepts, userModelSummary };
  }

  private async queryConceptGraph(masteredConcepts: string[]): Promise<string[] | null> {
    try {
      // Get concept graph edges (with caching)
      const edges = await this.getConceptGraphEdges();
      
      if (!edges || edges.length === 0) {
        this.log("warn", "No concept graph data available");
        return null;
      }

      // Build prerequisite map: concept -> list of prereqs
      const prereqMap: Record<string, string[]> = {};
      edges.forEach(edge => {
        if (!prereqMap[edge.concept]) {
          prereqMap[edge.concept] = [];
        }
        prereqMap[edge.concept].push(edge.prereq);
      });

      // Find next learnable concepts: not mastered and all prereqs satisfied
      const candidates = Object.entries(prereqMap)
        .filter(([concept, prereqs]) => 
          !masteredConcepts.includes(concept) && 
          prereqs.every(prereq => masteredConcepts.includes(prereq))
        )
        .map(([concept, _]) => concept);

      this.log("info", `Found ${candidates.length} next learnable concepts`);
      return candidates;
      
    } catch (error) {
      this.log("error", "Failed to query concept graph", error);
      return null;
    }
  }

  private async getConceptGraphEdges(): Promise<any[]> {
    try {
      // Simple caching mechanism
      if (this.conceptGraphCache.edges && 
          this.conceptGraphCache.updatedAt && 
          Date.now() - this.conceptGraphCache.updatedAt < 5 * 60 * 1000) { // 5 minutes cache
        this.log("info", "Using cached concept graph edges");
        return this.conceptGraphCache.edges;
      }

      // Query concept graph from Convex database
      if (this.convexCtx) {
        this.log("info", "Fetching concept graph edges from database");
        const edges = await this.convexCtx.runQuery(api.functions.getAllConceptGraphEdges, {});
        
        this.conceptGraphCache.edges = edges;
        this.conceptGraphCache.updatedAt = Date.now();
        
        this.log("info", `Fetched ${edges.length} concept graph edges from database`);
        return edges;
      } else {
        this.log("warn", "No Convex context available, using fallback mock data");
        // Fallback to mock data if no Convex context
        const edges = [
          { prereq: "basic_concepts", concept: "intermediate_concepts" },
          { prereq: "intermediate_concepts", concept: "advanced_concepts" }
        ];

        this.conceptGraphCache.edges = edges;
        this.conceptGraphCache.updatedAt = Date.now();
        
        return edges;
      }
      
    } catch (error) {
      this.log("error", "Failed to fetch concept graph edges", error);
      
      // Return empty array or mock data on error
      const fallbackEdges = [
        { prereq: "basic_concepts", concept: "intermediate_concepts" },
        { prereq: "intermediate_concepts", concept: "advanced_concepts" }
      ];
      
      return fallbackEdges;
    }
  }

  private async generateFocusObjective(
    context: AgentContext,
    knowledgeBase: string,
    userModelSummary: string,
    nextConcepts: string[] | null,
    forceFocus?: string
  ): Promise<FocusObjective> {
    // Truncate knowledge base if too large
    const kbContent = this.truncateKnowledgeBase(knowledgeBase);
    
    // Prepare DAG information
    const dagInfo = nextConcepts 
      ? `Suggested next learnable concepts based on prerequisites: ${nextConcepts.join(", ")}`
      : "Prerequisite information (DAG) is not available for planning.";

    // Add force focus information if provided
    const focusInstruction = forceFocus 
      ? `IMPORTANT: The user has specifically requested to focus on: ${forceFocus}. Prioritize this topic if it appears in the knowledge base or is pedagogically appropriate.`
      : "";

    const systemMessage = `You are the Focus Planner agent. Your task is to analyze the provided Knowledge Base text, the user's current concept understanding (User Model State), and potential next concepts based on prerequisites (if available). 

Based on this analysis, select the single most important FocusObjective for the current tutoring session. Consider the importance of topics, prerequisites, and the user's progress. 

${focusInstruction}

Output ONLY a single, valid JSON object conforming exactly to the FocusObjective schema. Ensure 'topic', 'learning_goal', 'priority' (integer 1-5), and 'target_mastery' fields are ALWAYS included. Do not add any commentary before or after the JSON object.

FocusObjective Schema:
{
  "topic": "string",              // The primary topic or concept to focus on.
  "learning_goal": "string",      // A specific, measurable goal (e.g., 'Understand local vs global scope').
  "priority": number,             // Priority 1-5 (5=highest). MANDATORY FIELD.
  "relevant_concepts": ["string"], // Optional list of related concepts from the KB.
  "suggested_approach": "string", // Optional hint (e.g., 'Needs examples').
  "target_mastery": number,       // Target mastery level (e.g., 0.8). MANDATORY FIELD.
  "initial_difficulty": "string"  // Optional initial difficulty (e.g., 'Medium').
}`;

    const response = await this.callOpenAI([
      {
        role: "system",
        content: systemMessage
      },
      {
        role: "user",
        content: `Knowledge Base Content (Recent History):\n${kbContent}`
      },
      {
        role: "user",
        content: userModelSummary
      },
      {
        role: "user",
        content: dagInfo
      },
      {
        role: "user",
        content: "Select the single best FocusObjective for this session based on all available information. Respond only with the JSON object."
      }
    ], {
      response_format: { type: "json_object" }
    });

    // Parse and validate the response
    const focusData = this.parseJSONResponse<any>(response.content);
    
    // Ensure required fields with defaults
    if (!focusData.target_mastery || typeof focusData.target_mastery !== "number") {
      this.log("warn", "target_mastery missing or invalid, setting default 0.8");
      focusData.target_mastery = 0.8;
    }

    if (!focusData.priority || typeof focusData.priority !== "number") {
      this.log("warn", "priority missing or invalid, setting default 3");
      focusData.priority = 3;
    }

    // Validate required fields
    this.validateRequiredFields(focusData, ["topic", "learning_goal", "priority", "target_mastery"]);

    // Create FocusObjective with proper defaults
    const focusObjective: FocusObjective = {
      topic: focusData.topic,
      learning_goal: focusData.learning_goal,
      priority: focusData.priority,
      relevant_concepts: focusData.relevant_concepts || [],
      suggested_approach: focusData.suggested_approach,
      target_mastery: focusData.target_mastery,
      initial_difficulty: focusData.initial_difficulty
    };

    this.log("info", `Generated focus objective: ${focusObjective.topic} (Priority: ${focusObjective.priority})`);
    return focusObjective;
  }

  private truncateKnowledgeBase(knowledgeBase: string): string {
    if (!knowledgeBase) {
      return "Knowledge Base is empty or unavailable.";
    }

    const textBytes = new TextEncoder().encode(knowledgeBase);
    if (textBytes.length <= PlannerAgent.KB_INPUT_LIMIT_BYTES) {
      return knowledgeBase;
    }

    // Get the last N bytes (tail)
    const truncatedBytes = textBytes.slice(-PlannerAgent.KB_INPUT_LIMIT_BYTES);
    const truncatedText = new TextDecoder().decode(truncatedBytes);
    
    this.log("warn", `Knowledge base truncated to last ~${PlannerAgent.KB_INPUT_LIMIT_BYTES} bytes`);
    return `... (Beginning of Knowledge Base truncated)\n\n${truncatedText}`;
  }
}

// Factory function for creating planner agent instances
export function createPlannerAgent(apiKey?: string, convexCtx?: ActionCtx): PlannerAgent {
  return new PlannerAgent(apiKey, convexCtx);
}

// Planning validation utilities
export class PlanningValidator {
  static validateFocusObjective(objective: FocusObjective): boolean {
    if (!objective.topic || typeof objective.topic !== "string") {
      throw new Error("FocusObjective must have a valid topic string");
    }
    
    if (!objective.learning_goal || typeof objective.learning_goal !== "string") {
      throw new Error("FocusObjective must have a valid learning_goal string");
    }

    if (typeof objective.priority !== "number" || objective.priority < 1 || objective.priority > 5) {
      throw new Error("FocusObjective priority must be a number between 1 and 5");
    }

    if (typeof objective.target_mastery !== "number" || objective.target_mastery < 0 || objective.target_mastery > 1) {
      throw new Error("FocusObjective target_mastery must be a number between 0 and 1");
    }

    return true;
  }

  static extractPlanningMetrics(objective: FocusObjective): {
    priority: number;
    targetMastery: number;
    conceptCount: number;
    hasApproach: boolean;
    hasDifficulty: boolean;
  } {
    return {
      priority: objective.priority,
      targetMastery: objective.target_mastery,
      conceptCount: objective.relevant_concepts?.length || 0,
      hasApproach: !!objective.suggested_approach,
      hasDifficulty: !!objective.initial_difficulty
    };
  }
}

// Helper function for session focus determination
export async function determineSessionFocus(
  context: AgentContext,
  userModelState?: UserModelState,
  forceFocus?: string,
  apiKey?: string
): Promise<FocusObjective | null> {
  try {
    const agent = createPlannerAgent(apiKey);
    const response = await agent.execute(context, { 
      user_model_state: userModelState,
      force_focus: forceFocus
    });
    
    if (response.success && response.data) {
      PlanningValidator.validateFocusObjective(response.data);
      return response.data;
    }
    
    console.error("Session focus planning failed:", response.error);
    return null;
    
  } catch (error) {
    console.error("Error in determineSessionFocus:", error);
    return null;
  }
} 