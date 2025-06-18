// Session Analyzer Agent - Teaching Session Analysis
// Ported from Python backend/ai_tutor/agents/session_analyzer_agent.py

import { BaseAgent, createAgentConfig, AgentUtils } from "./base";
import { 
  AgentContext, 
  AgentResponse, 
  SessionAnalysis, 
  LearningInsight, 
  TeachingInsight,
  LessonPlan,
  LessonContent,
  Quiz,
  QuizUserAnswers,
  QuizFeedback
} from "./types";
import { api } from "../_generated/api";
import { Agent as OAAgent, run as runAgent, setOpenAIAPI } from "@openai/agents";
import { getGlobalTraceProvider } from "@openai/agents-core";
// Convex Action context type for server-side queries
import type { ActionCtx } from "../_generated/server";
import { components } from "../_generated/api";

// Ensure we opt into the Responses API (required for hosted tools & tracing)
setOpenAIAPI("responses");

// Minimal runtime polyfill for CustomEvent on Node 18 environments
// @ts-ignore
if (typeof globalThis.CustomEvent !== "function") {
  // @ts-ignore – loose typing, we only need basic event shell
  globalThis.CustomEvent = function (type: string, params?: any) {
    const e = new Event(type, params);
    // @ts-ignore
    e.detail = params && params.detail;
    return e;
  } as any;
}

export interface SessionAnalyzerInput {
  session_id: string;
  lesson_plan?: LessonPlan;
  lesson_content?: LessonContent;
  quiz?: Quiz;
  user_answers?: QuizUserAnswers;
  quiz_feedback?: QuizFeedback;
  session_duration_seconds?: number;
  raw_agent_outputs?: Record<string, string>;
  document_analysis?: any;
}

export interface InteractionLogSummary {
  total_interactions: number;
  user_messages: number;
  agent_responses: number;
  topics_discussed: string[];
  key_events: string[];
  learning_moments: string[];
  confusion_points: string[];
  success_indicators: string[];
}

export class SessionAnalyzerAgent extends BaseAgent {
  private convexCtx?: ActionCtx;

  constructor(apiKey?: string, convexCtx?: ActionCtx) {
    const config = createAgentConfig(
      "Session Analyzer",
      "gpt-4-turbo-preview", // Use latest model for analysis
      {
        temperature: 0.4, // Balanced for analytical consistency
        max_tokens: 4000
      }
    );
    super(config, apiKey);
    this.convexCtx = convexCtx;
  }

  async execute(context: AgentContext, input: SessionAnalyzerInput): Promise<AgentResponse<{ textSummary: string; analysis: SessionAnalysis | null }>> {
    AgentUtils.validateSessionContext(context);
    
    this.log("info", `Starting session analysis for session: ${input.session_id}`);

    try {
      const { result, executionTime } = await this.measureExecution(async () => {
        return await this.analyzeSession(input.session_id, context, input);
      });

      this.log("info", `Session analysis completed in ${executionTime}ms`);
      return this.createResponse(result, executionTime);

    } catch (error) {
      this.log("error", "Session analysis failed", error);
      return this.createErrorResponse(`Session analysis failed: ${error}`);
    }
  }

  private async analyzeSession(
    sessionId: string,
    context: AgentContext,
    input: SessionAnalyzerInput
  ): Promise<{ textSummary: string; analysis: SessionAnalysis | null }> {
    // Perform analysis using OpenAI Agents SDK with hosted tool
    const analysisResult = await this.performOpenAISessionAnalysis(sessionId, input);

    // Parse agent output into text summary + structured analysis
    const { textSummary, structuredAnalysis } = this.parseAnalysisResult(analysisResult);

    // Save analysis summary to knowledge base if needed
    if (context.folder_id && textSummary) {
      await this.appendToKnowledgeBase(context.folder_id, textSummary);
    }

    return {
      textSummary,
      analysis: structuredAnalysis,
    };
  }

