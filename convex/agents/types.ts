// AI Agent Framework Types
// Translated from Python Pydantic models to TypeScript interfaces

export interface LessonContent {
  title: string;
  segment_index: number;
  is_last_segment: boolean;
  topic?: string;
  text: string;
  total_segments?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
  difficulty: string;
  related_section: string;
}

export interface Quiz {
  title: string;
  description: string;
  lesson_title: string;
  questions: QuizQuestion[];
  passing_score: number;
  total_points: number;
  estimated_completion_time_minutes: number;
}

export interface LearningObjective {
  title: string;
  description: string;
  priority: number;
}

export interface LessonSection {
  title: string;
  objectives: LearningObjective[];
  estimated_duration_minutes: number;
  concepts_to_cover: string[];
  prerequisites: string[];
  is_optional: boolean;
}

export interface LessonPlan {
  title: string;
  description: string;
  target_audience: string;
  prerequisites: string[];
  sections: LessonSection[];
  total_estimated_duration_minutes: number;
  additional_resources: string[];
}

export interface QuizUserAnswer {
  question_index: number;
  selected_option_index: number;
  time_taken_seconds?: number;
}

export interface QuizUserAnswers {
  quiz_title: string;
  user_answers: QuizUserAnswer[];
  total_time_taken_seconds?: number;
}

export interface QuizFeedbackItem {
  question_index: number;
  question_text: string;
  user_selected_option: string;
  is_correct: boolean;
  correct_option: string;
  explanation: string;
  improvement_suggestion: string;
}

export interface QuizFeedback {
  quiz_title: string;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  passed: boolean;
  total_time_taken_seconds: number;
  overall_feedback: string;
  suggested_study_topics: string[];
  next_steps: string[];
}

export interface LearningInsight {
  topic: string;
  observation: string;
  strength: boolean;
  recommendation: string;
}

export interface TeachingInsight {
  approach: string;
  effectiveness: string;
  evidence: string;
  suggestion: string;
}

export interface SessionAnalysis {
  session_id: string;
  session_duration_seconds?: number;
  overall_effectiveness: number;
  strengths: string[];
  improvement_areas: string[];
  lesson_plan_quality?: number;
  lesson_plan_insights: string[];
  content_quality?: number;
  content_insights: string[];
  quiz_quality?: number;
  quiz_insights: string[];
  student_performance?: number;
  learning_insights: LearningInsight[];
  teaching_effectiveness?: number;
  teaching_insights: TeachingInsight[];
  recommendations: string[];
  recommended_adjustments: string[];
  suggested_resources: string[];
}

export interface FocusObjective {
  topic: string;
  learning_goal: string;
  priority: number;
  relevant_concepts: string[];
  suggested_approach?: string;
  target_mastery: number;
  initial_difficulty?: string;
}

export type AgentType = "teacher" | "quiz_creator" | "explanation_checker";

export interface ActionSpec {
  agent: AgentType;
  params: Record<string, string | undefined>;
  success_criteria: string;
  max_steps: number;
}

export interface PlannerOutput {
  objective: FocusObjective;
  next_action: ActionSpec;
}

export type ExplanationStatus = "delivered" | "failed" | "skipped";

export interface ExplanationResult {
  status: ExplanationStatus;
  details?: string;
}

export type QuizCreationStatus = "created" | "failed";

export interface QuizCreationResult {
  status: QuizCreationStatus;
  quiz?: Quiz;
  question?: QuizQuestion;
  details?: string;
}

export interface AnalysisResult {
  analysis_text: string;
  key_concepts: string[];
  key_terms: Record<string, string>;
  file_names: string[];
  vector_store_id: string;
}

export interface DocumentAnalysis {
  file_names: string[];
  file_metadata: Record<string, Record<string, any>>;
  key_concepts: string[];
  concept_details: Record<string, string[]>;
  key_terms: Record<string, string>;
  vector_store_id: string;
  file_ids: string[];
}

export interface FileMetadata {
  title?: string;
  author?: string;
  date?: string;
  type?: string;
  size?: string;
  [key: string]: any; // Allow additional properties
}

export interface ConceptInfo {
  examples: string[];
  description?: string;
  [key: string]: any; // Allow additional properties
}

// Agent Configuration Types
export interface AgentConfig {
  name: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
}

export interface AgentContext {
  session_id: string;
  user_id: string;
  folder_id?: string;
  vector_store_id?: string;
  analysis_result?: AnalysisResult;
  focus_objective?: FocusObjective;
  user_model_state?: any; // TODO: Define proper UserModelState type
}

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  execution_time?: number;
  tokens_used?: number;
}

// Agent Registry
export interface RegisteredAgent {
  name: string;
  config: AgentConfig;
  handler: (context: AgentContext, input: any) => Promise<AgentResponse>;
}

export interface AgentRegistry {
  [agentName: string]: RegisteredAgent;
} 