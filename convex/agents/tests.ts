// AI Agent Testing and Validation Framework
// Comprehensive regression testing and quality assurance for agent system

import {
  initializeAgentSystem,
  runDocumentAnalysis,
  planSession,
  analyzeSession,
  runCompleteWorkflow,
  getAgentSystemStatus,
  AgentFactory,
  agentPerformanceMonitor
} from "./index";
import type {
  AgentContext,
  AnalysisResult,
  FocusObjective,
  SessionAnalysis,
  UserModelState
} from "./index";

// Test Configuration
export interface TestConfig {
  apiKey?: string;
  timeout: number;
  enableDetailedLogging: boolean;
  skipSlowTests: boolean;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  overallPassed: boolean;
  totalDuration: number;
  passedCount: number;
  failedCount: number;
}

// Mock Data for Testing
export class MockDataProvider {
  static createMockContext(sessionId: string = "test-session", userId: string = "test-user"): AgentContext {
    return {
      session_id: sessionId,
      user_id: userId,
      folder_id: "test-folder",
      vector_store_id: "test-vector-store"
    };
  }

  static createMockUserModelState(): UserModelState {
    return {
      concepts: {
        "variables": {
          mastery: 0.9,
          confidence: 8,
          attempts: 5,
          last_interaction: new Date().toISOString()
        },
        "functions": {
          mastery: 0.6,
          confidence: 6,
          attempts: 3,
          last_interaction: new Date().toISOString()
        },
        "loops": {
          mastery: 0.3,
          confidence: 4,
          attempts: 1,
          last_interaction: new Date().toISOString()
        }
      }
    };
  }

  static createMockSessionData(): any {
    return {
      session_duration_seconds: 1800, // 30 minutes
      lesson_plan: {
        title: "JavaScript Fundamentals",
        description: "Introduction to JavaScript programming concepts",
        target_audience: "beginner",
        prerequisites: [],
        sections: [
          {
            title: "Variables and Data Types",
            objectives: [
              { title: "Understand variable declaration", description: "Learn let, const, var", priority: 1 }
            ],
            estimated_duration_minutes: 15,
            concepts_to_cover: ["variables", "data types"],
            prerequisites: [],
            is_optional: false
          }
        ],
        total_estimated_duration_minutes: 30,
        additional_resources: []
      },
      quiz_feedback: {
        quiz_title: "Variables Quiz",
        total_questions: 5,
        correct_answers: 4,
        score_percentage: 80,
        passed: true,
        total_time_taken_seconds: 300,
        overall_feedback: "Good understanding of variables",
        suggested_study_topics: ["const vs let"],
        next_steps: ["Practice with functions"]
      }
    };
  }
}

