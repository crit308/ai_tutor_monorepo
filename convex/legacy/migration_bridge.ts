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
    
    // Question text object
    specs.push({
      id: `question-${args.question_id}`,
      kind: "text",
      text: args.question,
      x: 50,
      y: 50,
      fontSize: 18,
      fill: "#000000",
      metadata: { 
        source: "assistant",
        role: "question",
        question_id: args.question_id 
      }
    });

    // Option objects
    args.options.forEach((option: string, index: number) => {
      // Option selector circle
      specs.push({
        id: `option-selector-${args.question_id}-${index}`,
        kind: "circle",
        x: 50,
        y: 100 + (index * 40),
        radius: 15,
        fill: "#ffffff",
        stroke: "#000000",
        metadata: {
          source: "assistant",
          role: "option_selector",
          option_id: index,
          question_id: args.question_id
        }
      });

      // Option text
      specs.push({
        id: `option-text-${args.question_id}-${index}`,
        kind: "text", 
        text: option,
        x: 80,
        y: 100 + (index * 40),
        fontSize: 14,
        fill: "#000000",
        metadata: {
          source: "assistant",
          role: "option_label",
          option_id: index,
          question_id: args.question_id
        }
      });
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
          col: c 
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
          col: c 
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
            col: c 
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
            col: c 
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

    // Simple circular diagram for now (can be expanded for other types)
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
        diagram_type: args.diagram_type
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
        diagram_type: args.diagram_type
      },
    });

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
      correct_index: args.question_data.correct_option_index,
      explanation: args.question_data.explanation,
    };

    // For now, return a placeholder until the circular dependency is resolved
    return {
      payload: {
        message_text: "Legacy MCQ action called - will be redirected to new system",
        message_type: "status_update"
      },
      actions: []
    };
  },
}); 