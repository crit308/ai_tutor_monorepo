import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

// Bridge actions to maintain compatibility during migration
export const drawMCQSpecs = action({
  args: {
    question: v.string(),
    options: v.array(v.string()),
    correct_index: v.number(),
    explanation: v.optional(v.string()),
    question_id: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    // This recreates the Python draw_mcq_actions logic in TypeScript
    const specs = [];
    
    // Constants matching Python backend
    const QUESTION_X = 50;
    const QUESTION_Y = 50;
    const QUESTION_WIDTH = 700;
    const OPTION_START_Y = 100;
    const OPTION_SPACING = 40;
    const OPTION_X_OFFSET = 20;
    const OPTION_RADIO_RADIUS = 8;
    const OPTION_TEXT_X_OFFSET = 25;
    
    // Question text object
    specs.push({
      id: `mcq-${args.question_id}-text`,
      kind: "text",
      text: args.question,
      x: QUESTION_X,
      y: QUESTION_Y,
      width: QUESTION_WIDTH,
      fontSize: 18,
      fill: "#000000",
      metadata: { 
        source: "assistant",
        role: "question",
        question_id: args.question_id,
        groupId: args.question_id
      }
    });

    // Option objects
    let current_y = OPTION_START_Y;
    args.options.forEach((option: string, index: number) => {
      // Option selector circle (radio button)
      specs.push({
        id: `mcq-${args.question_id}-opt-${index}-radio`,
        kind: "circle",
        x: QUESTION_X + OPTION_X_OFFSET,
        y: current_y + OPTION_RADIO_RADIUS,
        radius: OPTION_RADIO_RADIUS,
        fill: "#FFFFFF",
        stroke: "#555555",
        strokeWidth: 1,
        metadata: {
          source: "assistant",
          role: "option_selector",
          option_id: index,
          question_id: args.question_id,
          groupId: args.question_id
        }
      });

      // Option text
      specs.push({
        id: `mcq-${args.question_id}-opt-${index}-text`,
        kind: "text", 
        text: `${String.fromCharCode(65 + index)}. ${option}`,
        x: QUESTION_X + OPTION_X_OFFSET + OPTION_TEXT_X_OFFSET,
        y: current_y + OPTION_RADIO_RADIUS,
        fontSize: 16,
        fill: "#333333",
        metadata: {
          source: "assistant",
          role: "option_label",
          option_id: index,
          question_id: args.question_id,
          groupId: args.question_id
        }
      });
      
      current_y += OPTION_SPACING;
    });

    return specs;
  },
});

export const drawTableSpecs = action({
  args: {
    headers: v.array(v.string()),
    rows: v.array(v.array(v.string())),
    title: v.optional(v.string()),
    table_id: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    // This recreates the Python draw_table_actions logic in TypeScript
    const specs: any[] = [];
    const n_cols = args.headers.length;
    const n_rows = args.rows.length + 1; // +1 for header row
    
    const cell_width = 140;
    const cell_height = 40;
    const col_gap = 10;
    const row_gap = 10;
    
    const start_x = 50;
    const start_y = 50;

    // Draw header cells
    args.headers.forEach((header: string, c: number) => {
      const x = start_x + c * (cell_width + col_gap);
      const y = start_y;
      
      specs.push({
        id: `${args.table_id}-header-${c}`,
        kind: "rect",
        x: x,
        y: y,
        width: cell_width,
        height: cell_height,
        fill: "#BBDEFB",
        stroke: "#0D47A1",
        strokeWidth: 1,
        metadata: { 
          source: "assistant", 
          role: "table_header", 
          table_id: args.table_id, 
          col: c,
          groupId: args.table_id
        },
      });
      
      specs.push({
        id: `${args.table_id}-header-${c}-text`,
        kind: "text",
        x: x + 10,
        y: y + cell_height / 2,
        text: header,
        fontSize: 14,
        fill: "#0D47A1",
        metadata: { 
          source: "assistant", 
          role: "table_header_text", 
          table_id: args.table_id, 
          col: c,
          groupId: args.table_id
        },
      });
    });

    // Draw body cells
    args.rows.forEach((row_values: string[], r: number) => {
      for (let c = 0; c < n_cols; c++) {
        const x = start_x + c * (cell_width + col_gap);
        const y = start_y + (r + 1) * (cell_height + row_gap);
        const text_value = c < row_values.length ? row_values[c] : "";
        
        specs.push({
          id: `${args.table_id}-cell-${r}-${c}`,
          kind: "rect",
          x: x,
          y: y,
          width: cell_width,
          height: cell_height,
          fill: "#FFFFFF",
          stroke: "#9E9E9E",
          strokeWidth: 1,
          metadata: { 
            source: "assistant", 
            role: "table_cell", 
            table_id: args.table_id, 
            row: r, 
            col: c,
            groupId: args.table_id
          },
        });
        
        specs.push({
          id: `${args.table_id}-cell-${r}-${c}-text`,
          kind: "text",
          x: x + 10,
          y: y + cell_height / 2,
          text: text_value,
          fontSize: 14,
          fill: "#000000",
          metadata: { 
            source: "assistant", 
            role: "table_cell_text", 
            table_id: args.table_id, 
            row: r, 
            col: c,
            groupId: args.table_id
          },
        });
      }
    });

    return specs;
  },
});

