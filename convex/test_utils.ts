// convex/test_utils.ts - Enhanced Testing Framework for Day 13-14
import { api } from "./_generated/api";
import { query, action } from "./_generated/server";
import { v } from "convex/values";

// Enhanced test helper class for comprehensive skill validation
export class SkillTestHelper {
  constructor(private ctx: any) {}

  async testCreateMCQSmoke() {
    const mcqData = {
      question: "What is 2+2?",
      options: ["3", "4", "5"],
      correct_index: 1
    };

    const result = await this.ctx.runAction(api.skills.educational_content.createEducationalContent, {
      content_type: "mcq",
      data: mcqData,
      session_id: "test-session",
    });

    // Assertions
    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid payload structure");
    }
    
    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected exactly one action");
    }

    if (result.actions[0].type !== "ADD_OBJECTS") {
      throw new Error("Expected ADD_OBJECTS action");
    }

    if (!result.actions[0].batch_id) {
      throw new Error("Missing batch_id");
    }

    return "MCQ smoke test passed";
  }

  async testBatchOperationsSmoke() {
    const operations = [
      {
        operation_type: "add_text" as const,
        data: { text: "Hello", x: 100, y: 50 }
      },
      {
        operation_type: "add_shape" as const,
        data: { shape_type: "circle", x: 200, y: 100 }
      }
    ];

    const result = await this.ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
      operations,
      session_id: "test-session",
    });

    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid payload structure");
    }

    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected batched into single action");
    }

    if (result.actions[0].type !== "ADD_OBJECTS") {
      throw new Error("Expected ADD_OBJECTS action");
    }

    if (result.actions[0].objects.length !== 2) {
      throw new Error("Expected 2 objects in batch");
    }

    return "Batch operations smoke test passed";
  }

  async testSkillCountReduction() {
    // Query skill metrics to count active skills
    const skills = await this.ctx.runQuery(api.metrics.getActiveSkillCount);
    
    if (skills.whiteboard_skills > 10) {
      throw new Error(`Too many whiteboard skills: ${skills.whiteboard_skills}`);
    }

    return `Skill count validation passed: ${skills.whiteboard_skills}/10`;
  }

  async testWhiteboardModification() {
    const updates = [
      {
        object_id: "test-object-1",
        updates: { x: 150, y: 75, fill: "#ff0000" }
      }
    ];

    const result = await this.ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
      updates,
      session_id: "test-session",
    });

    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid modification payload structure");
    }

    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected exactly one modification action");
    }

    if (result.actions[0].type !== "UPDATE_OBJECTS") {
      throw new Error("Expected UPDATE_OBJECTS action");
    }

    return "Whiteboard modification test passed";
  }

  async testClearWhiteboard() {
    const result = await this.ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
      scope: "all",
      session_id: "test-session",
    });

    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid clear payload structure");
    }

    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected exactly one clear action");
    }

    if (result.actions[0].type !== "CLEAR_CANVAS") {
      throw new Error("Expected CLEAR_CANVAS action");
    }

    return "Clear whiteboard test passed";
  }

  // Day 13-14: Enhanced integration testing
  async testEducationalContentIntegration() {
    const testCases = [
      {
        content_type: "mcq" as const,
        data: {
          question: "What is the capital of France?",
          options: ["London", "Paris", "Berlin", "Madrid"],
          correct_index: 1,
          explanation: "Paris is the capital and largest city of France."
        }
      },
      {
        content_type: "table" as const,
        data: {
          headers: ["Name", "Age", "City"],
          rows: [["Alice", "25", "New York"], ["Bob", "30", "London"]],
          title: "Sample Data Table"
        }
      },
      {
        content_type: "diagram" as const,
        data: {
          diagram_type: "flowchart",
          elements: [
            { id: "start", text: "Start", x: 100, y: 50 },
            { id: "process", text: "Process", x: 100, y: 150 },
            { id: "end", text: "End", x: 100, y: 250 }
          ],
          title: "Sample Flowchart"
        }
      }
    ];

    for (const testCase of testCases) {
      const result = await this.ctx.runAction(api.skills.educational_content.createEducationalContent, {
        ...testCase,
        session_id: "integration-test",
      });

      if (!result.payload || result.payload.message_type !== "status_update") {
        throw new Error(`Integration test failed for ${testCase.content_type}: Invalid payload`);
      }

      if (!result.actions || result.actions.length === 0) {
        throw new Error(`Integration test failed for ${testCase.content_type}: No actions generated`);
      }
    }

    return "Educational content integration test passed";
  }

  // Day 13-14: Legacy compatibility testing
  async testLegacyCompatibility() {
    // Test legacy MCQ skill routing
    const legacyResult = await this.ctx.runAction(api.legacy.migration_bridge.legacyDrawMCQActions, {
      question_data: {
        question: "Legacy MCQ Test",
        options: ["A", "B", "C"],
        correct_option_index: 1,
        explanation: "This is a legacy test"
      },
      session_id: "legacy-test",
    });

    if (!legacyResult.payload) {
      throw new Error("Legacy compatibility test failed: No payload");
    }

    return "Legacy compatibility test passed";
  }

  // Day 13-14: Stress testing for batch operations
  async testBatchStressLoad(operationCount: number = 50) {
    const operations = Array.from({ length: operationCount }, (_, i) => ({
      operation_type: "add_text" as const,
      data: { 
        text: `Stress Test Item ${i}`, 
        x: 50 + (i % 10) * 80, 
        y: 50 + Math.floor(i / 10) * 40,
        fontSize: 12 + (i % 3) * 2
      }
    }));

    const startTime = Date.now();
    const result = await this.ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
      operations,
      session_id: "stress-test",
    });
    const endTime = Date.now();

    if (!result.payload || !result.actions) {
      throw new Error("Stress test failed: Invalid result structure");
    }

    const elapsedMs = endTime - startTime;
    if (elapsedMs > 10000) { // 10 second timeout
      throw new Error(`Stress test failed: Too slow (${elapsedMs}ms)`);
    }

    return `Stress test passed: ${operationCount} operations in ${elapsedMs}ms`;
  }

  // Day 13-14: Error handling validation
  async testErrorHandling() {
    try {
      // Test invalid MCQ data
      await this.ctx.runAction(api.skills.educational_content.createEducationalContent, {
        content_type: "mcq",
        data: {
          question: "", // Invalid: empty question
          options: [], // Invalid: empty options
          correct_index: 5 // Invalid: out of bounds
        },
        session_id: "error-test",
      });
      throw new Error("Expected error for invalid MCQ data");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Expected error")) {
        throw error; // Re-throw unexpected success
      }
      // Expected error - test passed
    }

    return "Error handling test passed";
  }
}

