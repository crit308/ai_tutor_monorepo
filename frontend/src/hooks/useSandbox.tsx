import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex_generated/api";

export type SandboxStatus = "idle" | "starting" | "ready" | "error";

export function useSandbox(sessionId: string | undefined) {
  const [status, setStatus] = useState<SandboxStatus>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const launch = useMutation(api.actions.sandbox.launchSandbox);
  const session = useQuery(api.sessions.getSession, sessionId ? { sessionId, includeContext: false } : "skip");

  // Launch sandbox if needed
  useEffect(() => {
    if (!sessionId || session === undefined) return; // still loading query
    if (session === null) {
      setStatus("error");
      return;
    }

    if (session.sandbox_url) {
      setUrl(session.sandbox_url);
      if (status === "idle") setStatus("ready");
      return;
    }

    if (status === "idle") {
      (async () => {
        try {
          setStatus("starting");
          const resp = await launch({ sessionId });
          setUrl(resp.url);
          setStatus("ready");
        } catch (err) {
          console.error("Sandbox launch failed", err);
          setStatus("error");
        }
      })();
    }
  }, [sessionId, session, status, launch]);

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
          setStatus("ready");
        }
      } catch (_) {}
    },
    [url],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return { url, status, iframeRef, retry: () => setStatus("idle") } as const;
} 