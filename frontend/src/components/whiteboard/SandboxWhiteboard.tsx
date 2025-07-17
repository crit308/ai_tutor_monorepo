import React from "react";
import { useSandbox } from "@/hooks/useSandbox";

interface Props {
  sessionId: string;
  className?: string;
}

export const SandboxWhiteboard: React.FC<Props> = ({ sessionId, className }) => {
  const { url, status, iframeRef, retry } = useSandbox(sessionId);

  if (status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}> 
        <p className="text-red-500 mb-2">Failed to start interactive board.</p>
        <button
          className="px-3 py-1 rounded bg-primary text-white"
          onClick={retry}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 z-10">
          <div className="animate-pulse">Connecting interactive board…</div>
        </div>
      )}
      {url && (
        <iframe
          ref={iframeRef}
          src={url}
          sandbox="allow-scripts allow-same-origin"
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      )}
    </div>
  );
}; 