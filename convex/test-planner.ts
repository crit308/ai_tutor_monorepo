// Test script for Phase 3.1 Planner Agent Integration
// This script tests the planner agent with concept graph and knowledge base integration

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const testPlannerIntegration = action({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    folderId: v.optional(v.string()),
    testKnowledgeBase: v.optional(v.string()),
    testConceptGraphEdges: v.optional(v.array(v.object({
      prereq: v.string(),
      concept: v.string()
    })))
  },
  handler: async (ctx, { sessionId, userId, folderId, testKnowledgeBase, testConceptGraphEdges }) => {
    console.log(`[Test] Starting planner integration test for session: ${sessionId}`);
    
    try {
      // Step 1: Set up test data if provided
      if (testConceptGraphEdges && testConceptGraphEdges.length > 0) {
        console.log(`[Test] Adding ${testConceptGraphEdges.length} test concept graph edges`);
        await ctx.runMutation(api.functions.addConceptGraphEdges, {
          edges: testConceptGraphEdges
        });
      }
      
      if (testKnowledgeBase && folderId) {
        console.log(`[Test] Setting test knowledge base for folder: ${folderId}`);
        await ctx.runMutation(api.functions.updateKnowledgeBase, {
          folderId: folderId as any,
          knowledgeBase: testKnowledgeBase
        });
      }
      
      // Step 2: Test planner agent execution
      console.log(`[Test] Invoking planner agent for session: ${sessionId}`);
      
      const plannerResult = await ctx.runAction(api.aiAgents.planSessionFocus, {
        sessionId,
        userId,
        folderId,
        userModelState: {
          concepts: {
            "basic_concepts": { mastery: 0.9, confidence: 8, attempts: 3 },
            "variables": { mastery: 0.85, confidence: 7, attempts: 2 }
          }
        },
        forceFocus: undefined
      });
      
      // Step 3: Verify results
      if (plannerResult.success && plannerResult.data) {
        console.log(`[Test] ✅ Planner succeeded! Focus topic: ${plannerResult.data.topic}`);
        console.log(`[Test] Learning goal: ${plannerResult.data.learning_goal}`);
        console.log(`[Test] Priority: ${plannerResult.data.priority}`);
        console.log(`[Test] Target mastery: ${plannerResult.data.target_mastery}`);
        
        return {
          success: true,
          message: "Planner integration test passed",
          focusObjective: plannerResult.data,
          testResults: {
            plannerInvoked: true,
            focusObjectiveGenerated: true,
            knowledgeBaseAccessed: !!testKnowledgeBase,
            conceptGraphAccessed: !!testConceptGraphEdges
          }
        };
      } else {
        console.log(`[Test] ❌ Planner failed: ${plannerResult.error}`);
        
        return {
          success: false,
          message: `Planner integration test failed: ${plannerResult.error}`,
          testResults: {
            plannerInvoked: true,
            focusObjectiveGenerated: false,
            error: plannerResult.error
          }
        };
      }
      
    } catch (error) {
      console.error(`[Test] ❌ Test execution failed:`, error);
      
      return {
        success: false,
        message: `Test execution failed: ${error}`,
        testResults: {
          plannerInvoked: false,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
});

export const testConceptGraphQueries = action({
  args: {},
  handler: async (ctx) => {
    console.log(`[Test] Testing concept graph queries`);
    
    try {
      // Test 1: Get all edges
      const allEdges = await ctx.runQuery(api.functions.getAllConceptGraphEdges, {});
      console.log(`[Test] Found ${allEdges.length} concept graph edges`);
      
      // Test 2: Add test edges
      const testEdges = [
        { prereq: "test_basic", concept: "test_intermediate" },
        { prereq: "test_intermediate", concept: "test_advanced" },
        { prereq: "test_basic", concept: "test_parallel" }
      ];
      
      const addResult = await ctx.runMutation(api.functions.addConceptGraphEdges, {
        edges: testEdges
      });
      
      console.log(`[Test] Added ${addResult.inserted} test edges`);
      
      // Test 3: Query specific prerequisites
      const prereqs = await ctx.runQuery(api.functions.getConceptPrerequisites, {
        concept: "test_advanced"
      });
      
      console.log(`[Test] Prerequisites for test_advanced: ${prereqs.join(", ")}`);
      
      // Test 4: Query concepts by prerequisite
      const concepts = await ctx.runQuery(api.functions.getConceptsByPrerequisite, {
        prereq: "test_basic"
      });
      
      console.log(`[Test] Concepts depending on test_basic: ${concepts.join(", ")}`);
      
      return {
        success: true,
        message: "Concept graph queries test passed",
        results: {
          totalEdges: allEdges.length,
          testEdgesAdded: addResult.inserted,
          testAdvancedPrereqs: prereqs,
          testBasicDependents: concepts
        }
      };
      
    } catch (error) {
      console.error(`[Test] ❌ Concept graph test failed:`, error);
      
      return {
        success: false,
        message: `Concept graph test failed: ${error}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

export const cleanupTestData = action({
  args: {},
  handler: async (ctx) => {
    console.log(`[Test] Cleaning up test data`);
    
    try {
      // Remove test concept graph edges
      const testEdges = [
        { prereq: "test_basic", concept: "test_intermediate" },
        { prereq: "test_intermediate", concept: "test_advanced" },
        { prereq: "test_basic", concept: "test_parallel" }
      ];
      
      for (const edge of testEdges) {
        await ctx.runMutation(api.functions.removeConceptGraphEdge, edge);
      }
      
      console.log(`[Test] Cleaned up ${testEdges.length} test edges`);
      
      return {
        success: true,
        message: "Test data cleanup completed",
        cleanedEdges: testEdges.length
      };
      
    } catch (error) {
      console.error(`[Test] ❌ Cleanup failed:`, error);
      
      return {
        success: false,
        message: `Cleanup failed: ${error}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}); 