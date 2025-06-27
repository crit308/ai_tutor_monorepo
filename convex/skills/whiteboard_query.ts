import { query } from "../_generated/server";
import { v } from "convex/values";
import type { WBObject } from "@aitutor/whiteboard-schema";

export const getWhiteboardSummary = query({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", q => q.eq("session_id", sessionId))
      .collect();

    const objs: WBObject[] = rows.map(r => JSON.parse(r.object_spec));
    const byKind: Record<string, number> = {};
    const texts: string[] = [];
    for (const o of objs) {
      byKind[o.kind] = (byKind[o.kind] || 0) + 1;
      if (o.kind === "text") {
        // @ts-ignore
        const t = (o as any).text;
        if (t) texts.push(t);
      }
    }
    const kinds = Object.entries(byKind).map(([k,n])=>`${n} ${k}${n>1?"s":""}`).join(", ");
    let summary = kinds ? `Board has ${kinds}.` : "Board empty.";
    if (texts.length) summary += ` Texts: "${texts.join(" | ")}".`;
    return summary;
  }
});

export const getEnhancedWhiteboardSummary = query({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", q => q.eq("session_id", sessionId))
      .collect();

    if (rows.length === 0) {
      return "Whiteboard is empty.";
    }

    const objs: WBObject[] = rows.map(r => JSON.parse(r.object_spec));
    
    // Organize by semantic groups
    const groupedObjects: Record<string, WBObject[]> = {};
    const ungroupedObjects: WBObject[] = [];
    
    for (const obj of objs) {
      const groupId = obj.metadata?.groupId;
      if (groupId) {
        if (!groupedObjects[groupId]) {
          groupedObjects[groupId] = [];
        }
        groupedObjects[groupId].push(obj);
      } else {
        ungroupedObjects.push(obj);
      }
    }

    // Build enhanced summary
    let summary = `Whiteboard Layout Analysis:\n\n`;
    
    // Analyze grouped objects (concepts/explanations)
    if (Object.keys(groupedObjects).length > 0) {
      summary += `Concept Groups:\n`;
      for (const [groupId, groupObjs] of Object.entries(groupedObjects)) {
        const concept = groupObjs[0]?.metadata?.concept || groupId;
        const bbox = calculateBoundingBoxSVG(groupObjs);
        const description = describeGroup(groupObjs, concept);
        summary += `- ${concept}: ${description} (positioned ${describePosition(bbox)})\n`;
      }
      summary += `\n`;
    }

    // Analyze spatial relationships
    const relationships = analyzeRelationships(objs);
    if (relationships.length > 0) {
      summary += `Spatial Relationships:\n`;
      relationships.forEach(rel => {
        summary += `- ${rel}\n`;
      });
      summary += `\n`;
    }

    // Overall layout assessment
    const layoutAssessment = assessLayout(objs);
    summary += `Layout Assessment:\n${layoutAssessment}`;

    return summary;
  }
});

export const getWhiteboardAsSVG = query({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("whiteboard_objects")
      .withIndex("by_session", q => q.eq("session_id", sessionId))
      .collect();

    if (rows.length === 0) {
      return "<!-- Empty whiteboard -->";
    }

    const objs: WBObject[] = rows.map(r => JSON.parse(r.object_spec));
    
    // Calculate viewBox to fit all objects
    const bbox = calculateBoundingBoxSVG(objs);
    const padding = 50;
    const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`;
    
    // Start SVG
    let svg = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n`;
    
    // Add definitions for arrow markers
    svg += `  <defs>\n`;
    svg += `    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">\n`;
    svg += `      <path d="M0,0 L0,6 L9,3 z" fill="#000"/>\n`;
    svg += `    </marker>\n`;
    svg += `  </defs>\n\n`;
    
    // Group objects by concept/groupId for better organization
    const grouped = groupObjectsByMetadata(objs);
    
    // Render grouped objects
    for (const [groupName, groupObjs] of Object.entries(grouped.groups)) {
      svg += `  <!-- Group: ${groupName} -->\n`;
      svg += `  <g data-group="${groupName}">\n`;
      for (const obj of groupObjs) {
        svg += `    ${renderObjectToSVG(obj)}\n`;
      }
      svg += `  </g>\n\n`;
    }
    
    // Render ungrouped objects
    if (grouped.ungrouped.length > 0) {
      svg += `  <!-- Ungrouped objects -->\n`;
      for (const obj of grouped.ungrouped) {
        svg += `  ${renderObjectToSVG(obj)}\n`;
      }
    }
    
    svg += `</svg>`;
    
    return svg;
  }
});

