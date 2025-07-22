"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import crypto from "crypto";

// Global registry to keep sandbox objects alive for overlay operations
const sandboxRegistry = new Map<string, any>();

// Helper to debug registry state
function debugRegistry() {
  console.log(`[sandbox] Registry state: ${sandboxRegistry.size} entries`);
  for (const [sessionId, sb] of sandboxRegistry.entries()) {
    console.log(`[sandbox] Registry entry: ${sessionId} -> ${sb?.sandboxId || 'unknown'}`);
  }
}

// Helper to apply a single overlay to a sandbox object
async function applySingleOverlay(sb: any, path: string, content: string | null | undefined) {
  console.log(`[applySingleOverlay] Processing path: "${path}"`);

  // Map overlay path into sandbox filesystem path
  const targetPath = path.startsWith("app/")
    ? `/app/${path.slice(4)}`
    : `/app/${path}`;

  if (content !== undefined && content !== null) {
    console.log(`[applySingleOverlay] Writing file content (${content.length} chars) to ${targetPath}`);
    
    // Write the file content using echo instead of stdin to avoid ReadableStream.from issues
    // Escape single quotes in content for shell safety
    const escapedContent = content.replace(/'/g, "'\"'\"'");
    const writeCmd = `mkdir -p $(dirname '${targetPath}') && echo '${escapedContent}' > '${targetPath}'`;
    
    const proc = await sb.exec(["sh", "-c", writeCmd], { stdout: "ignore", stderr: "ignore" });
    await proc.wait();

    console.log(`[applySingleOverlay] Widget pattern test: ${/^app\/widgets\/[^/]+\/client\.tsx$/.test(path)}`);

    // If the file is a widget TSX client, compile it to JS so the browser can load it directly
    if (/^app\/widgets\/[^/]+\/client\.tsx$/.test(path)) {
      console.log(`[applySingleOverlay] Found widget TSX file: ${path}`);
      const entry = path.split("/")[2];
      const pubJsPath = `/app/public/widgets/${entry}/client.js`;
      const widgetsJsPath = `/app/widgets/${entry}/client.js`;

      // Debug: check if TSX source exists
      await sb.exec(["sh","-c", `echo "TSX source check:" && ls -la '${targetPath}' || echo "TSX source missing"`]);

      // Ensure output directories exist
      await sb.exec(["sh","-c", `mkdir -p $(dirname '${pubJsPath}') && mkdir -p $(dirname '${widgetsJsPath}')`]);

      // Attempt to compile using esbuild inside the sandbox
      console.log(`[applySingleOverlay] Compiling widget ${entry} from ${targetPath} to ${pubJsPath}`);
      const buildCmd = [
        "npx", "esbuild", targetPath,
        "--bundle",
        "--format=esm",
        "--jsx=automatic",
        `--outfile=${pubJsPath}`,
      ];

      try {
        console.log(`[applySingleOverlay] Running esbuild command: ${buildCmd.join(' ')}`);
        const buildProc = await sb.exec(buildCmd, { stdout: "pipe", stderr: "pipe" });
        const exitCode = await buildProc.wait();
        console.log(`[applySingleOverlay] esbuild exit code: ${exitCode}`);
        if (exitCode !== 0) {
          console.log(`[applySingleOverlay] Build failed, creating error stub`);
          // Build failed – write a stub that throws
          await sb.exec(["sh","-c", `echo 'throw new Error("Widget build failed. Check sandbox logs.");' > '${pubJsPath}'`]);
          await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);
        } else {
          console.log(`[applySingleOverlay] Build successful, copying bundle`);
          // Copy bundle to widgets path
          await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);

          // Ensure bundle actually exists; if not, write an error stub so browser gets 200
          await sb.exec(["sh","-c", `if [ ! -f '${pubJsPath}' ]; then echo "throw new Error(\\"Widget build failed – bundle missing. Check sandbox logs.\\");" > '${pubJsPath}'; fi`]);

          // List resulting files for debug
          await sb.exec(["sh","-c", `ls -R /app/public/widgets/${entry}`]);
          // Also check what's in the widgets path
          await sb.exec(["sh","-c", `echo "Widgets path contents:" && ls -la /app/widgets/${entry}/ || echo "Widgets dir missing"`]);
        }
      } catch (err) {
        console.log(`[applySingleOverlay] esbuild crashed:`, err);
        // esbuild not available or crashed – write fallback stub
        await sb.exec(["sh","-c", `echo 'throw new Error("esbuild not available in sandbox");' > '${pubJsPath}'`]);
        await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);
      }
    }
  } else {
    // Delete the file
    console.log(`[applySingleOverlay] Deleting file: ${targetPath}`);
    await sb.exec(["sh", "-c", `rm -f '${targetPath}'`], {
      stdout: "ignore",
      stderr: "ignore",
    });
  }

  console.log(`[applySingleOverlay] Successfully processed ${path}`);
}

