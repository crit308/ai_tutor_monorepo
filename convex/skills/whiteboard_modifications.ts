import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";

// Validation schemas using Convex validators
const ObjectUpdateValidator = v.object({
  object_id: v.string(),
  updates: v.any(), // Generic updates object - can contain position, style, dimension changes
});

const ClearScopeValidator = v.union(
  v.literal("all"), 
  v.literal("selection"), 
  v.literal("mcq"), 
  v.literal("diagrams"),
  v.literal("tables"),
  v.literal("assistant_content")
);

// Main consolidated whiteboard modification skill
export const modifyWhiteboardObjects = action({
  args: {
    updates: v.array(ObjectUpdateValidator),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "modify_whiteboard_objects",
      batch_id,
      session_id: args.session_id,
    });

    try {
      // Process updates to handle coordinate and dimension normalization
      // This replicates the Python backend logic from update_object_on_board
      const processed_updates = args.updates.map(update => {
        const processed_update_data = processObjectUpdates(update.updates);
        return {
          objectId: update.object_id,
          updates: processed_update_data,
        };
      });

      const action = {
        type: "UPDATE_OBJECTS",
        objects: processed_updates,
        batch_id,
      };

      const payload = {
        message_text: `Updated ${args.updates.length} object(s) on the whiteboard.`,
        message_type: "status_update"
      };

      // Store in Convex database for session history
      await ctx.runMutation(api.sessions.addWhiteboardAction, {
        session_id: args.session_id,
        action,
        payload,
        batch_id,
      });

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "modify_whiteboard_objects",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return { payload, actions: [action] };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "modify_whiteboard_objects",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });

      // Check if this is a timeout (Convex actions have built-in timeout)
      if (elapsed_ms > 5000) {
        return {
          payload: {
            message_text: "Object update is taking longer than expected, please try again.",
            message_type: "error"
          },
          actions: []
        };
      }
      
      throw error;
    }
  },
});

export const clearWhiteboard = action({
  args: {
    scope: ClearScopeValidator,
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "clear_whiteboard", 
      batch_id,
      session_id: args.session_id,
    });

    try {
      const action = {
        type: "CLEAR_CANVAS",
        scope: args.scope,
        batch_id,
        metadata: { 
          source: "assistant", 
          reason: "clear_request" 
        }
      };

      const payload = {
        message_text: getScopeMessage(args.scope),
        message_type: "status_update"
      };

      // Store in Convex database for session history
      await ctx.runMutation(api.sessions.addWhiteboardAction, {
        session_id: args.session_id,
        action,
        payload,
        batch_id,
      });

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "clear_whiteboard",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return { payload, actions: [action] };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "clear_whiteboard",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });

      throw error;
    }
  },
});

// Additional skill for highlighting objects (from Python advanced_whiteboard.py)
export const highlightObject = action({
  args: {
    object_id: v.string(),
    color: v.optional(v.string()),
    pulse: v.optional(v.boolean()),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "highlight_object",
      batch_id,
      session_id: args.session_id,
    });

    try {
      const action = {
        type: "HIGHLIGHT_OBJECT",
        targetObjectId: args.object_id,
        color: args.color || "#FF5722", // Default highlight color
        pulse: args.pulse !== undefined ? args.pulse : true,
        batch_id,
      };

      const payload = {
        message_text: `Highlighted object on the whiteboard.`,
        message_type: "status_update"
      };

      // Store in Convex database for session history
      await ctx.runMutation(api.sessions.addWhiteboardAction, {
        session_id: args.session_id,
        action,
        payload,
        batch_id,
      });

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "highlight_object",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return { payload, actions: [action] };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "highlight_object",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });

      throw error;
    }
  },
});

