"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

/**
 * Launch a Modal sandbox for a given session and return the public tunnel URL.
 *
 * Prerequisites:
 *   • Environment variables MODAL_TOKEN_ID / MODAL_TOKEN_SECRET must be set in this action runtime.
 *   • TEMPLATE_REPO (Git HTTPS URL of the base Next.js whiteboard template) and
 *     TEMPLATE_APP_NAME (Modal App deployment name) should be configured as env vars.
 */
export const launchSandbox = action({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.object({
    sandboxId: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(api.sessions.getSession, {
      sessionId,
      includeContext: false,
    });
    if (!session) throw new Error("Session not found or access denied");

    const templateCommit = (session as any).template_commit_sha || "main";

    // --- Initialise Modal client --------------------------------------------------
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;
    if (!tokenId || !tokenSecret) {
      throw new Error("Missing MODAL_TOKEN_ID / MODAL_TOKEN_SECRET env vars");
    }
    // @ts-ignore - Modal types live in frontend; ignore for action build
    const modal = await import("modal");
    modal.initializeClient({ tokenId, tokenSecret });

    const appName = process.env.TEMPLATE_APP_NAME || "ai-tutor-whiteboard";

    // Ensure an App exists (idempotent)
    const app = await modal.App.lookup(appName, { createIfMissing: true });

    // Use a lightweight Node image; repository will be cloned at runtime
    const image = await app.imageFromRegistry("node:20-alpine");

    // Command will clone repo at commit and start next dev
    const repoUrl = process.env.TEMPLATE_REPO || "https://github.com/your-org/whiteboard-template.git";

    const command = [
      "sh",
      "-c",
      [
        `git clone ${repoUrl} /app`,
        `cd /app`,
        `git checkout ${templateCommit}`,
        "npm install --omit=dev --silent",
        "npx next dev -p 3000 --hostname 0.0.0.0",
      ].join(" && "),
    ];

    const sb = await app.createSandbox(image, {
      command,
      cpu: 0.25,
      memory: 512,
      encryptedPorts: [3000],
      timeout: 45 * 60 * 1000, // 45 min per plan
    });

    // Wait briefly for tunnel metadata; throw if not available in time
    const tunnels = await sb.tunnels(30_000);
    const tunnel = tunnels[3000];
    if (!tunnel) throw new Error("Tunnel for port 3000 not available");

    // -----------------------------------------
    // Sync overlay files into the fresh sandbox
    // -----------------------------------------

    const overlays = await ctx.runQuery(api.code_overlays.listFiles, {
      projectId: sessionId, // project_id == session id in current design
    });

    for (const file of overlays) {
      const targetPath = `/app/${file.path}`;

      if (file.content !== undefined && file.content !== null) {
        // Ensure parent directory exists and write content via stdin
        const proc = await sb.exec(
          [
            "sh",
            "-c",
            `mkdir -p $(dirname '${targetPath}') && cat > '${targetPath}'`,
          ],
          { stdout: "ignore", stderr: "ignore" },
        );
        await proc.stdin.writeText(file.content);
        await proc.stdin.close();
        await proc.wait();
      } else {
        // Deleted file – remove from FS if present
        await sb.exec(["sh", "-c", `rm -f '${targetPath}'`], {
          stdout: "ignore",
          stderr: "ignore",
        });
      }
    }

    // Persist sandboxId to session (optional)
    await ctx.runMutation(internal.sessions.setSandboxUrl, {
      sessionId,
      url: tunnel.url,
    });

    await ctx.runMutation(internal.sessions.updateSessionStatus, {
      sessionId,
      status: "active",
    });

    return {
      sandboxId: sb.sandboxId,
      url: tunnel.url,
    };
  },
}); 