/**
 * Apply a single overlay file change to an active sandbox immediately.
 */
export const applyOverlayToSandbox = action({
  args: {
    sessionId: v.id("sessions"),
    path: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, path, content }) => {
    console.log(`[applyOverlay] ENTRY: sessionId=${sessionId}, path=${path}`);
    debugRegistry();
    
    let sb = sandboxRegistry.get(sessionId);
    if (!sb) {
      console.log(`[applyOverlay] No active sandbox found in registry for session ${sessionId}`);
      
      // Check if the session has sandbox info in the database
      const session = await ctx.runQuery(api.database.sessions.getSession, { sessionId, includeContext: false });
      const s = session as any;
      if (session && s.sandbox_id && s.sandbox_url) {
        console.log(`[applyOverlay] Found sandbox info in database: ID=${s.sandbox_id}, URL=${s.sandbox_url}`);
        console.log(`[applyOverlay] Cannot reconnect to existing sandbox - Modal doesn't support reconnection`);
        console.log(`[applyOverlay] Widget will need to be created after a fresh sandbox launch`);
      } else {
        console.log(`[applyOverlay] No sandbox info found in database for session ${sessionId}`);
      }
      return null;
    }

    console.log(`[applyOverlay] Found active sandbox: ${sb.sandboxId}`);

    // Map overlay path into sandbox filesystem path
    const targetPath = path.startsWith("app/")
      ? `/app/${path.slice(4)}`
      : `/app/${path}`;

    if (content !== undefined && content !== null) {
      console.log(`[applyOverlay] Writing file content (${content.length} chars) to ${targetPath}`);
      
      // Write the file content using echo instead of stdin to avoid ReadableStream.from issues
      // Escape single quotes in content for shell safety
      const escapedContent = content.replace(/'/g, "'\"'\"'");
      const writeCmd = `mkdir -p $(dirname '${targetPath}') && echo '${escapedContent}' > '${targetPath}'`;
      
      const proc = await sb.exec(["sh", "-c", writeCmd], { stdout: "ignore", stderr: "ignore" });
      await proc.wait();

      console.log(`[applyOverlay] Processing path: "${path}"`);
      console.log(`[applyOverlay] Widget pattern test: ${/^app\/widgets\/[^/]+\/client\.tsx$/.test(path)}`);

      // If the file is a widget TSX client, compile it to JS so the browser can load it directly
      if (/^app\/widgets\/[^/]+\/client\.tsx$/.test(path)) {
        console.log(`[applyOverlay] Found widget TSX file: ${path}`);
        const entry = path.split("/")[2];
        const pubJsPath = `/app/public/widgets/${entry}/client.js`;
        const widgetsJsPath = `/app/widgets/${entry}/client.js`;

        // Debug: check if TSX source exists
        await sb.exec(["sh","-c", `echo "TSX source check:" && ls -la '${targetPath}' || echo "TSX source missing"`]);

        // Ensure output directories exist
        await sb.exec(["sh","-c", `mkdir -p $(dirname '${pubJsPath}') && mkdir -p $(dirname '${widgetsJsPath}')`]);

        // Attempt to compile using esbuild inside the sandbox
        console.log(`[applyOverlay] Compiling widget ${entry} from ${targetPath} to ${pubJsPath}`);
        const buildCmd = [
          "npx", "esbuild", targetPath,
          "--bundle",
          "--format=esm",
          "--jsx=automatic",
          `--outfile=${pubJsPath}`,
        ];

        try {
          console.log(`[applyOverlay] Running esbuild command: ${buildCmd.join(' ')}`);
          const buildProc = await sb.exec(buildCmd, { stdout: "pipe", stderr: "pipe" });
          const exitCode = await buildProc.wait();
          console.log(`[applyOverlay] esbuild exit code: ${exitCode}`);
          if (exitCode !== 0) {
            console.log(`[applyOverlay] Build failed, creating error stub`);
            // Build failed – write a stub that throws
            await sb.exec(["sh","-c", `echo 'throw new Error("Widget build failed. Check sandbox logs.");' > '${pubJsPath}'`]);
            await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);
          } else {
            console.log(`[applyOverlay] Build successful, copying bundle`);
            // Copy bundle to widgets path
            await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);

            // Ensure bundle actually exists; if not, write an error stub so browser gets 200
            await sb.exec(["sh","-c", `if [ ! -f '${pubJsPath}' ]; then echo "throw new Error(\\"Widget build failed – bundle missing. Check sandbox logs.\\");" > '${pubJsPath}'; fi`]);

            // List resulting files for debug
            await sb.exec(["sh","-c", `ls -R /app/public/widgets/${entry}`]);
            // Also check what's in the widgets path
            await sb.exec(["sh","-c", `echo "Widgets path contents:" && ls -la /app/widgets/${entry}/ || echo "Widgets dir missing"`]);
          }
        } catch (err) {
          console.log(`[applyOverlay] esbuild crashed:`, err);
          // esbuild not available or crashed – write fallback stub
          await sb.exec(["sh","-c", `echo 'throw new Error("esbuild not available in sandbox");' > '${pubJsPath}'`]);
          await sb.exec(["sh","-c", `cp '${pubJsPath}' '${widgetsJsPath}'`]);
        }
      }
    } else {
      // Delete the file
      console.log(`[applyOverlay] Deleting file: ${targetPath}`);
      await sb.exec(["sh", "-c", `rm -f '${targetPath}'`], {
        stdout: "ignore",
        stderr: "ignore",
      });
    }

    console.log(`[applyOverlay] Successfully processed ${path}`);
    return null;
  },
});

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
    const session = await ctx.runQuery(api.database.sessions.getSession, {
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

    const overlaySecret = crypto.randomBytes(32).toString("hex");

    const command = [
      "sh",
      "-c",
      [
        // Ensure git is available in the Alpine image
        "apk add --no-cache git",
        // Clone template repo and checkout exact commit
        `git clone ${repoUrl} /app`,
        `cd /app`,
        `git checkout ${templateCommit}`,
        // Install all dependencies (incl. dev) needed for Next.js compilation
        "npm install --silent",
        // Ensure esbuild is available for widget compilation
        "npm install --silent esbuild",
        // Run Next.js in development mode so Fast Refresh picks up overlay changes
        "npx next dev -p 3000 --hostname 0.0.0.0",
      ].join(" && "),
    ];

    const sb = await app.createSandbox(image, {
      command,
      cpu: 0.25,
      memory: 512,
      encryptedPorts: [3000],
      timeout: 45 * 60 * 1000, // 45 min per plan
      // @ts-ignore - env is supported by Modal but not in types yet
      env: { OVERLAY_SECRET: overlaySecret },
    });

    // Wait briefly for tunnel metadata; throw if not available in time
    const tunnels = await sb.tunnels(30_000);
    const tunnel = tunnels[3000];
    if (!tunnel) throw new Error("Tunnel for port 3000 not available");

    // Store the sandbox object in the registry for overlay operations
    console.log(`[sandbox] Registering sandbox: ID=${sb.sandboxId}, URL=${tunnel.url}`);
    sandboxRegistry.set(sessionId, sb);

    // Store sandbox info in database
    console.log(`[sandbox] Storing sandbox info: ID=${sb.sandboxId}, URL=${tunnel.url}`);
    await ctx.runMutation(internal.database.sessions.setSandboxInfo, {
      sessionId,
      sandboxId: sb.sandboxId,
      url: tunnel.url,
      overlaySecret,
    });

    // -----------------------------------------
    // Sync overlay files into the fresh sandbox
    // -----------------------------------------

    const overlays = await ctx.runQuery(api.database.code_overlays.listFiles, {
      projectId: sessionId, // project_id == session id in current design
    });

    for (const file of overlays) {
      if (file.path === "app/api/health/route.ts") continue; // preserve built-in health route
      
      // Apply overlay directly using the live sandbox object
      await applySingleOverlay(sb, file.path, file.content);
    }

    // Sandbox info already stored early in the process

    // Update session status via the public mutation (no internal version exists)
    await ctx.runMutation(api.database.sessions.updateSessionStatus, {
      sessionId,
      status: "active",
    });

    return {
      sandboxId: sb.sandboxId,
      url: tunnel.url,
    };
  },
}); 