// Delete objects skill (from Python layout_board_ops.py)
export const deleteWhiteboardObjects = action({
  args: {
    object_ids: v.array(v.string()),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "delete_whiteboard_objects",
      batch_id,
      session_id: args.session_id,
    });

    try {
      const action = {
        type: "DELETE_OBJECTS",
        objectIds: args.object_ids,
        batch_id,
      };

      const payload = {
        message_text: `Removed ${args.object_ids.length} object(s) from the whiteboard.`,
        message_type: "status_update"
      };

      // Store in Convex database for session history
      await ctx.runMutation(api.sessions.addWhiteboardAction, {
        session_id: args.session_id,
        action,
        payload,
        batch_id,
      });

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "delete_whiteboard_objects",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return { payload, actions: [action] };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "delete_whiteboard_objects",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });

      throw error;
    }
  },
});

// Helper function to process object updates (replicates Python backend logic)
function processObjectUpdates(raw_updates: any): any {
  const final_updates_for_action: any = {};

  // Handle coordinates with percentage fallback (from Python update_object_on_board)
  if ("xPct" in raw_updates && raw_updates["xPct"] !== null) {
    final_updates_for_action["xPct"] = raw_updates["xPct"];
    final_updates_for_action["x"] = null;
  } else if ("x" in raw_updates && raw_updates["x"] !== null) {
    final_updates_for_action["x"] = raw_updates["x"];
    final_updates_for_action["xPct"] = null;
  } else if ("x" in raw_updates && raw_updates["x"] === null) {
    final_updates_for_action["x"] = null;
  }

  if ("yPct" in raw_updates && raw_updates["yPct"] !== null) {
    final_updates_for_action["yPct"] = raw_updates["yPct"];
    final_updates_for_action["y"] = null;
  } else if ("y" in raw_updates && raw_updates["y"] !== null) {
    final_updates_for_action["y"] = raw_updates["y"];
    final_updates_for_action["yPct"] = null;
  } else if ("y" in raw_updates && raw_updates["y"] === null) {
    final_updates_for_action["y"] = null;
  }

  // Handle dimensions
  if ("widthPct" in raw_updates && raw_updates["widthPct"] !== null) {
    final_updates_for_action["widthPct"] = raw_updates["widthPct"];
    final_updates_for_action["width"] = null;
  } else if ("width" in raw_updates && raw_updates["width"] !== null) {
    final_updates_for_action["width"] = raw_updates["width"];
    final_updates_for_action["widthPct"] = null;
  } else if ("width" in raw_updates && raw_updates["width"] === null) {
    final_updates_for_action["width"] = null;
  }

  if ("heightPct" in raw_updates && raw_updates["heightPct"] !== null) {
    final_updates_for_action["heightPct"] = raw_updates["heightPct"];
    final_updates_for_action["height"] = null;
  } else if ("height" in raw_updates && raw_updates["height"] !== null) {
    final_updates_for_action["height"] = raw_updates["height"];
    final_updates_for_action["heightPct"] = null;
  } else if ("height" in raw_updates && raw_updates["height"] === null) {
    final_updates_for_action["height"] = null;
  }

  // Copy other updates that are not coordinate/dimension related
  for (const [key, value] of Object.entries(raw_updates)) {
    if (!["x", "y", "xPct", "yPct", "width", "height", "widthPct", "heightPct"].includes(key)) {
      final_updates_for_action[key] = value;
    }
  }

  return final_updates_for_action;
}

function getScopeMessage(scope: string): string {
  switch (scope) {
    case "all":
      return "Cleared the entire whiteboard.";
    case "selection":
      return "Cleared selected objects from the whiteboard.";
    case "mcq":
      return "Cleared all multiple choice questions from the whiteboard.";
    case "diagrams":
      return "Cleared all diagrams from the whiteboard.";
    case "tables":
      return "Cleared all tables from the whiteboard.";
    case "assistant_content":
      return "Cleared all assistant-generated content from the whiteboard.";
    default:
      return `Cleared whiteboard content (${scope}).`;
  }
}

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
} 