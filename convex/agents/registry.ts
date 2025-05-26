// Agent Registry and Orchestration
// Centralized management and coordination of all AI agents

import { agentManager } from "./base";
import { AgentContext, AgentResponse, RegisteredAgent, AgentConfig } from "./types";
import { AnalyzerAgent, createAnalyzerAgent, AnalyzerInput } from "./analyzerAgent";
import { PlannerAgent, createPlannerAgent, PlannerInput } from "./plannerAgent";
import { SessionAnalyzerAgent, createSessionAnalyzerAgent, SessionAnalyzerInput } from "./sessionAnalyzerAgent";

// Agent Names Constants
export const AGENT_NAMES = {
  ANALYZER: "analyzer",
  PLANNER: "planner", 
  SESSION_ANALYZER: "session_analyzer"
} as const;

export type AgentName = typeof AGENT_NAMES[keyof typeof AGENT_NAMES];

// Agent Configuration Registry
export class AgentConfigRegistry {
  private static instance: AgentConfigRegistry;
  private configs: Map<AgentName, AgentConfig> = new Map();

  private constructor() {
    this.initializeDefaultConfigs();
  }

  public static getInstance(): AgentConfigRegistry {
    if (!AgentConfigRegistry.instance) {
      AgentConfigRegistry.instance = new AgentConfigRegistry();
    }
    return AgentConfigRegistry.instance;
  }

  private initializeDefaultConfigs(): void {
    // Analyzer Agent Config
    this.configs.set(AGENT_NAMES.ANALYZER, {
      name: "Document Analyzer",
      model: "gpt-4-turbo-preview",
      temperature: 0.3,
      max_tokens: 4000,
      tools: ["file_search"]
    });

    // Planner Agent Config
    this.configs.set(AGENT_NAMES.PLANNER, {
      name: "Focus Planner",
      model: "gpt-4-turbo-preview",
      temperature: 0.5,
      max_tokens: 3000,
      tools: ["knowledge_base", "concept_graph"]
    });

    // Session Analyzer Config
    this.configs.set(AGENT_NAMES.SESSION_ANALYZER, {
      name: "Session Analyzer",
      model: "gpt-4-turbo-preview",
      temperature: 0.4,
      max_tokens: 4000,
      tools: ["interaction_logs"]
    });
  }

  getConfig(agentName: AgentName): AgentConfig | undefined {
    return this.configs.get(agentName);
  }

  updateConfig(agentName: AgentName, config: Partial<AgentConfig>): void {
    const existingConfig = this.configs.get(agentName);
    if (existingConfig) {
      this.configs.set(agentName, { ...existingConfig, ...config });
    }
  }

  getAllConfigs(): Record<AgentName, AgentConfig> {
    const result: Record<string, AgentConfig> = {};
    this.configs.forEach((config, name) => {
      result[name] = config;
    });
    return result as Record<AgentName, AgentConfig>;
  }
}

// Agent Factory
export class AgentFactory {
  private static apiKey?: string;

  static setApiKey(apiKey: string): void {
    AgentFactory.apiKey = apiKey;
  }

  static createAnalyzer(): AnalyzerAgent {
    return createAnalyzerAgent(AgentFactory.apiKey);
  }

  static createPlanner(): PlannerAgent {
    return createPlannerAgent(AgentFactory.apiKey);
  }

  static createSessionAnalyzer(): SessionAnalyzerAgent {
    return createSessionAnalyzerAgent(AgentFactory.apiKey);
  }

  static createAgent(agentName: AgentName): AnalyzerAgent | PlannerAgent | SessionAnalyzerAgent {
    switch (agentName) {
      case AGENT_NAMES.ANALYZER:
        return AgentFactory.createAnalyzer();
      case AGENT_NAMES.PLANNER:
        return AgentFactory.createPlanner();
      case AGENT_NAMES.SESSION_ANALYZER:
        return AgentFactory.createSessionAnalyzer();
      default:
        throw new Error(`Unknown agent name: ${agentName}`);
    }
  }
}

// Agent Workflow Orchestrator
export class AgentOrchestrator {
  private static instance: AgentOrchestrator;
  private registry = AgentConfigRegistry.getInstance();

  private constructor() {}

