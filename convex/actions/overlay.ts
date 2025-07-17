"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Apply a single overlay file change to an active sandbox (if any).
 */
export const applyPatch = action({
  args: {
    sessionId: v.id("sessions"),
    path: v.string(),
  },
  handler: async (ctx, { sessionId, path }) => {
    const session = await ctx.runQuery(internal.sessions.getSessionInternal, {
      sessionId,
      includeContext: false,
    });
    if (!session || !session.sandbox_id) return null;

    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    // @ts-ignore
    const modal = await import("modal");
    modal.initializeClient({ tokenId, tokenSecret });

    const sb = new modal.Sandbox(session.sandbox_id);

    // Fetch overlay row
    const overlay = await ctx.runQuery(internal.code_overlays.getByProjectPath, {
      projectId: sessionId,
      path,
    });
    const targetPath = `/app/${path}`;

    if (!overlay || overlay.content === undefined) {
      // Delete file
      await sb.exec(["sh", "-c", `rm -f '${targetPath}'`], { stdout: "ignore", stderr: "ignore" });
      return null;
    }

    const proc = await sb.exec(
      [
        "sh",
        "-c",
        `mkdir -p $(dirname '${targetPath}') && cat > '${targetPath}'`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    await proc.stdin.writeText(overlay.content);
    await proc.stdin.close();
    await proc.wait();

    return null;
  },
}); 