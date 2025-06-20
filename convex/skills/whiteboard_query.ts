import { query } from "../_generated/server";
import { v } from "convex/values";
import type { WBObject } from "@aitutor/whiteboard-schema";

/**
 * Generate a concise text summary of all whiteboard objects for a session.
 * The summary is designed to fit easily into an LLM prompt without leaking raw JSON.
 */
export const getWhiteboardSummary = query({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    // Allow assistant context: don't requireAuth here for simplicity
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();

    const objects: WBObject[] = rows.map((r) => JSON.parse(r.object_spec));

    const counts: Record<string, number> = {};
    const texts: string[] = [];
    const groups: Record<string, string[]> = {};

    for (const obj of objects) {
      counts[obj.kind] = (counts[obj.kind] ?? 0) + 1;
      if (obj.kind === "text") {
        // @ts-ignore
        texts.push((obj as any).text ?? "");
      }
      const gid = obj.metadata?.groupId;
      if (gid) {
        if (!groups[gid]) groups[gid] = [];
        groups[gid].push(obj.id);
      }
    }

    const countParts = Object.entries(counts)
      .map(([kind, n]) => `${n} ${kind}${n === 1 ? "" : "s"}`)
      .join(", ");

    const groupParts = Object.entries(groups)
      .map(([gid, ids]) => `${gid} (${ids.length})`)
      .join(", ");

    let summary = `The board contains ${countParts || "no objects"}.`;
    if (texts.length) summary += ` Text content: "${texts.join(" | ")}".`;
    if (groupParts) summary += ` Groups: ${groupParts}.`;

    return summary;
  },
}); 