  public static getInstance(): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator();
    }
    return AgentOrchestrator.instance;
  }

  // Execute Document Analysis Workflow
  async executeDocumentAnalysis(
    context: AgentContext,
    vectorStoreId: string,
    maxResults?: number
  ): Promise<AgentResponse> {
    console.log(`[AgentOrchestrator] Starting document analysis workflow for vector store: ${vectorStoreId}`);
    
    try {
      const agent = AgentFactory.createAnalyzer();
      const input: AnalyzerInput = {
        vector_store_id: vectorStoreId,
        max_results: maxResults
      };

      const result = await agent.execute(context, input);
      
      console.log(`[AgentOrchestrator] Document analysis completed. Success: ${result.success}`);
      return result;

    } catch (error) {
      console.error(`[AgentOrchestrator] Document analysis workflow failed:`, error);
      return {
        success: false,
        error: `Document analysis workflow failed: ${error}`
      };
    }
  }

  // Execute Session Planning Workflow
  async executeSessionPlanning(
    context: AgentContext,
    userModelState?: any,
    forceFocus?: string
  ): Promise<AgentResponse> {
    console.log(`[AgentOrchestrator] Starting session planning workflow for session: ${context.session_id}`);
    
    try {
      const agent = AgentFactory.createPlanner();
      const input: PlannerInput = {
        user_model_state: userModelState,
        force_focus: forceFocus
      };

      const result = await agent.execute(context, input);
      
      console.log(`[AgentOrchestrator] Session planning completed. Success: ${result.success}`);
      return result;

    } catch (error) {
      console.error(`[AgentOrchestrator] Session planning workflow failed:`, error);
      return {
        success: false,
        error: `Session planning workflow failed: ${error}`
      };
    }
  }

  // Execute Session Analysis Workflow
  async executeSessionAnalysis(
    context: AgentContext,
    sessionId: string,
    sessionData?: any
  ): Promise<AgentResponse> {
    console.log(`[AgentOrchestrator] Starting session analysis workflow for session: ${sessionId}`);
    
    try {
      const agent = AgentFactory.createSessionAnalyzer();
      const input: SessionAnalyzerInput = {
        session_id: sessionId,
        ...sessionData
      };

      const result = await agent.execute(context, input);
      
      console.log(`[AgentOrchestrator] Session analysis completed. Success: ${result.success}`);
      return result;

    } catch (error) {
      console.error(`[AgentOrchestrator] Session analysis workflow failed:`, error);
      return {
        success: false,
        error: `Session analysis workflow failed: ${error}`
      };
    }
  }

  // Execute Complete Tutoring Workflow
  async executeCompleteWorkflow(
    context: AgentContext,
    workflowInput: {
      vectorStoreId?: string;
      userModelState?: any;
      forceFocus?: string;
      sessionData?: any;
    }
  ): Promise<{
    analysisResult?: AgentResponse;
    planningResult?: AgentResponse;
    sessionAnalysisResult?: AgentResponse;
    overallSuccess: boolean;
    errors: string[];
  }> {
    console.log(`[AgentOrchestrator] Starting complete tutoring workflow for session: ${context.session_id}`);
    
    const results = {
      analysisResult: undefined as AgentResponse | undefined,
      planningResult: undefined as AgentResponse | undefined,
      sessionAnalysisResult: undefined as AgentResponse | undefined,
      overallSuccess: false,
      errors: [] as string[]
    };

    try {
      // Step 1: Document Analysis (if vector store provided)
      if (workflowInput.vectorStoreId) {
        console.log(`[AgentOrchestrator] Step 1: Document Analysis`);
        results.analysisResult = await this.executeDocumentAnalysis(
          context,
          workflowInput.vectorStoreId
        );
        
        if (!results.analysisResult.success) {
          results.errors.push(`Document analysis failed: ${results.analysisResult.error}`);
        } else {
          // Store analysis result in context for subsequent agents
          context.analysis_result = results.analysisResult.data;
        }
      }

      // Step 2: Session Planning
      console.log(`[AgentOrchestrator] Step 2: Session Planning`);
      results.planningResult = await this.executeSessionPlanning(
        context,
        workflowInput.userModelState,
        workflowInput.forceFocus
      );
      
      if (!results.planningResult.success) {
        results.errors.push(`Session planning failed: ${results.planningResult.error}`);
      } else {
        // Store focus objective in context
        context.focus_objective = results.planningResult.data;
      }

      // Step 3: Session Analysis (if session data provided)
      if (workflowInput.sessionData) {
        console.log(`[AgentOrchestrator] Step 3: Session Analysis`);
        results.sessionAnalysisResult = await this.executeSessionAnalysis(
          context,
          context.session_id,
          workflowInput.sessionData
        );
        
        if (!results.sessionAnalysisResult.success) {
          results.errors.push(`Session analysis failed: ${results.sessionAnalysisResult.error}`);
        }
      }

      // Determine overall success
      const hasRequiredResults = results.planningResult?.success;
      const hasNoErrors = results.errors.length === 0;
      results.overallSuccess = hasRequiredResults && hasNoErrors;

      console.log(`[AgentOrchestrator] Complete workflow finished. Success: ${results.overallSuccess}, Errors: ${results.errors.length}`);
      
    } catch (error) {
      console.error(`[AgentOrchestrator] Complete workflow failed:`, error);
      results.errors.push(`Workflow execution failed: ${error}`);
      results.overallSuccess = false;
    }

    return results;
  }
}