  private async performOpenAISessionAnalysis(
    sessionId: string,
    input: SessionAnalyzerInput
  ): Promise<string> {
    // Define the hosted tool that the agent can invoke to obtain the interaction summary
    const readInteractionLogsTool: any = {
      type: "function",
      name: "read_interaction_logs",
      description: "Return a concise plain-text summary of the interaction log for a given tutoring session.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "The unique identifier of the tutoring session to summarise."
          }
        },
        required: ["session_id"]
      },
      // Called by Agents SDK when the tool is invoked
      invoke: async ({ session_id }: { session_id?: string }) => {
        const sid = session_id || sessionId;
        const structured = await this.readInteractionLogs(sid);
        return this.formatInteractionSummary(structured);
      },
      // Agents SDK checks this to decide whether to auto-run the tool or request human approval
      needsApproval: () => false
    };

    // Compose additional context (lesson plan, quiz results, etc.) for the agent prompt
    const additionalContext = this.formatAdditionalContext(input);

    const agent = new OAAgent({
      name: "Session Analyzer",
      instructions: `You are an expert educational analyst specialized in evaluating tutoring sessions.\n\nYour task is to analyze the tutoring session based on the interaction log summary obtained via the read_interaction_logs tool.\n\nFocus on:\n- Student comprehension and performance patterns (e.g., areas of struggle, quick grasps)\n- Effectiveness of teaching methods used by the agent (based on log events and responses)\n- Alignment between the session interactions and potential learning objectives (infer if necessary)\n- Actionable recommendations for future sessions or improvements\n- Any potential issues or successes in the interaction flow\n\nREQUIRED OUTPUT FORMAT:\n1. A concise plain-text summary (max 300 words) suitable for appending to a knowledge base. Start this summary *exactly* with the phrase \"Session Summary:\". Do not include any preamble before this phrase.\n2. Optionally, after the text summary, include a JSON object conforming to the SessionAnalysis schema, enclosed in \`\`\`json ... \`\`\` marks, for detailed structured data. Make sure the JSON is valid.\n\nIf you cannot generate the structured JSON part for any reason, just provide the plain-text summary starting with \"Session Summary:\".`,
      model: this.config.model || "gpt-4o", // Ensure Responses-capable model
      // Type cast applied to avoid strict generic mismatches with OA SDK types
      tools: [readInteractionLogsTool as any],
    });

    // Prompt that instructs the agent to analyse the session; the agent will call the tool itself
    const prompt = `Analyze the tutoring session with ID ${sessionId}. Use the read_interaction_logs tool to get the interaction summary.${additionalContext ? "\n\n" + additionalContext : ""}\n\nBased only on that summary, provide your analysis including a concise text summary starting with 'Session Summary:' and, if possible, the SessionAnalysis JSON object in markdown format.`;

    const { finalOutput } = await runAgent(agent, prompt);

    // Ensure traces reach the dashboard before the Convex action returns
    await getGlobalTraceProvider().forceFlush();

    if (!finalOutput) {
      throw new Error("Session Analyzer agent did not return any output");
    }

    return finalOutput.toString();
  }

  private async readInteractionLogs(sessionId?: string): Promise<InteractionLogSummary> {
    try {
      if (!sessionId) {
        this.log("warn", "readInteractionLogs called without a sessionId, returning empty summary");
        return {
          total_interactions: 0,
          user_messages: 0,
          agent_responses: 0,
          topics_discussed: [],
          key_events: [],
          learning_moments: [],
          confusion_points: [],
          success_indicators: []
        };
      }

      this.log("info", `Reading interaction logs for session: ${sessionId}`);

      // ---------------------------------------------
      // Fetch logs from Convex if a context is provided
      // ---------------------------------------------
      // Ensure Convex context is available
      if (!this.convexCtx) {
        this.log("warn", "Convex context not provided to SessionAnalyzerAgent; returning empty interaction summary");
        return {
          total_interactions: 0,
          user_messages: 0,
          agent_responses: 0,
          topics_discussed: [],
          key_events: [],
          learning_moments: [],
          confusion_points: [],
          success_indicators: []
        };
      }

      let logs: any[] = await this.convexCtx!.runQuery(
        "functions:getInteractionLogs" as any,
        { sessionId: sessionId as any }
      );

      // Attempt to derive logs from agent thread messages (new streaming architecture)
      try {
        const sessionInfo: any = await this.convexCtx!.runQuery(
          "functions:getSessionInternal" as any,
          { sessionId: sessionId as any }
        );

        const threadId: string | undefined = sessionInfo?.context_data?.agent_thread_id;
        if (threadId) {
          const threadRes: any = await this.convexCtx!.runQuery(
            components.agent.messages.listMessagesByThreadId,
            {
              threadId,
              order: "desc",
              paginationOpts: { numItems: 100, cursor: null },
            }
          );
          const page: any[] = threadRes?.page || [];
          logs = page.map((m: any) => ({
            role: m.userId ? "user" : "assistant",
            content: m.text || m.content || "",
            timestamp: m.timestamp || m._creationTime,
          }));
        }
      } catch (fallbackErr) {
        this.log("warn", "Fallback to thread messages failed", fallbackErr);
      }

      if (logs.length === 0) {
        this.log("warn", "No interaction logs or messages found for session");
      }

      // Calculate basic metrics
      const total = logs.length;
      const userMsgs = logs.filter((l) => l.role === "user").length;
      const assistantMsgs = logs.filter((l) => l.role === "assistant" || l.role === "agent").length;

      // Extract simple topic keywords (very naive TF counts)
      const stopWords = new Set([
        "the","and","that","with","this","from","have","for","would","will","about","there","their","what","which","were","when","your","them","they","then","into","while","these","those","could","should","because","water","cycle"
      ]);

      const freq: Record<string, number> = {};
      for (const log of logs) {
        const content: string = (log.content || "").toLowerCase();
        const words = content.split(/[^a-zA-Z]+/);
        for (const w of words) {
          if (w.length < 4 || stopWords.has(w)) continue;
          freq[w] = (freq[w] || 0) + 1;
        }
      }

      const topics = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      // Key events – first few significant logs (trimmed)
      const keyEvents = logs.slice(0, 4).map((l) => {
        const text = (l.content || "").trim();
        return text.length > 120 ? text.slice(0, 120) + "…" : text;
      });

      const summary: InteractionLogSummary = {
        total_interactions: total,
        user_messages: userMsgs,
        agent_responses: assistantMsgs,
        topics_discussed: topics,
        key_events: keyEvents,
        learning_moments: [],
        confusion_points: [],
        success_indicators: [],
      };

      this.log("info", `Found ${summary.total_interactions} interactions (real)`);
      return summary;
    } catch (error) {
      this.log("error", "Failed to read interaction logs", error);
      return {
        total_interactions: 0,
        user_messages: 0,
        agent_responses: 0,
        topics_discussed: [],
        key_events: [],
        learning_moments: [],
        confusion_points: [],
        success_indicators: []
      };
    }
  }

  private formatInteractionSummary(summary: InteractionLogSummary): string {
    return `Total Interactions: ${summary.total_interactions}
User Messages: ${summary.user_messages}
Agent Responses: ${summary.agent_responses}

Topics Discussed:
${summary.topics_discussed.map(topic => `- ${topic}`).join('\n')}

Key Events:
${summary.key_events.map(event => `- ${event}`).join('\n')}

Learning Moments:
${summary.learning_moments.map(moment => `- ${moment}`).join('\n')}

Confusion Points:
${summary.confusion_points.map(point => `- ${point}`).join('\n')}

Success Indicators:
${summary.success_indicators.map(indicator => `- ${indicator}`).join('\n')}`;
  }

  private formatAdditionalContext(input: SessionAnalyzerInput): string {
    const contextParts: string[] = [];

    if (input.session_duration_seconds) {
      const minutes = Math.round(input.session_duration_seconds / 60);
      contextParts.push(`Session Duration: ${minutes} minutes`);
    }

    if (input.lesson_plan) {
      contextParts.push(`Lesson Plan: ${input.lesson_plan.title} - ${input.lesson_plan.description}`);
    }

    if (input.quiz && input.user_answers && input.quiz_feedback) {
      contextParts.push(`Quiz Performance: ${input.quiz_feedback.correct_answers}/${input.quiz_feedback.total_questions} correct (${input.quiz_feedback.score_percentage}%)`);
    }

    return contextParts.length > 0 ? `\nAdditional Context:\n${contextParts.join('\n')}` : '';
  }

  private parseAnalysisResult(analysisResult: string): {
    textSummary: string;
    structuredAnalysis: SessionAnalysis | null;
  } {
    let textSummary = "";
    let structuredAnalysis: SessionAnalysis | null = null;

    try {
      // Extract text summary
      const summaryMatch = analysisResult.match(/Session Summary:([^`]*?)(?=```|$)/s);
      if (summaryMatch) {
        textSummary = `Session Summary:${summaryMatch[1].trim()}`;
      } else {
        // Fallback: take the whole content if no proper summary found
        this.log("warn", "Could not find proper session summary format");
        textSummary = `Session Summary: ${analysisResult.substring(0, 300)}...`;
      }

      // Extract structured analysis if present
      const jsonMatch = analysisResult.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          structuredAnalysis = this.validateSessionAnalysis(jsonData);
        } catch (jsonError) {
          this.log("warn", "Failed to parse structured analysis JSON", jsonError);
        }
      }

    } catch (error) {
      this.log("error", "Failed to parse analysis result", error);
      textSummary = "Session Summary: Analysis could not be processed properly.";
    }

    return { textSummary, structuredAnalysis };
  }

  private validateSessionAnalysis(data: any): SessionAnalysis {
    // Ensure required fields with defaults
    const analysis: SessionAnalysis = {
      session_id: data.session_id || "",
      session_duration_seconds: data.session_duration_seconds,
      overall_effectiveness: typeof data.overall_effectiveness === "number" ? data.overall_effectiveness : 0,
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      improvement_areas: Array.isArray(data.improvement_areas) ? data.improvement_areas : [],
      lesson_plan_quality: data.lesson_plan_quality,
      lesson_plan_insights: Array.isArray(data.lesson_plan_insights) ? data.lesson_plan_insights : [],
      content_quality: data.content_quality,
      content_insights: Array.isArray(data.content_insights) ? data.content_insights : [],
      quiz_quality: data.quiz_quality,
      quiz_insights: Array.isArray(data.quiz_insights) ? data.quiz_insights : [],
      student_performance: data.student_performance,
      learning_insights: Array.isArray(data.learning_insights) ? data.learning_insights : [],
      teaching_effectiveness: data.teaching_effectiveness,
      teaching_insights: Array.isArray(data.teaching_insights) ? data.teaching_insights : [],
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      recommended_adjustments: Array.isArray(data.recommended_adjustments) ? data.recommended_adjustments : [],
      suggested_resources: Array.isArray(data.suggested_resources) ? data.suggested_resources : []
    };

    return analysis;
  }

  private async appendToKnowledgeBase(folderId: string, summary: string): Promise<void> {
    try {
      this.log("info", `Appending session summary to knowledge base for folder: ${folderId}`);
      
      // Note: In production, this would call a Convex mutation to append to knowledge base
      // await ctx.runMutation(api.folderCrud.appendToKnowledgeBase, {
      //   folderId,
      //   content: `\n\n${summary}`
      // });
      
    } catch (error) {
      this.log("error", "Failed to append to knowledge base", error);
      // Don't throw - this is not critical for the analysis itself
    }
  }

  // Generate text summary from structured analysis
  private generateTextSummaryFromAnalysis(analysis: SessionAnalysis): string {
    const parts: string[] = [
      "Session Summary:",
      `Overall Effectiveness: ${analysis.overall_effectiveness.toFixed(1)}/100.`
    ];

    if (analysis.strengths.length > 0) {
      parts.push("Strengths: " + analysis.strengths.join(", "));
    }

    if (analysis.improvement_areas.length > 0) {
      parts.push("Areas for Improvement: " + analysis.improvement_areas.join(", "));
    }

    // Add up to three learning insights
    if (analysis.learning_insights.length > 0) {
      parts.push("Key Learning Points:");
      analysis.learning_insights.slice(0, 3).forEach(insight => {
        const flag = insight.strength ? "Strength" : "Issue";
        parts.push(`- ${insight.topic} (${flag}): ${insight.observation} → ${insight.recommendation}`);
      });
    }

    if (analysis.recommendations.length > 0) {
      parts.push("Recommendation: " + analysis.recommendations[0]);
    }

    let summaryText = parts.join("\n");

    // Ensure word limit (300 words) – truncate gracefully if needed
    const words = summaryText.split(' ');
    if (words.length > 300) {
      summaryText = words.slice(0, 300).join(' ') + " …";
    }

    return summaryText;
  }
}

