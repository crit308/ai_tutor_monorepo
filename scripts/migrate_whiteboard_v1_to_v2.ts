/*
 * One-off migration from legacy whiteboard actions (batch_whiteboard_operations, draw_diagram_actions)
 * to the new primitives-first schema stored in `whiteboard_objects`.
 *
 * Usage (after deploying code):
 *   npx convex run scripts/migrate_whiteboard_v1_to_v2.ts
 */

import { api } from "../convex/_generated/api";
import { action } from "../convex/_generated/server";
import { v } from "convex/values";

export const migrateWhiteboardV1toV2 = action({
  args: {},
  returns: v.object({ migratedSessions: v.number() }),
  handler: async (ctx) => {
    let migratedSessions = 0;

    // 1. Get distinct session_ids that still have legacy whiteboard actions
    const legacySessions = await ctx.db
      .query("whiteboard_actions")
      .filter((q) =>
        q.or(
          q.eq(q.field("action.type"), "batch_whiteboard_operations"),
          q.eq(q.field("action.type"), "draw_diagram_actions")
        )
      )
      .collect();

    // unique session ids
    const sessionIds = Array.from(new Set(legacySessions.map((r: any) => r.session_id)));

    for (const sessionId of sessionIds) {
      // Fetch all legacy actions for this session, order by timestamp
      const actions = legacySessions.filter((r: any) => r.session_id === sessionId);
      const primitives: any[] = [];

      for (const row of actions) {
        const a = row.action;
        if (a.type === "draw_diagram_actions" && a.diagram_type === "flowchart") {
          const steps = a.elements.map((el: any) => el.label || el.content || "Step");
          const result = await ctx.runAction(api.helpers.flowchart.createFlowchart, {
            sessionId,
            steps,
          });
          primitives.push(...result.objects);
        } else if (a.type === "batch_whiteboard_operations") {
          // Already primitives in legacy spec; push as-is
          primitives.push(...a.objects);
        }
      }

      if (primitives.length) {
        await ctx.runMutation(api.database.whiteboard.addObjectsBulk as any, {
          sessionId,
          objects: primitives,
        });
        migratedSessions++;
      }

      // Mark legacy actions as migrated
      for (const row of actions) {
        await ctx.db.patch(row._id, { migrated_v2: true });
      }
    }

    return { migratedSessions };
  },
}); 