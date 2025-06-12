import { BaseAgent, createAgentConfig } from "./base";
import { AgentContext, AgentResponse, FocusObjective, LessonContent, Quiz, QuizQuestion } from "./types";
import { WHITEBOARD_SKILLS_PROMPT } from "./whiteboard_agent";

export type TeacherAction = "explain" | "ask_mcq" | "evaluate";

export interface TeacherInput {
  action: TeacherAction;
  focus_objective?: FocusObjective;
  topic?: string; // for explain
  question?: string; // for evaluate
  user_answer?: string; // for evaluate
}

export interface ExplainOutput {
  lesson_content: LessonContent;
}

export interface AskMCQOutput {
  quiz_question: QuizQuestion;
}

export interface EvaluateOutput {
  feedback_text: string;
  is_correct: boolean;
}

export class TeacherAgent extends BaseAgent {
  constructor(apiKey?: string) {
    const config = createAgentConfig("Teacher Agent", "gpt-4o-mini", {
      temperature: 0.7,
      max_tokens: 3000,
      tools: ["file_search", "whiteboard"]
    });
    super(config, apiKey);
  }

  async execute(context: AgentContext, input: TeacherInput): Promise<AgentResponse<any>> {
    // Basic validation
    if (!input.action) {
      return this.createErrorResponse("TeacherAgent requires an action");
    }

    switch (input.action) {
      case "explain":
        return await this.handleExplain(context, input);
      case "ask_mcq":
        return await this.handleAskMCQ(context, input);
      case "evaluate":
        return await this.handleEvaluate(context, input);
      default:
        return this.createErrorResponse(`Unknown action: ${input.action}`);
    }
  }

  private async handleExplain(context: AgentContext, input: TeacherInput): Promise<AgentResponse<ExplainOutput>> {
    const topic = input.topic || input.focus_objective?.topic || "the next concept";

    const systemPrompt = `You are an AI teacher helping a student master ${topic}.${input.focus_objective ? "\nStudent goal: " + input.focus_objective.learning_goal : ""}\n\nProvide a concise, engaging explanation. Include examples or analogies if helpful. If a diagram would help, output a JSON whiteboard skill call according to the WHITEBOARD_SKILLS_PROMPT.`;

    const messages = [
      { role: "system", content: systemPrompt + "\n\n" + WHITEBOARD_SKILLS_PROMPT },
      { role: "user", content: `Please explain ${topic} to me.` }
    ];

    const { content } = await this.callOpenAI(messages, { temperature: this.config.temperature, max_tokens: 800 });

    const output: ExplainOutput = {
      lesson_content: {
        title: `Explanation of ${topic}`,
        segment_index: 0,
        is_last_segment: true,
        topic,
        text: content,
        total_segments: 1,
      },
    };

    return this.createResponse(output);
  }

  private async handleAskMCQ(context: AgentContext, input: TeacherInput): Promise<AgentResponse<AskMCQOutput>> {
    const topic = input.topic || input.focus_objective?.topic || "the previous explanation";
    const systemPrompt = `Create a multiple-choice question to test understanding of ${topic}. Provide 4 options, clearly indicate which option is correct (index starting at 0) and include a brief explanation.`;

    const messages = [
      { role: "system", content: systemPrompt },
    ];

    const { content } = await this.callOpenAI(messages, { temperature: this.config.temperature, max_tokens: 400, response_format: { type: "json_object" } });

    // Attempt to parse JSON; fallback to generic structure if fails
    let question: QuizQuestion;
    try {
      question = JSON.parse(content);
    } catch {
      // Fallback simplistic parsing
      question = {
        question: `Question about ${topic}`,
        options: [],
        correct_answer_index: 0,
        explanation: "",
        difficulty: "medium",
        related_section: topic,
      } as QuizQuestion;
    }

    const output: AskMCQOutput = { quiz_question: question };
    return this.createResponse(output);
  }

  private async handleEvaluate(context: AgentContext, input: TeacherInput): Promise<AgentResponse<EvaluateOutput>> {
    if (!input.question || input.user_answer === undefined) {
      return this.createErrorResponse("Evaluate action requires 'question' and 'user_answer'");
    }

    const systemPrompt = `You are evaluating a student's answer. Provide a short feedback and tell if it is correct.`;
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: `Question: ${input.question}` },
      { role: "assistant", content: `Student answer: ${input.user_answer}` },
    ];

    const { content } = await this.callOpenAI(messages, { temperature: this.config.temperature, max_tokens: 300 });

    // Heuristic: if content contains 'correct' etc.
    const isCorrect = /correct/i.test(content) && !/incorrect/i.test(content);
    const output: EvaluateOutput = { feedback_text: content, is_correct: isCorrect };
    return this.createResponse(output);
  }
}

export function createTeacherAgent(apiKey?: string) {
  return new TeacherAgent(apiKey);
} 