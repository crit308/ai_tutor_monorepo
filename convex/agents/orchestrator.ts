"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { TeacherAgent, createTeacherAgent } from "./teacherAgent";
import { AgentContext, FocusObjective } from "./types";
import { AgentFactory, AGENT_NAMES } from "./registry";

/**
 * Decide the next pedagogical action based on session context
 */
function chooseNextAction(ctxData: any): "explain" | "ask_mcq" | "evaluate" {
  // Very simplified heuristic for first implementation
  if (ctxData.pending_interaction_type === "awaiting_answer") {
    return "evaluate";
  }
  if (ctxData.last_pedagogical_action === "explained") {
    return "ask_mcq";
  }
  return "explain";
}

export const runTutorTurn = internalAction({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.object({
    success: v.boolean(),
    messageText: v.optional(v.string()),
    whiteboardSkill: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    // 1. Load session
    const session = await ctx.runQuery(internal.functions.getSessionInternal, {
      sessionId: args.sessionId,
    });
    if (!session) {
      return { success: false } as any;
    }

    const ctxData = session.context_data || {};

    // 2. Build AgentContext for TeacherAgent
    const agentContext: AgentContext = {
      session_id: args.sessionId,
      user_id: session.user_id,
      folder_id: session.folder_id,
      vector_store_id: ctxData.vector_store_id,
      analysis_result: ctxData.analysis_result,
      focus_objective: ctxData.focus_objective as FocusObjective | undefined,
      user_model_state: ctxData.user_model_state,
    } as any;

    // 3. Decide action
    const nextAction = chooseNextAction(ctxData);

    // 4. Create TeacherAgent
    const teacher = AgentFactory.createTeacher();

    // 5. Execute action
    const result = await teacher.execute(agentContext, {
      action: nextAction,
      focus_objective: agentContext.focus_objective,
    });

    if (!result.success) {
      console.error("TeacherAgent error", result.error);
      return { success: false } as any;
    }

    // 6. Persist context updates
    const patch: any = {
      last_pedagogical_action: nextAction === "evaluate" ? "evaluated" : nextAction === "ask_mcq" ? "asked" : "explained",
    };
    if (nextAction === "ask_mcq") {
      patch.pending_interaction_type = "awaiting_answer";
      patch.current_quiz_question = result.data.quiz_question;
    } else if (nextAction === "evaluate") {
      patch.pending_interaction_type = null;
      patch.last_evaluation = result.data;
    }

    // Update context in DB
    await ctx.runMutation(internal.functions.updateSessionContextInternal, {
      sessionId: args.sessionId,
      context: {
        ...ctxData,
        ...patch,
      },
    });

    // 7. Log interaction (simplified)
    await ctx.runMutation(internal.functions.logInteractionInternal, {
      sessionId: args.sessionId,
      userId: session.user_id,
      role: "assistant",
      content: JSON.stringify(result.data).slice(0, 400),
      contentType: nextAction,
    });

    return {
      success: true,
      messageText: JSON.stringify(result.data),
    } as any;
  },
}); 