// Test Runner
export class AgentTestRunner {
  private config: TestConfig;
  private results: TestSuite[] = [];

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      timeout: 30000, // 30 seconds
      enableDetailedLogging: false,
      skipSlowTests: false,
      ...config
    };
  }

  async runAllTests(): Promise<{
    suites: TestSuite[];
    overallPassed: boolean;
    summary: {
      totalTests: number;
      totalPassed: number;
      totalFailed: number;
      totalDuration: number;
    };
  }> {
    console.log("🚀 Starting AI Agent System Tests...");
    
    // Initialize the agent system
    if (this.config.apiKey) {
      initializeAgentSystem(this.config.apiKey);
    } else {
      console.warn("⚠️ No API key provided - using mock OpenAI responses");
    }

    this.results = [];

    // Run test suites in order
    await this.runSystemIntegrationTests();
    await this.runAnalyzerAgentTests();
    await this.runPlannerAgentTests();
    await this.runSessionAnalyzerTests();
    await this.runWorkflowTests();
    await this.runPerformanceTests();
    
    // Calculate summary
    const summary = this.calculateSummary();
    const overallPassed = this.results.every(suite => suite.overallPassed);

    console.log(`✅ Tests completed. Overall: ${overallPassed ? "PASSED" : "FAILED"}`);
    console.log(`📊 Summary: ${summary.totalPassed}/${summary.totalTests} tests passed`);

    return {
      suites: this.results,
      overallPassed,
      summary
    };
  }

  private async runSystemIntegrationTests(): Promise<void> {
    const suite = await this.runTestSuite("System Integration", [
      {
        name: "Agent System Initialization",
        test: async () => {
          const status = getAgentSystemStatus();
          if (!status.initialized) {
            throw new Error("Agent system not initialized");
          }
          if (status.registeredAgents.length === 0) {
            throw new Error("No agents registered");
          }
          return { agentCount: status.registeredAgents.length };
        }
      },
      {
        name: "Agent Factory Creation",
        test: async () => {
          const analyzer = AgentFactory.createAnalyzer();
          const planner = AgentFactory.createPlanner();
          const sessionAnalyzer = AgentFactory.createSessionAnalyzer();
          
          if (!analyzer || !planner || !sessionAnalyzer) {
            throw new Error("Failed to create agent instances");
          }
          
          return { created: ["analyzer", "planner", "session_analyzer"] };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runAnalyzerAgentTests(): Promise<void> {
    const suite = await this.runTestSuite("Analyzer Agent", [
      {
        name: "Document Analysis Execution",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const result = await runDocumentAnalysis(context, "test-vector-store", 5);
          
          if (!result) {
            throw new Error("Document analysis returned null");
          }
          
          this.validateAnalysisResult(result);
          return { vectorStoreId: result.vector_store_id, conceptCount: result.key_concepts.length };
        }
      },
      {
        name: "Analysis Result Validation",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const result = await runDocumentAnalysis(context, "validation-test");
          
          if (!result) {
            throw new Error("Analysis result is null");
          }
          
          // Check required fields
          if (!result.analysis_text || result.analysis_text.trim().length === 0) {
            throw new Error("Analysis text is empty");
          }
          
          if (!Array.isArray(result.key_concepts)) {
            throw new Error("Key concepts is not an array");
          }
          
          if (!result.vector_store_id) {
            throw new Error("Vector store ID is missing");
          }
          
          return { validated: true };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runPlannerAgentTests(): Promise<void> {
    const suite = await this.runTestSuite("Planner Agent", [
      {
        name: "Session Focus Planning",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const userModelState = MockDataProvider.createMockUserModelState();
          
          const result = await planSession(context, userModelState);
          
          if (!result) {
            throw new Error("Session planning returned null");
          }
          
          this.validateFocusObjective(result);
          return { topic: result.topic, priority: result.priority };
        }
      },
      {
        name: "Force Focus Planning",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const forceFocus = "advanced concepts";
          
          const result = await planSession(context, undefined, forceFocus);
          
          if (!result) {
            throw new Error("Force focus planning returned null");
          }
          
          // Check if the forced focus influenced the result
          const topicLower = result.topic.toLowerCase();
          const focusLower = forceFocus.toLowerCase();
          
          if (!topicLower.includes(focusLower.split(' ')[0])) {
            console.warn(`Force focus may not have been applied: ${result.topic}`);
          }
          
          return { forcedFocus: forceFocus, resultTopic: result.topic };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runSessionAnalyzerTests(): Promise<void> {
    const suite = await this.runTestSuite("Session Analyzer", [
      {
        name: "Session Analysis Execution",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const sessionData = MockDataProvider.createMockSessionData();
          
          const result = await analyzeSession(context, "test-session", sessionData);
          
          if (!result) {
            throw new Error("Session analysis returned null");
          }
          
          if (!result.textSummary || !result.textSummary.startsWith("Session Summary:")) {
            throw new Error("Invalid text summary format");
          }
          
          return { hasAnalysis: !!result.analysis, summaryLength: result.textSummary.length };
        }
      },
      {
        name: "Session Analysis Validation",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const result = await analyzeSession(context, "validation-session");
          
          if (!result) {
            throw new Error("Session analysis result is null");
          }
          
          if (result.analysis) {
            this.validateSessionAnalysis(result.analysis);
          }
          
          return { validated: true };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runWorkflowTests(): Promise<void> {
    const suite = await this.runTestSuite("Complete Workflow", [
      {
        name: "Full Workflow Execution",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const userModelState = MockDataProvider.createMockUserModelState();
          const sessionData = MockDataProvider.createMockSessionData();
          
          const result = await runCompleteWorkflow(context, {
            vectorStoreId: "workflow-test",
            userModelState,
            sessionData
          });
          
          if (!result.overallSuccess) {
            throw new Error(`Workflow failed: ${result.errors.join(", ")}`);
          }
          
          return { 
            hasAnalysis: !!result.analysisResult,
            hasPlanning: !!result.planningResult,
            hasSessionAnalysis: !!result.sessionAnalysisResult
          };
        }
      },
      {
        name: "Workflow Error Handling",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          // Pass invalid data to test error handling
          context.user_id = ""; // Invalid user ID
          
          const result = await runCompleteWorkflow(context, {
            vectorStoreId: "error-test"
          });
          
          // Should handle errors gracefully
          if (result.overallSuccess) {
            console.warn("Expected workflow to fail with invalid context");
          }
          
          return { errorCount: result.errors.length };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runPerformanceTests(): Promise<void> {
    if (this.config.skipSlowTests) {
      console.log("⏩ Skipping performance tests (skipSlowTests enabled)");
      return;
    }

    const suite = await this.runTestSuite("Performance", [
      {
        name: "Agent Response Time",
        test: async () => {
          const context = MockDataProvider.createMockContext();
          const startTime = Date.now();
          
          await planSession(context);
          
          const responseTime = Date.now() - startTime;
          
          if (responseTime > 10000) { // 10 seconds
            throw new Error(`Response time too slow: ${responseTime}ms`);
          }
          
          return { responseTime };
        }
      },
      {
        name: "Performance Metrics Collection",
        test: async () => {
          // Run a few operations to generate metrics
          const context = MockDataProvider.createMockContext();
          await planSession(context);
          await runDocumentAnalysis(context, "perf-test");
          
          const metrics = agentPerformanceMonitor.getMetrics();
          
          if (Object.keys(metrics).length === 0) {
            throw new Error("No performance metrics collected");
          }
          
          return { metricsCount: Object.keys(metrics).length };
        }
      }
    ]);

    this.results.push(suite);
  }

  private async runTestSuite(suiteName: string, tests: Array<{ name: string; test: () => Promise<any> }>): Promise<TestSuite> {
    console.log(`🧪 Running ${suiteName} tests...`);
    
    const suite: TestSuite = {
      suiteName,
      results: [],
      overallPassed: true,
      totalDuration: 0,
      passedCount: 0,
      failedCount: 0
    };

    for (const { name, test } of tests) {
      const result = await this.runSingleTest(name, test);
      suite.results.push(result);
      suite.totalDuration += result.duration;
      
      if (result.passed) {
        suite.passedCount++;
      } else {
        suite.failedCount++;
        suite.overallPassed = false;
      }
    }

    const status = suite.overallPassed ? "✅" : "❌";
    console.log(`${status} ${suiteName}: ${suite.passedCount}/${tests.length} tests passed`);
    
    return suite;
  }

  private async runSingleTest(testName: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const details = await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Test timeout after ${this.config.timeout}ms`)), this.config.timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      
      if (this.config.enableDetailedLogging) {
        console.log(`  ✅ ${testName} (${duration}ms)`);
      }

      return {
        testName,
        passed: true,
        duration,
        details
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.config.enableDetailedLogging) {
        console.log(`  ❌ ${testName} (${duration}ms): ${errorMessage}`);
      }

      return {
        testName,
        passed: false,
        duration,
        error: errorMessage
      };
    }
  }

  private validateAnalysisResult(result: AnalysisResult): void {
    if (!result.analysis_text || typeof result.analysis_text !== "string") {
      throw new Error("Invalid analysis_text");
    }
    if (!Array.isArray(result.key_concepts)) {
      throw new Error("Invalid key_concepts array");
    }
    if (!result.vector_store_id || typeof result.vector_store_id !== "string") {
      throw new Error("Invalid vector_store_id");
    }
  }

  private validateFocusObjective(objective: FocusObjective): void {
    if (!objective.topic || typeof objective.topic !== "string") {
      throw new Error("Invalid topic");
    }
    if (!objective.learning_goal || typeof objective.learning_goal !== "string") {
      throw new Error("Invalid learning_goal");
    }
    if (typeof objective.priority !== "number" || objective.priority < 1 || objective.priority > 5) {
      throw new Error("Invalid priority");
    }
    if (typeof objective.target_mastery !== "number" || objective.target_mastery < 0 || objective.target_mastery > 1) {
      throw new Error("Invalid target_mastery");
    }
  }

  private validateSessionAnalysis(analysis: SessionAnalysis): void {
    if (!analysis.session_id || typeof analysis.session_id !== "string") {
      throw new Error("Invalid session_id");
    }
    if (typeof analysis.overall_effectiveness !== "number") {
      throw new Error("Invalid overall_effectiveness");
    }
    if (!Array.isArray(analysis.strengths) || !Array.isArray(analysis.improvement_areas)) {
      throw new Error("Invalid strengths or improvement_areas");
    }
  }

  private calculateSummary(): {
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalDuration: number;
  } {
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    for (const suite of this.results) {
      totalTests += suite.results.length;
      totalPassed += suite.passedCount;
      totalFailed += suite.failedCount;
      totalDuration += suite.totalDuration;
    }

    return { totalTests, totalPassed, totalFailed, totalDuration };
  }
}

// Convenience function to run tests
export async function runAgentTests(config?: Partial<TestConfig>) {
  const runner = new AgentTestRunner(config);
  return await runner.runAllTests();
} 