export const drawDiagramSpecs = action({
  args: {
    diagram_type: v.string(),
    elements: v.array(v.any()),
    title: v.optional(v.string()),
    diagram_id: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    // This recreates the Python draw_diagram_actions logic in TypeScript
    const specs = [];
    const center_x = 200;
    const center_y = 200;

    if (args.diagram_type === "flowchart" && args.elements.length > 0) {
      // Flowchart diagram implementation
      const box_width = 140;
      const box_height = 60;
      const h_gap = 80;
      const start_x = 50;
      const start_y = 50;
      
      args.elements.forEach((step: any, i: number) => {
        const x = start_x + i * (box_width + h_gap);
        const y = start_y;
        
        // Box
        specs.push({
          id: `${args.diagram_id}-box-${i}`,
          kind: "rect",
          x: x,
          y: y,
          width: box_width,
          height: box_height,
          fill: "#E8F5E9",
          stroke: "#1B5E20",
          strokeWidth: 1,
          metadata: {
            source: "assistant",
            role: "flow_box",
            chart_id: args.diagram_id,
            step: i,
            groupId: args.diagram_id
          }
        });
        
        // Box text
        specs.push({
          id: `${args.diagram_id}-box-${i}-text`,
          kind: "text",
          x: x + box_width / 2,
          y: y + box_height / 2,
          text: step.label || step.text || `Step ${i + 1}`,
          fontSize: 14,
          fill: "#1B5E20",
          textAnchor: "middle",
          metadata: {
            source: "assistant",
            role: "flow_box_text",
            chart_id: args.diagram_id,
            step: i,
            groupId: args.diagram_id
          }
        });
        
        // Arrow to next box
        if (i < args.elements.length - 1) {
          const x1 = x + box_width;
          const x2 = start_x + (i + 1) * (box_width + h_gap);
          const y_mid = y + box_height / 2;
          
          specs.push({
            id: `${args.diagram_id}-arrow-${i}-${i+1}`,
            kind: "line",
            points: [x1, y_mid, x2 - 10, y_mid],
            stroke: "#000000",
            strokeWidth: 2,
            metadata: {
              source: "assistant",
              role: "flow_arrow",
              chart_id: args.diagram_id,
              from: i,
              to: i + 1,
              groupId: args.diagram_id
            }
          });
        }
      });
    } else {
      // Simple circular diagram (default)
      specs.push({
        id: `diagram-${args.diagram_id}-circle`,
        kind: "circle",
        x: center_x,
        y: center_y,
        radius: 60,
        stroke: "#1976D2",
        strokeWidth: 2,
        fill: "#E3F2FD",
        metadata: { 
          source: "assistant", 
          role: "main_shape", 
          diagram_id: args.diagram_id,
          diagram_type: args.diagram_type,
          groupId: args.diagram_id
        },
      });

      specs.push({
        id: `diagram-${args.diagram_id}-label`,
        kind: "text",
        x: center_x,
        y: center_y,
        text: args.title || "Diagram",
        fontSize: 20,
        fill: "#1976D2",
        metadata: { 
          source: "assistant", 
          role: "label", 
          diagram_id: args.diagram_id,
          diagram_type: args.diagram_type,
          groupId: args.diagram_id
        },
      });
    }

    return specs;
  },
});

