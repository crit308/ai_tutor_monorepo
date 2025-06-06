import { action, mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

/**
 * Enhanced Agent Integration for Day 10
 * 
 * Provides unified agent operations with:
 * - WebSocket integration
 * - Comprehensive error handling
 * - Performance monitoring
 * - Session management
 */

// Main agent execution endpoint with enhanced features
export const executeAgentSkill = action({
  args: {
    skill_name: v.string(),
    skill_args: v.any(),
    session_id: v.string(),
    user_id: v.string(),
    agent_version: v.optional(v.string()),
    trace_id: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
    execution_time_ms: v.number(),
    websocket_delivered: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const start_time = Date.now();
    
    try {
      // Register session if not already active
      await ctx.runMutation(api.websockets.registerSession, {
        session_id: args.session_id,
        user_id: args.user_id,
        connection_id: `agent-${Date.now()}`,
      });

      // Execute the whiteboard skill
      const result: {payload: {message_text: string, message_type: string}, actions: any[]} = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
        skill_name: args.skill_name,
        skill_args: args.skill_args,
        session_id: args.session_id,
        user_id: args.user_id,
      });

      const execution_time_ms = Date.now() - start_time;

      // Log execution metrics
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: `enhanced_${args.skill_name}`,
        elapsed_ms: execution_time_ms,
        batch_id: "enhanced-agent",
        session_id: args.session_id,
      });

      return {
        success: true,
        payload: result.payload,
        actions: result.actions,
        execution_time_ms,
        websocket_delivered: true,
      };

    } catch (error) {
      const execution_time_ms = Date.now() - start_time;
      const errorMessage = (error as Error).message;

      // Log error metrics
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: `enhanced_${args.skill_name}`,
        elapsed_ms: execution_time_ms,
        error: errorMessage,
        batch_id: "enhanced-agent-error",
        session_id: args.session_id,
      });

      // Send error via WebSocket
      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: {
          payload: {
            message_text: "Agent skill execution failed. Please try again.",
            message_type: "error",
            error_code: "AGENT_EXECUTION_ERROR",
            details: { skill_name: args.skill_name, error: errorMessage },
          },
          actions: []
        },
      });

      // Also log via the error helper for consistency
      await ctx.runMutation(api.websockets.sendErrorToSession, {
        session_id: args.session_id,
        error_message: "Agent skill execution failed. Please try again.",
        error_code: "AGENT_EXECUTION_ERROR",
        details: { skill_name: args.skill_name, error: errorMessage },
      });

      return {
        success: false,
        payload: {
          message_text: "Agent skill execution failed. Please try again.",
          message_type: "error",
        },
        actions: [],
        execution_time_ms,
        websocket_delivered: true,
      };
    }
  },
});

// Batch skill execution for multiple operations
export const executeBatchAgentSkills = action({
  args: {
    skills: v.array(v.object({
      skill_name: v.string(),
      skill_args: v.any(),
    })),
    session_id: v.string(),
    user_id: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    results: v.array(v.any()),
    total_execution_time_ms: v.number(),
    successful_skills: v.number(),
    failed_skills: v.number(),
  }),
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const results = [];
    let successful_skills = 0;
    let failed_skills = 0;

    for (const skill of args.skills) {
      try {
        const result: any = await ctx.runAction(api.agents.enhanced_integration.executeAgentSkill, {
          skill_name: skill.skill_name,
          skill_args: skill.skill_args,
          session_id: args.session_id,
          user_id: args.user_id,
        });

        results.push(result);
        if (result.success) {
          successful_skills++;
        } else {
          failed_skills++;
        }
      } catch (error) {
        results.push({
          success: false,
          error: (error as Error).message,
          skill_name: skill.skill_name,
        });
        failed_skills++;
      }
    }

    const total_execution_time_ms = Date.now() - start_time;

    // Log batch execution metrics
    await ctx.runMutation(api.metrics.logBatchEfficiency, {
      batch_id: `batch-agent-${Date.now()}`,
      operations_count: args.skills.length,
      actions_created: successful_skills,
      websocket_reduction: 0, // All delivered via WebSocket
      session_id: args.session_id,
    });

    return {
      success: failed_skills === 0,
      results,
      total_execution_time_ms,
      successful_skills,
      failed_skills,
    };
  },
});