// Day 13-14: Enhanced performance testing action
export const testBatchVsIndividualPerformance = action({
  args: {
    iterations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const iterations = args.iterations || 10;
    const startTime = Date.now();
    
    // Test individual operations (old way simulation)
    for (let i = 0; i < iterations; i++) {
      await ctx.runAction(api.skills.educational_content.createEducationalContent, {
        content_type: "mcq",
        data: {
          question: `Q${i}`,
          options: ["A", "B"],
          correct_index: 0
        },
        session_id: "perf-test-individual",
      });
    }
    const individualTime = Date.now() - startTime;

    // Test batched operations (new way)
    const batchStartTime = Date.now();
    const operations = Array.from({ length: iterations }, (_, i) => ({
      operation_type: "add_text" as const,
      data: { text: `Question ${i}`, x: 100, y: 50 + i * 30 }
    }));

    await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
      operations,
      session_id: "perf-test-batch",
    });
    const batchTime = Date.now() - batchStartTime;

    const improvement = (individualTime - batchTime) / individualTime;
    
    // Log performance metrics
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "performance_test",
      details: `Individual: ${individualTime}ms, Batch: ${batchTime}ms, Improvement: ${(improvement * 100).toFixed(1)}%`,
    });

    if (improvement < 0.4) {
      throw new Error(`Expected >40% improvement, got ${(improvement * 100).toFixed(1)}%`);
    }

    return {
      individual_time: individualTime,
      batch_time: batchTime,
      improvement: improvement,
      iterations: iterations,
      improvement_percentage: `${(improvement * 100).toFixed(1)}%`
    };
  },
});