// Performance Monitoring
export class AgentPerformanceMonitor {
  private static instance: AgentPerformanceMonitor;
  private metrics: Map<string, {
    executionCount: number;
    totalTime: number;
    successCount: number;
    errorCount: number;
    lastExecution: Date;
  }> = new Map();

  private constructor() {}

  public static getInstance(): AgentPerformanceMonitor {
    if (!AgentPerformanceMonitor.instance) {
      AgentPerformanceMonitor.instance = new AgentPerformanceMonitor();
    }
    return AgentPerformanceMonitor.instance;
  }

  recordExecution(
    agentName: string,
    success: boolean,
    executionTime: number
  ): void {
    const current = this.metrics.get(agentName) || {
      executionCount: 0,
      totalTime: 0,
      successCount: 0,
      errorCount: 0,
      lastExecution: new Date()
    };

    current.executionCount++;
    current.totalTime += executionTime;
    current.lastExecution = new Date();

    if (success) {
      current.successCount++;
    } else {
      current.errorCount++;
    }

    this.metrics.set(agentName, current);
  }

  getMetrics(agentName?: string): any {
    if (agentName) {
      const metrics = this.metrics.get(agentName);
      if (!metrics) return null;

      return {
        agentName,
        ...metrics,
        averageExecutionTime: metrics.totalTime / metrics.executionCount,
        successRate: metrics.successCount / metrics.executionCount
      };
    }

    // Return all metrics
    const allMetrics: any = {};
    this.metrics.forEach((metrics, name) => {
      allMetrics[name] = {
        agentName: name,
        ...metrics,
        averageExecutionTime: metrics.totalTime / metrics.executionCount,
        successRate: metrics.successCount / metrics.executionCount
      };
    });

    return allMetrics;
  }

  resetMetrics(agentName?: string): void {
    if (agentName) {
      this.metrics.delete(agentName);
    } else {
      this.metrics.clear();
    }
  }
}

// Initialization and Registration
export function initializeAgentSystem(apiKey?: string): void {
  console.log("[AgentRegistry] Initializing AI Agent System...");
  
  if (apiKey) {
    AgentFactory.setApiKey(apiKey);
  }

  const registry = AgentConfigRegistry.getInstance();
  const orchestrator = AgentOrchestrator.getInstance();
  const monitor = AgentPerformanceMonitor.getInstance();

  // Register agents with the base agent manager
  Object.values(AGENT_NAMES).forEach(agentName => {
    const config = registry.getConfig(agentName);
    if (config) {
      const registeredAgent: RegisteredAgent = {
        name: config.name,
        config,
        handler: async (context: AgentContext, input: any) => {
          const startTime = Date.now();
          try {
            const agent = AgentFactory.createAgent(agentName);
            const result = await agent.execute(context, input);
            
            const executionTime = Date.now() - startTime;
            monitor.recordExecution(agentName, result.success, executionTime);
            
            return result;
          } catch (error) {
            const executionTime = Date.now() - startTime;
            monitor.recordExecution(agentName, false, executionTime);
            throw error;
          }
        }
      };

      agentManager.register(agentName, registeredAgent);
    }
  });

  console.log(`[AgentRegistry] Initialized ${Object.keys(AGENT_NAMES).length} agents successfully`);
}

// Export singleton instances
export const agentConfigRegistry = AgentConfigRegistry.getInstance();
export const agentOrchestrator = AgentOrchestrator.getInstance();
export const agentPerformanceMonitor = AgentPerformanceMonitor.getInstance(); 