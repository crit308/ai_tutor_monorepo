// AI Agent System - Main Export
// Entry point for all AI agent functionality

// Core Framework
export { BaseAgent, AgentUtils, createAgentConfig, agentManager } from "./base";

// Types and Interfaces
export type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  RegisteredAgent,
  AgentRegistry,
  LessonContent,
  QuizQuestion,
  Quiz,
  LearningObjective,
  LessonSection,
  LessonPlan,
  QuizUserAnswer,
  QuizUserAnswers,
  QuizFeedbackItem,
  QuizFeedback,
  LearningInsight,
  TeachingInsight,
  SessionAnalysis,
  FocusObjective,
  AgentType,
  ActionSpec,
  PlannerOutput,
  ExplanationStatus,
  ExplanationResult,
  QuizCreationStatus,
  QuizCreationResult,
  AnalysisResult,
  DocumentAnalysis,
  FileMetadata,
  ConceptInfo
} from "./types";

// Individual Agents
export {
  AnalyzerAgent
} from "./analyzerAgent";

export {
  PlannerAgent,
  createPlannerAgent,
  PlanningValidator,
  determineSessionFocus
} from "./plannerAgent";
export type { PlannerInput, UserModelState, ConceptState } from "./plannerAgent";

export {
  SessionAnalyzerAgent,
  createSessionAnalyzerAgent,
  SessionAnalysisValidator,
  analyzeTeachingSession,
  getSessionSummary
} from "./sessionAnalyzerAgent";
export type { SessionAnalyzerInput, InteractionLogSummary } from "./sessionAnalyzerAgent";

// Registry and Orchestration
export {
  AgentFactory,
  AgentOrchestrator,
  AgentConfigRegistry,
  AgentPerformanceMonitor,
  AGENT_NAMES,
  initializeAgentSystem,
  agentConfigRegistry,
  agentOrchestrator,
  agentPerformanceMonitor
} from "./registry";
export type { AgentName } from "./registry";

// Convenience Functions for Common Operations
export async function runDocumentAnalysis(
  context: AgentContext,
  vectorStoreId: string,
  maxResults?: number
): Promise<AnalysisResult | null> {
  try {
    const response = await agentOrchestrator.executeDocumentAnalysis(
      context,
      vectorStoreId,
      maxResults
    );
    return response.success ? response.data : null;
  } catch (error) {
    console.error("Document analysis failed:", error);
    return null;
  }
}

export async function planSession(
  context: AgentContext,
  userModelState?: any,
  forceFocus?: string
): Promise<FocusObjective | null> {
  try {
    const response = await agentOrchestrator.executeSessionPlanning(
      context,
      userModelState,
      forceFocus
    );
    return response.success ? response.data : null;
  } catch (error) {
    console.error("Session planning failed:", error);
    return null;
  }
}

export async function analyzeSession(
  context: AgentContext,
  sessionId: string,
  sessionData?: any,
  convexCtx?: import("../_generated/server").ActionCtx
): Promise<{ textSummary: string; analysis: SessionAnalysis | null } | null> {
  try {
    const response = await agentOrchestrator.executeSessionAnalysis(
      context,
      sessionId,
      sessionData,
      convexCtx
    );
    return response.success ? response.data : null;
  } catch (error) {
    console.error("Session analysis failed:", error);
    return null;
  }
}

export async function runCompleteWorkflow(
  context: AgentContext,
  workflowInput: {
    vectorStoreId?: string;
    userModelState?: any;
    forceFocus?: string;
    sessionData?: any;
  }
): Promise<{
  analysisResult?: AnalysisResult;
  planningResult?: FocusObjective;
  sessionAnalysisResult?: { textSummary: string; analysis: SessionAnalysis | null };
  overallSuccess: boolean;
  errors: string[];
}> {
  try {
    const result = await agentOrchestrator.executeCompleteWorkflow(context, workflowInput);
    
    return {
      analysisResult: result.analysisResult?.success ? result.analysisResult.data : undefined,
      planningResult: result.planningResult?.success ? result.planningResult.data : undefined,
      sessionAnalysisResult: result.sessionAnalysisResult?.success ? result.sessionAnalysisResult.data : undefined,
      overallSuccess: result.overallSuccess,
      errors: result.errors
    };
  } catch (error) {
    console.error("Complete workflow failed:", error);
    return {
      overallSuccess: false,
      errors: [`Workflow execution failed: ${error}`]
    };
  }
}

// System Status and Health Checks
export function getAgentSystemStatus(): {
  initialized: boolean;
  registeredAgents: string[];
  performanceMetrics: any;
} {
  const registeredAgents = agentManager.listAgents();
  const performanceMetrics = agentPerformanceMonitor.getMetrics();
  
  return {
    initialized: registeredAgents.length > 0,
    registeredAgents,
    performanceMetrics
  };
}

// Configuration Helpers
export function updateAgentConfig(agentName: AgentName, config: Partial<AgentConfig>): void {
  agentConfigRegistry.updateConfig(agentName, config);
}

export function getAgentConfig(agentName: AgentName): AgentConfig | undefined {
  return agentConfigRegistry.getConfig(agentName);
}

export function getAllAgentConfigs(): Record<AgentName, AgentConfig> {
  return agentConfigRegistry.getAllConfigs();
}

// Import required types for convenience functions
import { agentOrchestrator, agentPerformanceMonitor, agentConfigRegistry } from "./registry";
import { agentManager } from "./base";
import type { AgentContext, AnalysisResult, FocusObjective, SessionAnalysis, AgentConfig } from "./types";
import type { AgentName } from "./registry"; 