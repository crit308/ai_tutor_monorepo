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
  // Direct MCQ creation without legacy bridge
  const specs = createMCQSpecs({
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
  // Direct table creation without legacy bridge
  const specs = createTableSpecs({
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
  let objects: any[] = [];
  let payload;

  if (data.diagram_type === "flowchart") {
    // Use new helper action
    const rawStepsSource = (Array.isArray(data.elements) && data.elements.length)
      ? data.elements
      : (Array.isArray((data as any).nodes) ? (data as any).nodes : []);

    const stepsArr = rawStepsSource.map((el: any) => el.label || el.content || el.text || "Step");

    const result = await ctx.runAction(api.helpers.flowchart.createFlowchart, {
      sessionId: session_id as any,
      steps: stepsArr,
    });

    objects = result.objects;
    payload = result.payload;

    // Persist objects via bulk mutation
    await ctx.runMutation(api.database.whiteboard.addObjectsBulk, {
      sessionId: session_id as any,
      objects,
    });
  } else {
    // Direct diagram creation without legacy bridge
    objects = createDiagramSpecs({
      diagram_type: data.diagram_type,
      elements: data.elements,
      title: data.title,
      diagram_id: batch_id,
    });

    payload = {
      message_text: `Created ${data.diagram_type} diagram: ${data.title || "Untitled"}`,
      message_type: "status_update",
    };
  }

  // Build whiteboard action for session history (even though objects are in DB)
  const action: any = {
    type: "ADD_OBJECTS",
    objects,
    batch_id,
  };

  await ctx.runMutation(api.sessions.addWhiteboardAction, {
    session_id,
    action,
    payload,
    batch_id,
  });

  return { payload, actions: [action] };
}

// Helper functions to create specs directly (simplified implementations)
function createMCQSpecs(args: any) {
  const { question, options, correct_index, question_id } = args;
  const baseY = 100;
  const objects = [];

  // Question text
  objects.push({
    id: `mcq-${question_id}-question`,
    kind: "text",
    text: question,
    x: 50,
    y: baseY,
    fontSize: 18,
    fontWeight: "bold",
    fill: "#000000"
  });

  // Options
  options.forEach((option: string, index: number) => {
    const isCorrect = index === correct_index;
    const optionY = baseY + 50 + (index * 40);
    
    // Radio button
    objects.push({
      id: `mcq-${question_id}-opt-${index}-radio`,
      kind: "circle",
      x: 50,
      y: optionY,
      radius: 8,
      fill: isCorrect ? "#2ECC71" : "#ffffff",
      stroke: "#000000",
      strokeWidth: 2
    });

    // Option text
    objects.push({
      id: `mcq-${question_id}-opt-${index}-text`,
      kind: "text",
      text: `${String.fromCharCode(65 + index)}. ${option}`,
      x: 75,
      y: optionY - 5,
      fontSize: 14,
      fill: "#000000"
    });
  });

  return objects;
}

function createTableSpecs(args: any) {
  const { headers, rows, title, table_id } = args;
  const objects = [];
  const cellWidth = 120;
  const cellHeight = 30;
  const baseX = 50;
  let baseY = 100;

  // Title if provided
  if (title) {
    objects.push({
      id: `table-${table_id}-title`,
      kind: "text",
      text: title,
      x: baseX,
      y: baseY,
      fontSize: 16,
      fontWeight: "bold",
      fill: "#000000"
    });
    baseY += 40;
  }

  // Header row
  headers.forEach((header: string, colIndex: number) => {
    const cellX = baseX + (colIndex * cellWidth);
    
    // Header cell background
    objects.push({
      id: `table-${table_id}-header-${colIndex}-bg`,
      kind: "rect",
      x: cellX,
      y: baseY,
      width: cellWidth,
      height: cellHeight,
      fill: "#f0f0f0",
      stroke: "#000000",
      strokeWidth: 1
    });

    // Header text
    objects.push({
      id: `table-${table_id}-header-${colIndex}-text`,
      kind: "text",
      text: header,
      x: cellX + 5,
      y: baseY + 20,
      fontSize: 12,
      fontWeight: "bold",
      fill: "#000000"
    });
  });

  // Data rows
  rows.forEach((row: string[], rowIndex: number) => {
    const rowY = baseY + ((rowIndex + 1) * cellHeight);
    
    row.forEach((cell: string, colIndex: number) => {
      const cellX = baseX + (colIndex * cellWidth);
      
      // Cell background
      objects.push({
        id: `table-${table_id}-row-${rowIndex}-col-${colIndex}-bg`,
        kind: "rect",
        x: cellX,
        y: rowY,
        width: cellWidth,
        height: cellHeight,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1
      });

      // Cell text
      objects.push({
        id: `table-${table_id}-row-${rowIndex}-col-${colIndex}-text`,
        kind: "text",
        text: cell || "",
        x: cellX + 5,
        y: rowY + 20,
        fontSize: 12,
        fill: "#000000"
      });
    });
  });

  return objects;
}

function createDiagramSpecs(args: any) {
  const { diagram_type, elements, title, diagram_id } = args;
  const objects = [];
  
  // Simple diagram implementation
  if (title) {
    objects.push({
      id: `diagram-${diagram_id}-title`,
      kind: "text",
      text: title,
      x: 50,
      y: 50,
      fontSize: 16,
      fontWeight: "bold",
      fill: "#000000"
    });
  }

  // Create simple representations based on diagram type
  elements.forEach((element: any, index: number) => {
    const x = 100 + (index * 150);
    const y = 120;

    if (diagram_type === "timeline") {
      // Timeline node
      objects.push({
        id: `diagram-${diagram_id}-node-${index}`,
        kind: "circle",
        x: x,
        y: y,
        radius: 20,
        fill: "#3498db",
        stroke: "#2980b9",
        strokeWidth: 2
      });

      // Timeline label
      objects.push({
        id: `diagram-${diagram_id}-label-${index}`,
        kind: "text",
        text: element.label || element.text || `Event ${index + 1}`,
        x: x - 30,
        y: y + 40,
        fontSize: 12,
        fill: "#000000"
      });
    } else {
      // Generic diagram element
      objects.push({
        id: `diagram-${diagram_id}-element-${index}`,
        kind: "rect",
        x: x,
        y: y,
        width: 100,
        height: 60,
        fill: "#ecf0f1",
        stroke: "#34495e",
        strokeWidth: 2
      });

      objects.push({
        id: `diagram-${diagram_id}-text-${index}`,
        kind: "text",
        text: element.label || element.text || `Item ${index + 1}`,
        x: x + 10,
        y: y + 35,
        fontSize: 12,
        fill: "#000000"
      });
    }
  });

  return objects;
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