// Factory function for creating session analyzer agent instances
export function createSessionAnalyzerAgent(apiKey?: string, convexCtx?: ActionCtx): SessionAnalyzerAgent {
  return new SessionAnalyzerAgent(apiKey, convexCtx);
}

// Session analysis validation utilities
export class SessionAnalysisValidator {
  static validateSessionAnalysis(analysis: SessionAnalysis): boolean {
    if (!analysis.session_id || typeof analysis.session_id !== "string") {
      throw new Error("SessionAnalysis must have a valid session_id string");
    }

    if (typeof analysis.overall_effectiveness !== "number" || analysis.overall_effectiveness < 0 || analysis.overall_effectiveness > 100) {
      throw new Error("SessionAnalysis overall_effectiveness must be a number between 0 and 100");
    }

    if (!Array.isArray(analysis.strengths) || !Array.isArray(analysis.improvement_areas)) {
      throw new Error("SessionAnalysis must have strengths and improvement_areas as arrays");
    }

    return true;
  }

  static extractAnalysisMetrics(analysis: SessionAnalysis): {
    overallEffectiveness: number;
    strengthCount: number;
    improvementAreaCount: number;
    learningInsightCount: number;
    teachingInsightCount: number;
    recommendationCount: number;
  } {
    return {
      overallEffectiveness: analysis.overall_effectiveness,
      strengthCount: analysis.strengths.length,
      improvementAreaCount: analysis.improvement_areas.length,
      learningInsightCount: analysis.learning_insights.length,
      teachingInsightCount: analysis.teaching_insights.length,
      recommendationCount: analysis.recommendations.length
    };
  }
}

