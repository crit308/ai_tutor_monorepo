import { query } from "../_generated/server";
import { v } from "convex/values";
import type { WBObject } from "@aitutor/whiteboard-schema";

export const getWhiteboardSummary = query({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", q => q.eq("session_id", sessionId))
      .collect();

    const objs: WBObject[] = rows.map(r => JSON.parse(r.object_spec));
    const byKind: Record<string, number> = {};
    const texts: string[] = [];
    for (const o of objs) {
      byKind[o.kind] = (byKind[o.kind] || 0) + 1;
      if (o.kind === "text") {
        // @ts-ignore
        const t = (o as any).text;
        if (t) texts.push(t);
      }
    }
    const kinds = Object.entries(byKind).map(([k,n])=>`${n} ${k}${n>1?"s":""}`).join(", ");
    let summary = kinds ? `Board has ${kinds}.` : "Board empty.";
    if (texts.length) summary += ` Texts: "${texts.join(" | ")}".`;
    return summary;
  }
}); 