import type { WhiteboardPatch, WBObject, ValidationIssue } from "@aitutor/whiteboard-schema";

/** Hex color regex */
const HEX_RE = /^#([0-9A-Fa-f]{3}){1,2}$/;

export function validateWhiteboardPatch(
  patch: WhiteboardPatch,
  existing: WBObject[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ---------- structural checks ----------
  if (patch.updates) {
    for (const upd of patch.updates) {
      if (!upd.id) {
        issues.push({ level: "error", message: "Update is missing id field." });
      }
      if (!upd.diff || Object.keys(upd.diff).length === 0) {
        issues.push({ level: "error", message: `Update for ${upd.id} has empty diff.`, objectId: upd.id });
      }
      const exists = existing.find((o) => o.id === upd.id);
      if (!exists) {
        issues.push({ level: "error", message: `Updated object ${upd.id} not found on board.`, objectId: upd.id });
      }
    }
  }

  if (patch.creates) {
    const idSet = new Set<string>();
    for (const obj of patch.creates) {
      if (!obj.id || !obj.kind) {
        issues.push({ level: "error", message: "Created object missing id or kind." });
      }
      if (idSet.has(obj.id)) {
        issues.push({ level: "error", message: `Duplicate id ${obj.id} in creates[].`, objectId: obj.id });
      }
      idSet.add(obj.id);
    }
  }

  // ---------- style checks ----------
  const checkColor = (color?: string, field?: string, objectId?: string) => {
    if (color && !HEX_RE.test(color)) {
      issues.push({ level: "warning", message: `Invalid color format in ${field}: ${color}`, objectId });
    }
  };
  if (patch.creates) {
    patch.creates.forEach((obj) => {
      // @ts-ignore – narrow kinds
      checkColor((obj as any).fill, "fill", obj.id);
      // @ts-ignore
      checkColor((obj as any).stroke, "stroke", obj.id);
    });
  }
  if (patch.updates) {
    patch.updates.forEach((upd) => {
      const diff = upd.diff as any;
      checkColor(diff.fill, "fill", upd.id);
      checkColor(diff.stroke, "stroke", upd.id);
    });
  }

  // ---------- simple geometry ----------
  // Example: warn if text object ends up outside its container rect.
  // We look for diff.x/y or creates new text with metadata.containerId
  const objsById = new Map<string, WBObject>();
  existing.forEach((o) => objsById.set(o.id, o));
  patch.creates?.forEach((o) => objsById.set(o.id, o));

  // Only run a trivial check: if text metadata.containerId is defined, ensure container exists.
  objsById.forEach((obj) => {
    if (obj.kind === "text" && obj.metadata?.containerId) {
      const container = objsById.get(obj.metadata.containerId);
      if (!container) {
        issues.push({ level: "warning", message: `Text '${obj.id}' references missing container '${obj.metadata.containerId}'.`, objectId: obj.id });
      }
    }
  });

  return issues;
} 