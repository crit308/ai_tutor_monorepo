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
  constructor(apiKey?: string) {
    const config = createAgentConfig(
      "Session Analyzer",
      "gpt-4-turbo-preview", // Use latest model for analysis
      {
        temperature: 0.4, // Balanced for analytical consistency
        max_tokens: 4000
      }
    );
    super(config, apiKey);
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
    // 1. Read interaction logs
    const interactionSummary = await this.readInteractionLogs(sessionId);
    
    // 2. Analyze the session based on the interaction summary
    const analysisResult = await this.performSessionAnalysis(sessionId, interactionSummary, input);
    
    // 3. Extract text summary and structured analysis
    const { textSummary, structuredAnalysis } = this.parseAnalysisResult(analysisResult);
    
    // 4. Save analysis summary to knowledge base if needed
    if (context.folder_id && textSummary) {
      await this.appendToKnowledgeBase(context.folder_id, textSummary);
    }
    
    return {
      textSummary,
      analysis: structuredAnalysis
    };
  }

  private async readInteractionLogs(sessionId: string): Promise<InteractionLogSummary> {
    try {
      this.log("info", `Reading interaction logs for session: ${sessionId}`);
      
      // Note: In production, this would call a Convex query to get interaction logs
      // const logs = await ctx.runQuery(api.sessions.getInteractionLogs, { sessionId });
      
      // For now, simulate interaction log analysis
      const mockSummary: InteractionLogSummary = {
        total_interactions: 15,
        user_messages: 8,
        agent_responses: 7,
        topics_discussed: ["variables", "functions", "loops"],
        key_events: [
          "User asked about variable scope",
          "Agent provided explanation with examples",
          "User attempted practice exercise",
          "Agent gave feedback on solution"
        ],
        learning_moments: [
          "User understood local vs global scope",
          "Successfully implemented a simple function"
        ],
        confusion_points: [
          "Initial confusion about parameter passing",
          "Struggled with loop syntax"
        ],
        success_indicators: [
          "Asked follow-up questions",
          "Applied concepts correctly",
          "Showed progression in understanding"
        ]
      };

      this.log("info", `Found ${mockSummary.total_interactions} interactions`);
      return mockSummary;
      
    } catch (error) {
      this.log("error", "Failed to read interaction logs", error);
      // Return empty summary if logs can't be read
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

  private async performSessionAnalysis(
    sessionId: string,
    interactionSummary: InteractionLogSummary,
    input: SessionAnalyzerInput
  ): Promise<string> {
    const systemMessage = `You are an expert educational analyst specialized in evaluating tutoring sessions.

Your task is to analyze the tutoring session based on the provided interaction log summary.

Focus on:
- Student comprehension and performance patterns (e.g., areas of struggle, quick grasps)
- Effectiveness of teaching methods used by the agent (based on log events and responses)
- Alignment between the session interactions and potential learning objectives (infer if necessary)
- Actionable recommendations for future sessions or improvements
- Any potential issues or successes in the interaction flow

REQUIRED OUTPUT FORMAT:
1. A concise plain-text summary (max 300 words) suitable for appending to a knowledge base. Start this summary *exactly* with the phrase "Session Summary:". Do not include any preamble before this phrase.
2. Optionally, after the text summary, include a JSON object conforming to the SessionAnalysis schema, enclosed in \`\`\`json ... \`\`\` marks, for detailed structured data. Make sure the JSON is valid.

Example Text Summary:
Session Summary: The student grasped evaporation quickly but struggled with condensation, requiring multiple explanations and a targeted question. Overall progress was good. Recommend starting the next session with a brief review of condensation using a different analogy.

If you cannot generate the structured JSON part for any reason, just provide the plain-text summary starting with "Session Summary:".`;

    const interactionDetails = this.formatInteractionSummary(interactionSummary);
    const additionalContext = this.formatAdditionalContext(input);

    const userMessage = `Session ID: ${sessionId}

Interaction Log Summary:
${interactionDetails}

${additionalContext}

Based *only* on this summary, provide your analysis including a concise text summary starting with 'Session Summary:' and, if possible, the SessionAnalysis JSON object in markdown format.`;

    const response = await this.callOpenAI([
      {
        role: "system",
        content: systemMessage
      },
      {
        role: "user",
        content: userMessage
      }
    ]);

    return response.content;
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
export function createSessionAnalyzerAgent(apiKey?: string): SessionAnalyzerAgent {
  return new SessionAnalyzerAgent(apiKey);
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