// Get agent session status and metrics - using a query instead of action
export const getAgentSessionStatus = query({
  args: {
    session_id: v.string(),
  },
  returns: v.object({
    session_active: v.boolean(),
    recent_skills: v.array(v.string()),
    total_executions: v.number(),
    success_rate: v.number(),
    average_execution_time: v.number(),
    websocket_status: v.string(),
  }),
  handler: async (ctx, args) => {
    // Get recent session activity
    const recentActivity = await ctx.db
      .query("realtime_events")
      .filter(q => q.eq(q.field("session_id"), args.session_id))
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 300000)) // Last 5 minutes
      .order("desc")
      .take(10);

    const isActive = recentActivity.some(event => 
      event.event_type === "session_connected" || 
      event.event_type === "agent_message"
    );

    // Get recent skill metrics from the database
    const cutoffTime = Date.now() - (60 * 60 * 1000); // Last hour
    const recentMetrics = await ctx.db
      .query("skill_metrics")
      .filter(q => q.eq(q.field("session_id"), args.session_id))
      .filter(q => q.gte(q.field("timestamp"), cutoffTime))
      .collect();

    const skillExecutions = recentMetrics.filter(m => m.skill.startsWith('enhanced_'));
    const successfulExecutions = skillExecutions.filter(m => m.status === 'success');
    
    const recentSkills = [...new Set(skillExecutions.map(m => 
      m.skill.replace('enhanced_', '')
    ))];

    const totalExecutions = skillExecutions.length;
    const successRate = totalExecutions > 0 ? successfulExecutions.length / totalExecutions : 0;
    const averageExecutionTime = totalExecutions > 0 
      ? skillExecutions.reduce((sum, m) => sum + (m.elapsed_ms || 0), 0) / totalExecutions 
      : 0;

    return {
      session_active: isActive,
      recent_skills: recentSkills,
      total_executions: totalExecutions,
      success_rate: Math.round(successRate * 100) / 100,
      average_execution_time: Math.round(averageExecutionTime),
      websocket_status: isActive ? "CONNECTED" : "DISCONNECTED",
    };
  },
});

// Clean up agent session data
export const cleanupAgentSession = mutation({
  args: {
    session_id: v.string(),
    cleanup_hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursAgo = args.cleanup_hours || 24;
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);

    // Clean up old WebSocket events
    await ctx.runMutation(api.websockets.cleanupOldEvents, {
      older_than_hours: hoursAgo,
    });

    // Log cleanup activity
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "agent_session_cleanup",
      details: `Cleaned up session ${args.session_id} data older than ${hoursAgo} hours`,
    });

    return { success: true, cutoff_time: cutoffTime };
  },
});

// Health check for agent integration system
export const healthCheck = action({
  args: {},
  returns: v.object({
    status: v.string(),
    websocket_system: v.string(),
    agent_routing: v.string(),
    database_connectivity: v.string(),
    metrics_system: v.string(),
    timestamp: v.number(),
  }),
  handler: async (ctx) => {
    try {
      // Test WebSocket system
      const testSessionId = `health-check-${Date.now()}`;
      await ctx.runMutation(api.websockets.registerSession, {
        session_id: testSessionId,
        user_id: "health-check",
        connection_id: "health-check-conn",
      });

      // Test agent routing
      const testResult = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
        skill_name: "clear_whiteboard",
        skill_args: { scope: "all" },
        session_id: testSessionId,
        user_id: "health-check",
      });

      // Test metrics system
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "health_check",
        elapsed_ms: 100,
        batch_id: "health-check",
        session_id: testSessionId,
      });

      return {
        status: "HEALTHY",
        websocket_system: "OPERATIONAL",
        agent_routing: "OPERATIONAL",
        database_connectivity: "OPERATIONAL",
        metrics_system: "OPERATIONAL",
        timestamp: Date.now(),
      };

    } catch (error) {
      return {
        status: "UNHEALTHY",
        websocket_system: "ERROR",
        agent_routing: "ERROR", 
        database_connectivity: "ERROR",
        metrics_system: "ERROR",
        timestamp: Date.now(),
      };
    }
  },
}); 