// NEW: MCQ Feedback support for Day 8-9
export const drawMCQFeedbackSpecs = action({
  args: {
    question_id: v.string(),
    option_id: v.number(),
    is_correct: v.boolean(),
    num_options: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    // This recreates the Python draw_mcq_feedback logic
    const specs = [];
    const GREEN = "#2ECC71";
    const RED = "#E74C3C";
    
    // 1. Update the selected radio circle color
    const radio_id = `mcq-${args.question_id}-opt-${args.option_id}-radio`;
    specs.push({
      id: radio_id,
      kind: "update", // FE should treat this as property update
      fill: args.is_correct ? GREEN : RED,
      stroke: args.is_correct ? GREEN : RED,
    });
    
    // 2. Add a ✓ / ✗ mark near the option text
    const mark_id = `mcq-${args.question_id}-opt-${args.option_id}-mark`;
    const mark_text = args.is_correct ? "✓" : "✗";
    const mark_color = args.is_correct ? GREEN : RED;
    
    specs.push({
      id: mark_id,
      kind: "text",
      text: mark_text,
      x: 300, // Position to the right of option text
      y: 100 + (args.option_id * 40) + 8, // Align with option
      fontSize: 16,
      fill: mark_color,
      metadata: {
        source: "assistant",
        role: "feedback_mark",
        question_id: args.question_id,
        option_id: args.option_id
      }
    });
    
    // 3. Make all options non-selectable (disable interaction)
    const num_options = args.num_options || 4;
    for (let i = 0; i < num_options; i++) {
      specs.push({
        id: `mcq-${args.question_id}-opt-${i}-radio`,
        kind: "update",
        selectable: false
      });
      
      specs.push({
        id: `mcq-${args.question_id}-opt-${i}-text`,
        kind: "update", 
        selectable: false
      });
    }
    
    return specs;
  },
});

// Legacy shim actions to redirect old Python skill calls
export const legacyDrawMCQActions = action({
  args: {
    question_data: v.any(),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy drawMCQActions called, redirecting to createEducationalContent");
    
    const mcqData = {
      question: args.question_data.question,
      options: args.question_data.options,
      correct_index: args.question_data.correct_option_index || args.question_data.correct_index,
      explanation: args.question_data.explanation,
    };

    // Redirect to the new educational content skill
    return await ctx.runAction(api.skills.educational_content.createEducationalContent, {
      content_type: "mcq",
      data: mcqData,
      session_id: args.session_id,
    });
  },
});

export const legacyDrawTableActions = action({
  args: {
    table_data: v.any(),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy drawTableActions called, redirecting to createEducationalContent");
    
    const tableData = {
      headers: args.table_data.headers,
      rows: args.table_data.rows,
      title: args.table_data.title,
    };

    return await ctx.runAction(api.skills.educational_content.createEducationalContent, {
      content_type: "table",
      data: tableData,
      session_id: args.session_id,
    });
  },
});

export const legacyDrawDiagramActions = action({
  args: {
    diagram_data: v.any(),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy drawDiagramActions called, redirecting to createEducationalContent");
    
    const diagramData = {
      diagram_type: args.diagram_data.diagram_type || args.diagram_data.type || "flowchart",
      elements: args.diagram_data.elements || args.diagram_data.steps || [],
      title: args.diagram_data.title || args.diagram_data.topic,
    };

    return await ctx.runAction(api.skills.educational_content.createEducationalContent, {
      content_type: "diagram",
      data: diagramData,
      session_id: args.session_id,
    });
  },
});

export const legacyClearWhiteboard = action({
  args: {
    scope: v.optional(v.string()),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy clearWhiteboard called, redirecting to clearWhiteboard");
    
    return await ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
      scope: (args.scope as "all" | "selection" | "mcq" | "diagrams" | "tables" | "assistant_content") || "all",
      session_id: args.session_id,
    });
  },
});

// NEW: Support for drawing tools and primitive operations
export const legacyDrawText = action({
  args: {
    text: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy drawText called, redirecting to batch operations");
    
    return await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
      operations: [{
        operation_type: "add_text",
        data: {
          text: args.text,
          x: args.x || 100,
          y: args.y || 100,
        }
      }],
      session_id: args.session_id,
    });
  },
});

export const legacyDrawShape = action({
  args: {
    shape_type: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log("Legacy drawShape called, redirecting to batch operations");
    
    return await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
      operations: [{
        operation_type: "add_shape",
        data: {
          shape_type: args.shape_type,
          x: args.x || 100,
          y: args.y || 100,
          width: args.width || 50,
          height: args.height || 50,
        }
      }],
      session_id: args.session_id,
    });
  },
});

// NEW: Migration utility functions
function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Migration logging helper
export const logMigrationCall = action({
  args: {
    legacy_skill: v.string(),
    new_skill: v.string(),
    session_id: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "legacy_skill_redirect",
      details: `${args.legacy_skill} → ${args.new_skill} for session ${args.session_id}`,
    });
    
    return "Migration logged successfully";
  },
}); 