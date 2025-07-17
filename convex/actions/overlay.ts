"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Apply a single overlay file change to an active sandbox (if any).
 */
export const applyPatch = internalAction({
  args: {
    sessionId: v.id("sessions"),
    path: v.string(),
  },
  handler: async (ctx, { sessionId, path }) => {
    const session = await ctx.runQuery(internal.database.sessions.getSessionInternal, {
      sessionId,
      userId: null,
      includeContext: false,
    });
    const s = session as any;
    if (!s || !s.sandbox_id) return null;

    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    if (!tokenId || !tokenSecret) {
      throw new Error("Missing MODAL_TOKEN_ID / MODAL_TOKEN_SECRET environment variables");
    }
    // @ts-ignore – Modal types not available in Convex action runtime
    const modal = await import("modal");
    modal.initializeClient({ tokenId: tokenId!, tokenSecret: tokenSecret! });

    const sb = new modal.Sandbox(s.sandbox_id);

    // Fetch overlay row
    const overlay = await ctx.runQuery(internal.database.code_overlays.getByProjectPath, {
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