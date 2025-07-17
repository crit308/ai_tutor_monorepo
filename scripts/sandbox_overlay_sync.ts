// sandbox_overlay_sync.ts
// -----------------------------------
// Sync local file changes inside the Modal sandbox up to Convex `code_overlays`.
//
// USAGE (inside sandbox container):
//   SESSION_ID=<convex session id> \
//   CONVEX_URL=<https://<deployment>.convex.cloud> \
//   node sandbox_overlay_sync.js
//
// This script is *not* imported anywhere in the host monorepo. It lives here
// merely as source-of-truth; the whiteboard template repo will copy it into
// `/tools/sandbox_overlay_sync.ts` and run it with `ts-node` or bundle with esbuild.
// -----------------------------------

import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import fetch from "node-fetch";

const sessionId = process.env.SESSION_ID;
const convexUrl = process.env.CONVEX_URL;
if (!sessionId || !convexUrl) {
  console.error("Missing SESSION_ID or CONVEX_URL env vars");
  process.exit(1);
}

const apiEndpoint = `${convexUrl}/api/actions/database/code_overlays`; // Convex HTTP endpoint pattern

// Helper – POST JSON
async function postJSON(url: string, payload: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Convex upsert failed", res.status, text);
  }
}

// Debounce map so we don't flood Convex on every write event.
const pending = new Map<string, NodeJS.Timeout>();

function scheduleSync(filePath: string, event: "add" | "change" | "unlink") {
  if (pending.has(filePath)) {
    clearTimeout(pending.get(filePath)!);
  }
  pending.set(
    filePath,
    setTimeout(async () => {
      pending.delete(filePath);
      try {
        if (event === "unlink") {
          await postJSON(`${apiEndpoint}/deleteFile`, {
            projectId: sessionId,
            path: filePath,
          });
          return;
        }
        const content = await fs.promises.readFile(filePath, "utf8");
        await postJSON(`${apiEndpoint}/upsertFile`, {
          projectId: sessionId,
          path: filePath,
          content,
        });
      } catch (err) {
        console.error("Sync error", err);
      }
    }, 300),
  );
}

// Watch everything under /app except node_modules and .next build output
const ROOT = "/app";

chokidar
  .watch(["**/*"], {
    cwd: ROOT,
    ignored: ["node_modules/**", ".next/**", "**/.git/**"],
    persistent: true,
    ignoreInitial: true,
  })
  .on("add", (fp) => scheduleSync(path.posix.join(ROOT, fp), "add"))
  .on("change", (fp) => scheduleSync(path.posix.join(ROOT, fp), "change"))
  .on("unlink", (fp) => scheduleSync(path.posix.join(ROOT, fp), "unlink"));

console.log("[overlay-sync] watching for file changes in", ROOT); 