// Helper function for analyzing teaching sessions
export async function analyzeTeachingSession(
  sessionId: string,
  context: AgentContext,
  sessionData?: {
    lesson_plan?: LessonPlan;
    lesson_content?: LessonContent;
    quiz?: Quiz;
    user_answers?: QuizUserAnswers;
    quiz_feedback?: QuizFeedback;
    session_duration_seconds?: number;
  },
  apiKey?: string
): Promise<SessionAnalysis | null> {
  try {
    const agent = createSessionAnalyzerAgent(apiKey);
    const response = await agent.execute(context, {
      session_id: sessionId,
      ...sessionData
    });
    
    if (response.success && response.data?.analysis) {
      SessionAnalysisValidator.validateSessionAnalysis(response.data.analysis);
      return response.data.analysis;
    }
    
    console.error("Session analysis failed:", response.error);
    return null;
    
  } catch (error) {
    console.error("Error in analyzeTeachingSession:", error);
    return null;
  }
}

// Helper function for getting session summary
export async function getSessionSummary(
  sessionId: string,
  context: AgentContext,
  apiKey?: string
): Promise<string | null> {
  try {
    const agent = createSessionAnalyzerAgent(apiKey);
    const response = await agent.execute(context, { session_id: sessionId });
    
    if (response.success && response.data?.textSummary) {
      return response.data.textSummary;
    }
    
    console.error("Session summary generation failed:", response.error);
    return null;
    
  } catch (error) {
    console.error("Error in getSessionSummary:", error);
    return null;
  }
} 