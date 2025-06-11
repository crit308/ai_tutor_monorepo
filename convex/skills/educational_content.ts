import { v } from "convex/values";
import { mutation, action } from "../_generated/server";
import { api } from "../_generated/api";

// Validation schemas using Convex validators
const MCQDataValidator = v.object({
  question: v.string(),
  options: v.array(v.string()),
  correct_index: v.number(),
  explanation: v.optional(v.string()),
});

const TableDataValidator = v.object({
  headers: v.array(v.string()),
  rows: v.array(v.array(v.string())),
  title: v.optional(v.string()),
});

const DiagramDataValidator = v.object({
  diagram_type: v.union(v.literal("flowchart"), v.literal("timeline"), v.literal("coordinate_plane")),
  elements: v.array(v.any()),
  title: v.optional(v.string()),
});

// Main consolidated educational content skill
export const createEducationalContent = action({
  args: {
    content_type: v.union(v.literal("mcq"), v.literal("table"), v.literal("diagram")),
    data: v.any(), // Will be validated internally based on content_type
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
    
    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "create_educational_content",
      content_type: args.content_type,
      batch_id,
      session_id: args.session_id,
    });

    try {
      let result;
      
      if (args.content_type === "mcq") {
        const mcqData = validateMCQData(args.data);
        result = await createMCQContent(ctx, mcqData, batch_id, args.session_id);
      } else if (args.content_type === "table") {
        const tableData = validateTableData(args.data);
        result = await createTableContent(ctx, tableData, batch_id, args.session_id);
      } else if (args.content_type === "diagram") {
        const diagramData = validateDiagramData(args.data);
        result = await createDiagramContent(ctx, diagramData, batch_id, args.session_id);
      } else {
        throw new Error(`Unknown content_type: ${args.content_type}`);
      }

      const elapsed_ms = Date.now() - start_time;
      
      // Log success metrics
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "create_educational_content",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return result;

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      
      // Log error metrics
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "create_educational_content",
        elapsed_ms,
        error: (error as Error).message,
        batch_id,
        session_id: args.session_id,
      });

      // Check if this is a timeout (Convex actions have built-in timeout)
      if (elapsed_ms > 5000) {
        return {
          payload: {
            message_text: "Drawing is taking longer than expected, please try again.",
            message_type: "error"
          },
          actions: []
        };
      }
      
      throw error;
    }
  },
});

async function createMCQContent(ctx: any, data: any, batch_id: string, session_id: string): Promise<{payload: any, actions: any[]}> {
  // Reuse existing MCQ logic from draw_mcq_actions but in Convex
  const specs: any = await ctx.runAction(api.legacy.migration_bridge.drawMCQSpecs, {
    question: data.question,
    options: data.options,
    correct_index: data.correct_index,
    explanation: data.explanation,
    question_id: batch_id,
  });

  const action: any = {
    type: "ADD_OBJECTS",
    objects: specs,
    batch_id,
  };

  const payload = {
    message_text: `Created multiple choice question: ${data.question.slice(0, 50)}...`,
    message_type: "status_update"
  };

  // Store in Convex database for session history
  await ctx.runMutation(api.sessions.addWhiteboardAction, {
    session_id,
    action,
    payload,
    batch_id,
  });

  return { payload, actions: [action] };
}

async function createTableContent(ctx: any, data: any, batch_id: string, session_id: string): Promise<{payload: any, actions: any[]}> {
  const specs: any = await ctx.runAction(api.legacy.migration_bridge.drawTableSpecs, {
    headers: data.headers,
    rows: data.rows,
    title: data.title,
    table_id: batch_id,
  });

  const action: any = {
    type: "ADD_OBJECTS",
    objects: specs,
    batch_id,
  };

  const payload = {
    message_text: `Created table with ${data.headers.length} columns and ${data.rows.length} rows`,
    message_type: "status_update"
  };

  await ctx.runMutation(api.sessions.addWhiteboardAction, {
    session_id,
    action,
    payload,
    batch_id,
  });

  return { payload, actions: [action] };
}

async function createDiagramContent(ctx: any, data: any, batch_id: string, session_id: string): Promise<{payload: any, actions: any[]}> {
  const specs: any = await ctx.runAction(api.legacy.migration_bridge.drawDiagramSpecs, {
    diagram_type: data.diagram_type,
    elements: data.elements,
    title: data.title,
    diagram_id: batch_id,
  });

  const action: any = {
    type: "ADD_OBJECTS",
    objects: specs,
    batch_id,
  };

  const payload = {
    message_text: `Created ${data.diagram_type} diagram: ${data.title || "Untitled"}`,
    message_type: "status_update"
  };

  await ctx.runMutation(api.sessions.addWhiteboardAction, {
    session_id,
    action,
    payload,
    batch_id,
  });

  return { payload, actions: [action] };
}

function validateMCQData(data: any) {
  // Manual validation since we can't use the validator directly on v.any()
  if (!data.question || typeof data.question !== 'string') {
    throw new Error("Invalid MCQ data: question required");
  }
  if (!Array.isArray(data.options) || data.options.length === 0) {
    throw new Error("Invalid MCQ data: options array required");
  }
  if (typeof data.correct_index !== 'number' || data.correct_index < 0 || data.correct_index >= data.options.length) {
    throw new Error("Invalid MCQ data: valid correct_index required");
  }
  return data;
}

function validateTableData(data: any) {
  if (!Array.isArray(data.headers) || data.headers.length === 0) {
    throw new Error("Invalid table data: headers array required");
  }
  if (!Array.isArray(data.rows)) {
    throw new Error("Invalid table data: rows array required");
  }
  // Validate that each row has the same number of columns as headers or fewer
  for (let i = 0; i < data.rows.length; i++) {
    if (!Array.isArray(data.rows[i])) {
      throw new Error(`Invalid table data: row ${i} must be an array`);
    }
  }
  return data;
}

function validateDiagramData(data: any) {
  // Provide a sensible default if diagram_type omitted
  if (!data.diagram_type) {
    data.diagram_type = "flowchart";
  }
  if (!["flowchart", "timeline", "coordinate_plane"].includes(data.diagram_type)) {
    throw new Error("Invalid diagram data: diagram_type must be 'flowchart', 'timeline', or 'coordinate_plane'");
  }
  if (!Array.isArray(data.elements)) {
    // If elements not provided, initialize to an empty array so downstream code can still run
    data.elements = [];
  }
  return data;
}

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
} 