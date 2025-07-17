import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "convex_generated/api";

export type SandboxStatus = "idle" | "starting" | "ready" | "error";

export function useSandbox(sessionId: string | undefined) {
  const [status, setStatus] = useState<SandboxStatus>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const launchSandbox = useAction(api.actions.sandbox.launchSandbox);
  const session = useQuery(api.database.sessions.getSession, sessionId ? { sessionId, includeContext: false } : "skip");
  const insertSnapshot = useAction(api.database.whiteboard.insertSnapshot);

  // Helper: wait until /api/health returns ok:true (or give up after 90s)
  const waitForHealth = useCallback(async (baseUrl: string) => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const json: any = await res.json();
          if (json && json.ok) return true;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false; // timeout
  }, []);

  // Launch sandbox if needed
  useEffect(() => {
    if (!sessionId || session === undefined) return; // still loading query
    if (session === null) {
      setStatus("error");
      return;
    }

    if (session.sandbox_url) {
      (async () => {
        if (status === "idle") setStatus("starting");
        const healthy = await waitForHealth(session.sandbox_url);
        if (healthy) {
          setUrl(session.sandbox_url);
          setStatus("ready");
        } else {
          // Keep spinner instead of error; let user retry later
          setStatus("starting");
        }
      })();
      return;
    }

    if (status === "idle") {
      (async () => {
        try {
          setStatus("starting");
          const resp = await launchSandbox({ sessionId });
          const healthy = await waitForHealth(resp.url);
          if (healthy) {
            setUrl(resp.url);
            setStatus("ready");
          } else {
            setStatus("starting");
          }
        } catch (err) {
          console.error("Sandbox launch failed", err);
          setStatus("error");
        }
      })();
    }
  }, [sessionId, session, status, launchSandbox, waitForHealth]);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for ready postMessage from iframe
  const handleMessage = useCallback(
    (ev: MessageEvent) => {
      if (!url) return;
      try {
        const origin = new URL(url).origin;
        if (ev.origin !== origin) return;
        const data = ev.data;
        if (data && data.ns === "ai-tutor/wb" && data.type === "ready") {
          // Send init handshake back to the iframe with session & (optionally) user info.
          try {
            const originUrl = new URL(url);
            iframeRef.current?.contentWindow?.postMessage(
              {
                ns: "ai-tutor/wb",
                v: 1,
                type: "init",
                payload: {
                  sessionId,
                },
              },
              originUrl.origin,
            );
          } catch (_err) {
            // ignore
          }
          setStatus("ready");
          return;
        }

        if (data && data.ns === "ai-tutor/wb" && data.type === "snapshot") {
          if (!sessionId) return;
          const { payload } = data;
          const index = payload?.index ?? 0;
          const objects = payload?.objects ?? [];
          const actionsJson = JSON.stringify(objects);
          insertSnapshot({ sessionId, snapshotIndex: index, actionsJson }).catch(
            (err) => console.error("Snapshot insert failed", err),
          );
          return;
        }
      } catch (_) {}
    },
    [url, sessionId, insertSnapshot],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return { url, status, iframeRef, retry: () => setStatus("idle") } as const;
} 