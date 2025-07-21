import React from "react";
import { useSandbox } from "@/hooks/useSandbox";
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "convex_generated/api";

interface Props {
  sessionId: string;
  className?: string;
}

export const SandboxWhiteboard: React.FC<Props> = ({ sessionId, className }) => {
  const { url, status, iframeRef, retry } = useSandbox(sessionId);

  // Fetch latest snapshots (limit 50) from Convex
  const snapshots = useQuery(api.database.whiteboard.getWhiteboardSnapshots as any, sessionId ? { sessionId, limit: 50 } : "skip") || [];

  const latestIndex = snapshots.length > 0 ? snapshots[0].snapshotIndex : -1;

  const [snapshotIdx, setSnapshotIdx] = useState<number>(-1); // -1 => live

  // When snapshots list updates, reset slider to live
  useEffect(() => { setSnapshotIdx(-1); }, [latestIndex]);

  // Send jump message when snapshotIdx changes (and iframe ready)
  useEffect(() => {
    if (!url || status !== "ready" || !iframeRef.current) return;
    if (snapshotIdx === -1) {
      // Return to live (trigger board refresh by changing boardId no-op)
      iframeRef.current.contentWindow?.postMessage({ ns:"ai-tutor/wb", v:1, type:"command", payload:{ action:"historyLive" } }, "*");
      return;
    }
    const snap = snapshots.find((s) => s.snapshotIndex === snapshotIdx);
    if (!snap) return;
    iframeRef.current.contentWindow?.postMessage({ ns:"ai-tutor/wb", v:1, type:"jump", payload:{ index:snapshotIdx, objects:snap.objects } }, "*");
  }, [snapshotIdx, url, status, snapshots, iframeRef]);

  const [boardId, setBoardId] = useState(0);

  // Send changeBoard message when boardId changes and iframe ready
  useEffect(() => {
    if (!url || status !== "ready" || !iframeRef.current) return;
    try {
      iframeRef.current.contentWindow?.postMessage(
        {
          ns: "ai-tutor/wb",
          v: 1,
          type: "command",
          payload: { action: "changeBoard", boardId },
        },
        "*",
      );
    } catch {}
  }, [boardId, url, status, iframeRef]);

  const prevBoard = useCallback(() => setBoardId((id) => Math.max(0, id - 1)), []);
  const nextBoard = useCallback(() => setBoardId((id) => id + 1), []);

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
      {/* Board pager controls */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 20, display: "flex", gap: 4 }}>
        <button
          className="px-2 py-1 rounded bg-muted text-foreground disabled:opacity-50"
          onClick={prevBoard}
          disabled={boardId === 0}
        >Prev</button>
        <span className="px-2 py-1 text-sm bg-background border rounded">{boardId + 1}</span>
        <button
          className="px-2 py-1 rounded bg-muted text-foreground"
          onClick={nextBoard}
        >Next</button>
      </div>
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
      {/* Snapshot slider */}
      {snapshots.length > 0 && (
        <div style={{ position:"absolute", bottom:8, left:"50%", transform:"translateX(-50%)", zIndex:20, display:"flex", alignItems:"center", gap:8 }}>
          <input
            type="range"
            min={-1}
            max={latestIndex}
            value={snapshotIdx}
            onChange={(e)=>setSnapshotIdx(parseInt(e.target.value))}
            style={{ width:200 }}
          />
          <span className="text-xs">{ snapshotIdx === -1 ? "Live" : `Snapshot ${snapshotIdx}` }</span>
        </div>
      )}
    </div>
  );
}; 