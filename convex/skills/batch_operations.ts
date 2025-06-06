import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";

const SimpleOperationValidator = v.object({
  operation_type: v.union(
    v.literal("add_text"), 
    v.literal("add_shape"), 
    v.literal("update_object"), 
    v.literal("clear")
  ),
  data: v.any(),
  id: v.optional(v.string()),
});

export const batchWhiteboardOperations = action({
  args: {
    operations: v.array(SimpleOperationValidator),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "batch_whiteboard_operations",
      batch_id,
      session_id: args.session_id,
    });

    try {
      // Group operations by type for efficient batching
      const add_objects: any[] = [];
      const update_objects: any[] = [];
      const clear_actions: any[] = [];

      for (const op of args.operations) {
        try {
          if (op.operation_type === "add_text") {
            const obj_spec = createTextSpec(op.data);
            add_objects.push(obj_spec);
          } else if (op.operation_type === "add_shape") {
            const obj_spec = createShapeSpec(op.data);
            add_objects.push(obj_spec);
          } else if (op.operation_type === "update_object") {
            update_objects.push({
              objectId: op.data.object_id,
              updates: op.data.updates,
            });
          } else if (op.operation_type === "clear") {
            clear_actions.push({
              type: "CLEAR_CANVAS",
              scope: op.data.scope || "all",
            });
          }
        } catch (error) {
          console.error(`Failed to process operation ${op.id}:`, error);
          // Continue with other operations
        }
      }

      // Build consolidated actions
      const actions: any[] = [];

      if (add_objects.length > 0) {
        actions.push({
          type: "ADD_OBJECTS",
          objects: add_objects,
          batch_id,
        });
      }

      if (update_objects.length > 0) {
        actions.push({
          type: "UPDATE_OBJECTS",
          objects: update_objects,
          batch_id,
        });
      }

      actions.push(...clear_actions);

      const payload = {
        message_text: `Executed ${args.operations.length} whiteboard operations.`,
        message_type: "status_update"
      };

      // Store all actions in database
      for (const action of actions) {
        await ctx.runMutation(api.sessions.addWhiteboardAction, {
          session_id: args.session_id,
          action,
          payload,
          batch_id,
        });
      }

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "batch_whiteboard_operations",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      // Log efficiency metrics
      await ctx.runMutation(api.metrics.logBatchEfficiency, {
        batch_id,
        operations_count: args.operations.length,
        actions_created: actions.length,
        websocket_reduction: (args.operations.length - actions.length) / args.operations.length,
        session_id: args.session_id,
      });

      return { payload, actions };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "batch_whiteboard_operations",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });
      throw error;
    }
  },
});

function createTextSpec(data: any) {
  return {
    id: data.id || generateBatchId(),
    kind: "text",
    text: data.text,
    x: data.x || 100,
    y: data.y || 100,
    fontSize: data.fontSize || 16,
    fill: data.color || "#000000",
    metadata: { source: "assistant" }
  };
}

function createShapeSpec(data: any) {
  return {
    id: data.id || generateBatchId(),
    kind: data.shape_type,
    x: data.x || 100,
    y: data.y || 100,
    width: data.width || 50,
    height: data.height || 50,
    fill: data.fill || "#ffffff",
    stroke: data.stroke || "#000000",
    metadata: { source: "assistant" }
  };
}

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
} 