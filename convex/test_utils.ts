// convex/test_utils.ts - Testing utilities for Convex
import { api } from "./_generated/api";
import { query, action } from "./_generated/server";
import { v } from "convex/values";

// Test helper class for skill validation
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
}

// Performance testing action
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

// Comprehensive skill testing action
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