// Day 13-14: Comprehensive skill testing action with enhanced coverage
export const runComprehensiveSkillTests = action({
  args: {
    test_session_id: v.optional(v.string()),
    include_stress_tests: v.optional(v.boolean()),
    stress_test_size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const testSessionId = args.test_session_id || `comprehensive-test-${Date.now()}`;
    const includeStressTests = args.include_stress_tests || false;
    const stressTestSize = args.stress_test_size || 25;
    const testHelper = new SkillTestHelper(ctx);
    const results: any[] = [];

    // Core skill tests
    const coreTests = [
      { name: "MCQ_Creation", test: () => testHelper.testCreateMCQSmoke() },
      { name: "Batch_Operations", test: () => testHelper.testBatchOperationsSmoke() },
      { name: "Skill_Count", test: () => testHelper.testSkillCountReduction() },
      { name: "Whiteboard_Modification", test: () => testHelper.testWhiteboardModification() },
      { name: "Clear_Whiteboard", test: () => testHelper.testClearWhiteboard() },
    ];

    // Day 13-14: Enhanced integration tests
    const integrationTests = [
      { name: "Educational_Content_Integration", test: () => testHelper.testEducationalContentIntegration() },
      { name: "Legacy_Compatibility", test: () => testHelper.testLegacyCompatibility() },
      { name: "Error_Handling", test: () => testHelper.testErrorHandling() },
    ];

    // Day 13-14: Optional stress tests
    const stressTests = includeStressTests ? [
      { name: "Batch_Stress_Load", test: () => testHelper.testBatchStressLoad(stressTestSize) },
    ] : [];

    const allTests = [...coreTests, ...integrationTests, ...stressTests];

    for (const { name, test } of allTests) {
      try {
        const result = await test();
        results.push({ test: name, status: "PASS", message: result });
      } catch (error) {
        results.push({ 
          test: name, 
          status: "FAIL", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    // Log comprehensive test results
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "comprehensive_skill_tests",
      details: `Ran ${results.length} tests. Passed: ${results.filter(r => r.status === "PASS").length}, Failed: ${results.filter(r => r.status === "FAIL").length}`,
    });

    const summary = {
      test_type: "COMPREHENSIVE",
      total_tests: results.length,
      passed: results.filter(r => r.status === "PASS").length,
      failed: results.filter(r => r.status === "FAIL").length,
      success_rate: `${((results.filter(r => r.status === "PASS").length / results.length) * 100).toFixed(1)}%`,
      test_session_id: testSessionId,
      included_stress_tests: includeStressTests,
      results: results
    };

    return summary;
  },
});

// Day 13-14: Load testing action for performance validation
export const runLoadTests = action({
  args: {
    concurrent_operations: v.optional(v.number()),
    operation_count_per_batch: v.optional(v.number()),
  },
  returns: v.object({
    test_type: v.string(),
    concurrent_batches: v.number(),
    operations_per_batch: v.number(),
    total_operations: v.number(),
    total_elapsed_ms: v.number(),
    operations_per_second: v.number(),
    success: v.boolean(),
    all_batches_completed: v.optional(v.boolean()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const concurrentOps = args.concurrent_operations || 5;
    const opsPerBatch = args.operation_count_per_batch || 20;
    
    const startTime = Date.now();
    
    // Create multiple concurrent batch operations
    const loadTestPromises: Promise<any>[] = Array.from({ length: concurrentOps }, async (_, batchIndex): Promise<any> => {
      const operations = Array.from({ length: opsPerBatch }, (_, opIndex) => ({
        operation_type: "add_text" as const,
        data: {
          text: `Load Test B${batchIndex} Op${opIndex}`,
          x: 50 + (opIndex % 10) * 60,
          y: 50 + batchIndex * 80,
          fontSize: 12
        }
      }));

      return ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
        operations,
        session_id: `load-test-batch-${batchIndex}`,
      });
    });

    try {
      const results: any[] = await Promise.all(loadTestPromises);
      const endTime = Date.now();
      const totalElapsed = endTime - startTime;
      
      const totalOperations = concurrentOps * opsPerBatch;
      const operationsPerSecond = (totalOperations / totalElapsed) * 1000;

      // Log load test results
      await ctx.runMutation(api.metrics.logMigrationActivity, {
        action: "load_test",
        details: `${concurrentOps} concurrent batches, ${opsPerBatch} ops each. Total: ${totalOperations} ops in ${totalElapsed}ms (${operationsPerSecond.toFixed(1)} ops/sec)`,
      });

      return {
        test_type: "LOAD_TEST",
        concurrent_batches: concurrentOps,
        operations_per_batch: opsPerBatch,
        total_operations: totalOperations,
        total_elapsed_ms: totalElapsed,
        operations_per_second: Math.round(operationsPerSecond),
        success: true,
        all_batches_completed: results.length === concurrentOps
      };
    } catch (error) {
      return {
        test_type: "LOAD_TEST",
        concurrent_batches: concurrentOps,
        operations_per_batch: opsPerBatch,
        total_operations: concurrentOps * opsPerBatch,
        total_elapsed_ms: 0,
        operations_per_second: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Day 13-14: Regression testing to ensure no functionality breaks
export const runRegressionTests = action({
  args: {
    test_session_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const testSessionId = args.test_session_id || `regression-test-${Date.now()}`;
    const testHelper = new SkillTestHelper(ctx);
    const results: any[] = [];

    // Test all skill types that existed in previous days
    const regressionTests = [
      // Day 1-2: Educational content
      {
        name: "MCQ_Creation_Regression",
        test: async () => {
          const result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "mcq",
            data: {
              question: "Regression test question",
              options: ["Option A", "Option B", "Option C"],
              correct_index: 1,
              explanation: "Regression test explanation"
            },
            session_id: testSessionId,
          });
          if (!result.payload || !result.actions) {
            throw new Error("MCQ creation regression failure");
          }
          return "MCQ creation regression passed";
        }
      },
      
      // Day 4-5: Whiteboard modifications
      {
        name: "Whiteboard_Modifications_Regression",
        test: async () => {
          const clearResult = await ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
            scope: "all",
            session_id: testSessionId,
          });
          
          const modifyResult = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            updates: [{ object_id: "test-obj", updates: { x: 100, y: 100 } }],
            session_id: testSessionId,
          });
          
          if (!clearResult.payload || !modifyResult.payload) {
            throw new Error("Whiteboard modifications regression failure");
          }
          return "Whiteboard modifications regression passed";
        }
      },
      
      // Day 6-7: Batch operations
      {
        name: "Batch_Operations_Regression",
        test: async () => {
          const operations = [
            { operation_type: "add_text" as const, data: { text: "Regression", x: 50, y: 50 } },
            { operation_type: "add_shape" as const, data: { shape_type: "rectangle", x: 150, y: 50 } }
          ];
          
          const result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            operations,
            session_id: testSessionId,
          });
          
          if (!result.payload || !result.actions) {
            throw new Error("Batch operations regression failure");
          }
          return "Batch operations regression passed";
        }
      },
      
      // Day 8-9: Legacy compatibility
      {
        name: "Legacy_Bridge_Regression",
        test: async () => {
          try {
            const legacyResult = await ctx.runAction(api.legacy.migration_bridge.drawMCQSpecs, {
              question: "Legacy regression test",
              options: ["A", "B"],
              correct_index: 0,
              question_id: "regression-test",
            });
            
            if (!legacyResult || !Array.isArray(legacyResult)) {
              throw new Error("Legacy bridge regression failure");
            }
            return "Legacy bridge regression passed";
          } catch (error) {
            throw new Error(`Legacy bridge regression failure: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      },
    ];

    for (const { name, test } of regressionTests) {
      try {
        const result = await test();
        results.push({ test: name, status: "PASS", message: result });
      } catch (error) {
        results.push({ 
          test: name, 
          status: "FAIL", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    // Log regression test results
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "regression_tests",
      details: `Regression tests completed. Passed: ${results.filter(r => r.status === "PASS").length}/${results.length}`,
    });

    const summary = {
      test_type: "REGRESSION",
      total_tests: results.length,
      passed: results.filter(r => r.status === "PASS").length,
      failed: results.filter(r => r.status === "FAIL").length,
      success_rate: `${((results.filter(r => r.status === "PASS").length / results.length) * 100).toFixed(1)}%`,
      test_session_id: testSessionId,
      results: results
    };

    return summary;
  },
});

// Existing functions preserved
export const runSkillTests = action({
  args: {
    test_session_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const testSessionId = args.test_session_id || `test-${Date.now()}`;
    const testHelper = new SkillTestHelper(ctx);
    const results: any[] = [];

    try {
      // Test 1: MCQ Creation
      const mcqResult = await testHelper.testCreateMCQSmoke();
      results.push({ test: "MCQ_Creation", status: "PASS", message: mcqResult });
    } catch (error) {
      results.push({ test: "MCQ_Creation", status: "FAIL", error: error instanceof Error ? error.message : String(error) });
    }

    try {
      // Test 2: Batch Operations
      const batchResult = await testHelper.testBatchOperationsSmoke();
      results.push({ test: "Batch_Operations", status: "PASS", message: batchResult });
    } catch (error) {
      results.push({ test: "Batch_Operations", status: "FAIL", error: error instanceof Error ? error.message : String(error) });
    }

    try {
      // Test 3: Skill Count Validation
      const skillCountResult = await testHelper.testSkillCountReduction();
      results.push({ test: "Skill_Count", status: "PASS", message: skillCountResult });
    } catch (error) {
      results.push({ test: "Skill_Count", status: "FAIL", error: error instanceof Error ? error.message : String(error) });
    }

    try {
      // Test 4: Whiteboard Modification
      const modifyResult = await testHelper.testWhiteboardModification();
      results.push({ test: "Whiteboard_Modification", status: "PASS", message: modifyResult });
    } catch (error) {
      results.push({ test: "Whiteboard_Modification", status: "FAIL", error: error instanceof Error ? error.message : String(error) });
    }

    try {
      // Test 5: Clear Whiteboard
      const clearResult = await testHelper.testClearWhiteboard();
      results.push({ test: "Clear_Whiteboard", status: "PASS", message: clearResult });
    } catch (error) {
      results.push({ test: "Clear_Whiteboard", status: "FAIL", error: error instanceof Error ? error.message : String(error) });
    }

    // Log test results
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "skill_tests",
      details: `Ran ${results.length} tests. Passed: ${results.filter(r => r.status === "PASS").length}`,
    });

    const summary = {
      total_tests: results.length,
      passed: results.filter(r => r.status === "PASS").length,
      failed: results.filter(r => r.status === "FAIL").length,
      success_rate: `${((results.filter(r => r.status === "PASS").length / results.length) * 100).toFixed(1)}%`,
      results: results
    };

    return summary;
  },
});

// Database schema validation query
export const validateDatabaseSchema = query({
  args: {},
  handler: async (ctx) => {
    try {
      // Test each migration table exists by querying it
      const skillMetrics = await ctx.db.query("skill_metrics").take(1);
      const whiteboardActions = await ctx.db.query("whiteboard_actions").take(1);
      const batchEfficiency = await ctx.db.query("batch_efficiency").take(1);
      const migrationLog = await ctx.db.query("migration_log").take(1);

      return {
        schema_validation: "SUCCESS",
        tables_validated: [
          "skill_metrics",
          "whiteboard_actions", 
          "batch_efficiency",
          "migration_log"
        ],
        message: "All Day 11-12 migration tables are present and accessible"
      };
    } catch (error) {
      return {
        schema_validation: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        message: "Database schema validation failed"
      };
    }
  },
});

// Timeout testing utility
export const testTimeoutHandling = action({
  args: {
    timeout_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeoutMs = args.timeout_ms || 6000; // Test with 6 second timeout
    const startTime = Date.now();

    try {
      // Simulate a long-running operation
      await new Promise(resolve => setTimeout(resolve, timeoutMs));
      
      const elapsed = Date.now() - startTime;
      
      // This should timeout based on Convex's built-in limits
      return {
        test_result: "UNEXPECTED_SUCCESS",
        elapsed_ms: elapsed,
        message: "Operation completed when it should have timed out"
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      await ctx.runMutation(api.metrics.logMigrationActivity, {
        action: "timeout_test",
        details: `Timeout test completed. Elapsed: ${elapsed}ms, Error: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        test_result: "TIMEOUT_HANDLED",
        elapsed_ms: elapsed,
        error: error instanceof Error ? error.message : String(error),
        message: "Timeout was properly handled"
      };
    }
  },
});

// Generate test data for validation
export const generateTestData = action({
  args: {
    skill_count: v.optional(v.number()),
    session_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const skillCount = args.skill_count || 5;
    const sessionId = args.session_id || `test-data-${Date.now()}`;
    const batchId = Math.random().toString(36).substring(2, 10);

    // Generate test skill metrics
    for (let i = 0; i < skillCount; i++) {
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: `test_skill_${i}`,
        elapsed_ms: Math.floor(Math.random() * 1000) + 100,
        batch_id: `${batchId}_${i}`,
        session_id: sessionId,
      });
    }

    // Generate test batch efficiency data
    await ctx.runMutation(api.metrics.logBatchEfficiency, {
      batch_id: batchId,
      operations_count: 10,
      actions_created: 3,
      websocket_reduction: 0.7,
      session_id: sessionId,
    });

    return {
      test_data_generated: true,
      skills_created: skillCount,
      session_id: sessionId,
      batch_id: batchId,
      message: "Test data generated successfully"
    };
  },
}); 