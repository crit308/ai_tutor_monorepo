import { action } from "../_generated/server";
import { v } from "convex/values";
import type { WBObject } from "@aitutor/whiteboard-schema";

// Util: generate simple random id (8-char base36)
function gid() {
  return Math.random().toString(36).substring(2, 10);
}

export const createFlowchart = action({
  args: {
    sessionId: v.id("sessions"),
    steps: v.array(v.string()), // list of labels in order
    theme: v.optional(
      v.object({
        fill: v.optional(v.string()),
        stroke: v.optional(v.string()),
        text: v.optional(v.string()),
        arrow: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({
    objects: v.array(v.any()),
    payload: v.object({ message_text: v.string(), message_type: v.string() }),
  }),
  handler: async (ctx, { sessionId, steps, theme }) => {
    const groupId = `flow-${gid()}`;

    const cfg = {
      fill: theme?.fill ?? "#E8F5E9",
      stroke: theme?.stroke ?? "#1B5E20",
      text: theme?.text ?? "#1B5E20",
      arrow: theme?.arrow ?? "#000000",
    };

    const objects: WBObject[] = [] as any;

    if (steps.length <= 4) {
      // horizontal layout
      const w = 140;
      const h = 60;
      const gap = 80;
      const startX = 50;
      const y = 50;
      steps.forEach((label, i) => {
        const x = startX + i * (w + gap);
        const rectId = `${groupId}-rect-${i}`;

        objects.push({
          id: rectId,
          kind: "rect",
          x,
          y,
          width: w,
          height: h,
          fill: cfg.fill,
          stroke: cfg.stroke,
          strokeWidth: 1,
          metadata: { groupId, generator: "flowchart", version: "1.0", step: i },
        } as any);
        objects.push({
          id: `${rectId}-text`,
          kind: "text",
          x: x + w / 2,
          y: y + h / 2,
          text: label,
          fontSize: 14,
          fill: cfg.text,
          textAnchor: "middle",
          metadata: { groupId, generator: "flowchart", version: "1.0", step: i },
        } as any);

        // arrow to next
        if (i < steps.length - 1) {
          const x1 = x + w;
          const x2 = startX + (i + 1) * (w + gap) - 10;
          const yMid = y + h / 2;
          objects.push({
            id: `${groupId}-arrow-${i}-${i + 1}`,
            kind: "line",
            points: [x1, yMid, x2, yMid],
            stroke: cfg.arrow,
            strokeWidth: 2,
            markerEnd: "arrow",
            metadata: { groupId, generator: "flowchart", version: "1.0", from: i, to: i + 1 },
          } as any);
        }
      });
    } else {
      // circular layout
      const centerX = 400;
      const centerY = 300;
      const radius = 200;
      const w = 120;
      const h = 50;
      const n = steps.length;
      steps.forEach((label, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle) - w / 2;
        const y = centerY + radius * Math.sin(angle) - h / 2;
        const rectId = `${groupId}-rect-${i}`;
        objects.push({
          id: rectId,
          kind: "rect",
          x,
          y,
          width: w,
          height: h,
          fill: cfg.fill,
          stroke: cfg.stroke,
          strokeWidth: 1,
          metadata: { groupId, generator: "flowchart", version: "1.0", step: i },
        } as any);
        objects.push({
          id: `${rectId}-text`,
          kind: "text",
          x: x + w / 2,
          y: y + h / 2,
          text: label,
          fontSize: 14,
          fill: cfg.text,
          textAnchor: "middle",
          metadata: { groupId, generator: "flowchart", version: "1.0", step: i },
        } as any);
        // arrow to next
        const nextIndex = (i + 1) % n;
        const angle2 = (2 * Math.PI * nextIndex) / n - Math.PI / 2;
        const x1 = centerX + radius * Math.cos(angle);
        const y1 = centerY + radius * Math.sin(angle);
        const x2 = centerX + radius * Math.cos(angle2);
        const y2 = centerY + radius * Math.sin(angle2);
        objects.push({
          id: `${groupId}-arrow-${i}-${nextIndex}`,
          kind: "line",
          points: [x1, y1, x2, y2],
          stroke: cfg.arrow,
          strokeWidth: 2,
          markerEnd: "arrow",
          metadata: { groupId, generator: "flowchart", version: "1.0", from: i, to: nextIndex },
        } as any);
      });
    }

    const payload = {
      message_text: `Created flowchart with ${steps.length} steps`,
      message_type: "status_update",
    };

    return { objects, payload };
  },
}); 