// Helper function to calculate bounding box for SVG
function calculateBoundingBoxSVG(objects: WBObject[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const obj of objects) {
    let x = 0, y = 0, width = 0, height = 0;
    
    if (obj.kind === "rect") {
      x = obj.x;
      y = obj.y;
      width = obj.width;
      height = obj.height;
    } else if (obj.kind === "ellipse") {
      x = obj.x - obj.rx;
      y = obj.y - obj.ry;
      width = obj.rx * 2;
      height = obj.ry * 2;
    } else if (obj.kind === "text") {
      x = obj.x;
      y = obj.y;
      width = (obj.text?.length || 0) * (obj.fontSize || 12) * 0.6; // rough estimate
      height = obj.fontSize || 12;
    } else if (obj.kind === "line") {
      const points = obj.points;
      for (let i = 0; i < points.length; i += 2) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        if (i + 1 < points.length) {
          minY = Math.min(minY, points[i + 1]);
          maxY = Math.max(maxY, points[i + 1]);
        }
      }
      continue;
    }
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Helper function to group objects by metadata
function groupObjectsByMetadata(objects: WBObject[]) {
  const groups: Record<string, WBObject[]> = {};
  const ungrouped: WBObject[] = [];
  
  for (const obj of objects) {
    const groupId = obj.metadata?.groupId || obj.metadata?.concept;
    if (groupId) {
      if (!groups[groupId]) {
        groups[groupId] = [];
      }
      groups[groupId].push(obj);
    } else {
      ungrouped.push(obj);
    }
  }
  
  return { groups, ungrouped };
}

// Helper function to render a single WBObject as SVG
function renderObjectToSVG(obj: WBObject): string {
  const metadataComment = obj.metadata ? `<!-- metadata: ${JSON.stringify(obj.metadata)} -->` : '';
  
  switch (obj.kind) {
    case "rect":
      return `${metadataComment}<rect id="${obj.id}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" ${getStyleAttributes(obj)} />`;
    
    case "ellipse":
      return `${metadataComment}<ellipse id="${obj.id}" cx="${obj.x}" cy="${obj.y}" rx="${obj.rx}" ry="${obj.ry}" ${getStyleAttributes(obj)} />`;
    
    case "text":
      const textAnchor = obj.textAnchor || "start";
      const fontSize = obj.fontSize || 16;
      return `${metadataComment}<text id="${obj.id}" x="${obj.x}" y="${obj.y}" text-anchor="${textAnchor}" font-size="${fontSize}" ${getStyleAttributes(obj)}>${escapeXml(obj.text)}</text>`;
    
    case "line":
      const points = obj.points;
      const pointsStr = points.reduce((acc, val, i) => {
        return i % 2 === 0 ? `${acc}${acc ? ' ' : ''}${val}` : `${acc},${val}`;
      }, '');
      const markerEnd = obj.markerEnd === "arrow" ? 'marker-end="url(#arrow)"' : '';
      return `${metadataComment}<polyline id="${obj.id}" points="${pointsStr}" fill="none" ${markerEnd} ${getStyleAttributes(obj)} />`;
    
    case "path":
      return `${metadataComment}<path id="${obj.id}" d="${obj.d}" ${getStyleAttributes(obj)} />`;
    
    default:
      return `${metadataComment}<!-- Unknown object type: ${(obj as any).kind} -->`;
  }
}

// Helper function to get style attributes for SVG elements
function getStyleAttributes(obj: any): string {
  const attrs: string[] = [];
  
  if (obj.fill !== undefined) attrs.push(`fill="${obj.fill}"`);
  if (obj.stroke !== undefined) attrs.push(`stroke="${obj.stroke}"`);
  if (obj.strokeWidth !== undefined) attrs.push(`stroke-width="${obj.strokeWidth}"`);
  
  return attrs.join(' ');
}

// Helper function to escape XML content
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function describePosition(bbox: { x: number; y: number; width: number; height: number }) {
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;
  
  let horizontal = "center";
  if (centerX < 300) horizontal = "left";
  else if (centerX > 700) horizontal = "right";
  
  let vertical = "middle";
  if (centerY < 200) vertical = "top";
  else if (centerY > 400) vertical = "bottom";
  
  if (horizontal === "center" && vertical === "middle") return "center";
  if (horizontal === "center") return vertical;
  if (vertical === "middle") return horizontal;
  return `${vertical}-${horizontal}`;
}

function describeGroup(objects: WBObject[], concept: string): string {
  const byKind: Record<string, number> = {};
  const texts: string[] = [];
  
  for (const obj of objects) {
    byKind[obj.kind] = (byKind[obj.kind] || 0) + 1;
    if (obj.kind === "text" && (obj as any).text) {
      texts.push((obj as any).text);
    }
  }
  
  const kindDesc = Object.entries(byKind).map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`).join(", ");
  const textDesc = texts.length > 0 ? ` with text "${texts.join(", ")}"` : "";
  
  return `${kindDesc}${textDesc}`;
}

function analyzeRelationships(objects: WBObject[]): string[] {
  const relationships: string[] = [];
  
  // Find arrows and their connections
  const arrows = objects.filter(obj => obj.kind === "line" && (obj as any).markerEnd === "arrow");
  for (const arrow of arrows) {
    const points = (arrow as any).points;
    if (points.length >= 4) {
      const start = { x: points[0], y: points[1] };
      const end = { x: points[points.length - 2], y: points[points.length - 1] };
      
      const sourceObj = findNearestObject(start, objects.filter(o => o.id !== arrow.id));
      const targetObj = findNearestObject(end, objects.filter(o => o.id !== arrow.id));
      
      if (sourceObj && targetObj) {
        const sourceName = getObjectLabel(sourceObj);
        const targetName = getObjectLabel(targetObj);
        relationships.push(`Arrow connects ${sourceName} to ${targetName}`);
      }
    }
  }
  
  // Find vertically or horizontally aligned objects
  const positions = objects.map(obj => ({ obj, ...getObjectCenter(obj) }));
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const pos1 = positions[i];
      const pos2 = positions[j];
      
      if (Math.abs(pos1.y - pos2.y) < 20) { // horizontally aligned
        const left = pos1.x < pos2.x ? pos1 : pos2;
        const right = pos1.x < pos2.x ? pos2 : pos1;
        relationships.push(`${getObjectLabel(left.obj)} and ${getObjectLabel(right.obj)} are horizontally aligned`);
      } else if (Math.abs(pos1.x - pos2.x) < 20) { // vertically aligned
        const top = pos1.y < pos2.y ? pos1 : pos2;
        const bottom = pos1.y < pos2.y ? pos2 : pos1;
        relationships.push(`${getObjectLabel(top.obj)} and ${getObjectLabel(bottom.obj)} are vertically aligned`);
      }
    }
  }
  
  return relationships.slice(0, 5); // Limit to avoid overwhelming output
}

function findNearestObject(point: { x: number; y: number }, objects: WBObject[]): WBObject | null {
  let nearest: WBObject | null = null;
  let minDistance = Infinity;
  
  for (const obj of objects) {
    const center = getObjectCenter(obj);
    const distance = Math.sqrt(Math.pow(center.x - point.x, 2) + Math.pow(center.y - point.y, 2));
    if (distance < minDistance && distance < 50) { // Within 50 pixels
      minDistance = distance;
      nearest = obj;
    }
  }
  
  return nearest;
}

function getObjectCenter(obj: WBObject): { x: number; y: number } {
  if (obj.kind === "rect") {
    return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
  } else if (obj.kind === "ellipse") {
    return { x: obj.x, y: obj.y };
  } else if (obj.kind === "text") {
    return { x: obj.x, y: obj.y };
  } else if (obj.kind === "line") {
    const points = obj.points;
    const midIndex = Math.floor(points.length / 4) * 2;
    return { x: points[midIndex], y: points[midIndex + 1] };
  }
  return { x: 0, y: 0 };
}

function getObjectLabel(obj: WBObject): string {
  if (obj.kind === "text" && (obj as any).text) {
    return `"${(obj as any).text}"`;
  }
  
  const role = obj.metadata?.role;
  if (role) {
    return `${obj.kind} (${role})`;
  }
  
  return obj.kind;
}

function assessLayout(objects: WBObject[]): string {
  if (objects.length === 0) return "No objects to assess.";
  
  const assessments: string[] = [];
  
  // Check if objects are spread across the canvas
  const bbox = calculateBoundingBoxSVG(objects);
  if (bbox.width > 600 && bbox.height > 300) {
    assessments.push("Objects are well-distributed across the canvas");
  } else if (bbox.width < 200 || bbox.height < 100) {
    assessments.push("Objects are clustered in a small area - consider spreading them out");
  }
  
  // Check for text readability
  const textObjects = objects.filter(obj => obj.kind === "text");
  if (textObjects.length > 0) {
    assessments.push(`Contains ${textObjects.length} text element${textObjects.length > 1 ? "s" : ""} for labeling`);
  } else {
    assessments.push("No text labels - consider adding labels for clarity");
  }
  
  // Check for visual flow (arrows)
  const arrows = objects.filter(obj => obj.kind === "line" && (obj as any).markerEnd === "arrow");
  if (arrows.length > 0) {
    assessments.push(`Uses ${arrows.length} arrow${arrows.length > 1 ? "s" : ""} to show relationships/flow`);
  }
  
  return assessments.join(". ");
} 