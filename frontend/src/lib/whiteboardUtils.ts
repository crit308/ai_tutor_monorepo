import {
    Canvas,
    Object as FabricObject,
    Rect,
    Circle,
    Textbox,
    Line,
    Path,
    Group,
    Image as FabricImage,
    Pattern
} from 'fabric';
import type { CanvasObjectSpec, NodeSpec, EdgeSpec } from './types';

export function calculateAbsoluteCoords(
    spec: CanvasObjectSpec,
    canvasWidth: number,
    canvasHeight: number
): { x: number; y: number; width?: number; height?: number; metadataPctCoords?: NonNullable<CanvasObjectSpec['metadata']>['pctCoords'] } {
    let xNum: number | undefined = undefined;
    let yNum: number | undefined = undefined;
    let widthNum: number | undefined = undefined;
    let heightNum: number | undefined = undefined;

    const pctCoordsStore: NonNullable<CanvasObjectSpec['metadata']>['pctCoords'] = {};

    // Handle X coordinate
    if (spec.xPct !== undefined && spec.xPct !== null) {
        xNum = spec.xPct * canvasWidth;
        pctCoordsStore.xPct = spec.xPct;
    } else if (typeof spec.x === 'string') {
        if (spec.x.endsWith('%')) {
            const val = parseFloat(spec.x);
            if (!isNaN(val)) {
                xNum = (val / 100) * canvasWidth;
                pctCoordsStore.xPct = val / 100;
            }
        } else {
            const val = parseFloat(spec.x);
            if (!isNaN(val)) xNum = val;
        }
    } else if (typeof spec.x === 'number') {
        xNum = spec.x;
    }

    // Handle Y coordinate
    if (spec.yPct !== undefined && spec.yPct !== null) {
        yNum = spec.yPct * canvasHeight;
        pctCoordsStore.yPct = spec.yPct;
    } else if (typeof spec.y === 'string') {
        if (spec.y.endsWith('%')) {
            const val = parseFloat(spec.y);
            if (!isNaN(val)) {
                yNum = (val / 100) * canvasHeight;
                pctCoordsStore.yPct = val / 100;
            }
        } else {
            const val = parseFloat(spec.y);
            if (!isNaN(val)) yNum = val;
        }
    } else if (typeof spec.y === 'number') {
        yNum = spec.y;
    }

    // Handle Width
    if (spec.widthPct !== undefined && spec.widthPct !== null) {
        widthNum = spec.widthPct * canvasWidth;
        pctCoordsStore.widthPct = spec.widthPct;
    } else if (typeof spec.width === 'string') {
        if (spec.width.endsWith('%')) {
            const val = parseFloat(spec.width);
            if (!isNaN(val)) {
                widthNum = (val / 100) * canvasWidth;
                pctCoordsStore.widthPct = val / 100;
            }
        } else {
            const val = parseFloat(spec.width);
            if (!isNaN(val)) widthNum = val;
        }
    } else if (typeof spec.width === 'number') {
        widthNum = spec.width;
    }

    // Handle Height
    if (spec.heightPct !== undefined && spec.heightPct !== null) {
        heightNum = spec.heightPct * canvasHeight;
        pctCoordsStore.heightPct = spec.heightPct;
    } else if (typeof spec.height === 'string') {
        if (spec.height.endsWith('%')) {
            const val = parseFloat(spec.height);
            if (!isNaN(val)) {
                heightNum = (val / 100) * canvasHeight;
                pctCoordsStore.heightPct = val / 100;
            }
        } else {
            const val = parseFloat(spec.height);
            if (!isNaN(val)) heightNum = val;
        }
    } else if (typeof spec.height === 'number') {
        heightNum = spec.height;
    }

    const finalX = xNum === undefined ? 0 : xNum;
    const finalY = yNum === undefined ? 0 : yNum;
    
    const hasPctCoords = Object.keys(pctCoordsStore).length > 0;

    return {
        x: finalX,
        y: finalY,
        width: widthNum, // widthNum is already number | undefined
        height: heightNum, // heightNum is already number | undefined
        ...(hasPctCoords && { metadataPctCoords: pctCoordsStore })
    };
}

/**
 * Exports the current state of the Fabric.js canvas as an array of CanvasObjectSpec.
 * This function attempts to convert Fabric objects back into the serializable spec format.
 */
export function getCanvasStateAsSpecs(canvas: Canvas): CanvasObjectSpec[] {
    const specs: CanvasObjectSpec[] = [];
    if (!canvas) return specs;

    canvas.getObjects().forEach((obj: FabricObject) => {
        const metadata = (obj as any).metadata || {}; // Ensure metadata exists
        const id = metadata.id as string | undefined;

        if (!id) {
            console.warn("[getCanvasStateAsSpecs] Object found without metadata.id, skipping:", obj);
            return; // Skip objects without an ID in metadata
        }

        // Determine the 'kind' of the object.
        // Fabric's obj.type is the most direct, but we map it to our CanvasObjectSpec's 'kind'.
        // Custom kinds (like 'arrow', 'latex_svg') should ideally be stored in metadata.kind.
        let kind = metadata.kind || obj.type || 'unknown';
        if (obj.type === 'i-text' || obj.type === 'text') kind = 'textbox'; // Normalize Fabric text types to 'textbox'
        if (obj.type === 'image') kind = 'image';
        if (obj.type === 'group' && !metadata.kind) kind = 'group'; // if it's a fabric group and no specific metadata.kind
        
        const commonSpec: Partial<CanvasObjectSpec> = {
            id: id,
            kind: kind,
            x: obj.left,
            y: obj.top,
            width: obj.width ? obj.width * (obj.scaleX || 1) : undefined,
            height: obj.height ? obj.height * (obj.scaleY || 1) : undefined,
            fill: obj.fill instanceof Pattern ? undefined : obj.fill as string || undefined,
            stroke: obj.stroke as string || undefined,
            strokeWidth: obj.strokeWidth,
            angle: obj.angle,
            selectable: obj.selectable,
            evented: obj.evented,
            metadata: {
                id: id,
                source: metadata.source,
                groupId: metadata.groupId,
                pctCoords: metadata.pctCoords,
                latex: metadata.latex,
                layoutSpec: metadata.layoutSpec,
                ...(metadata || {}),
            },
        };

        let objectSpec: CanvasObjectSpec;

        switch (obj.type) { // Use obj.type for Fabric-specific properties
            case 'rect':
                objectSpec = { ...commonSpec, kind: 'rect' } as CanvasObjectSpec;
                break;
            case 'circle':
                const circle = obj as Circle;
                objectSpec = {
                    ...commonSpec,
                    kind: 'circle',
                    radius: circle.radius ? circle.radius * Math.max(circle.scaleX || 1, circle.scaleY || 1) : undefined,
                } as CanvasObjectSpec;
                break;
            case 'i-text':
            case 'textbox':
            case 'text':
                const textbox = obj as Textbox;
                objectSpec = {
                    ...commonSpec,
                    kind: 'textbox',
                    text: textbox.text,
                    fontSize: textbox.fontSize,
                    fontFamily: textbox.fontFamily,
                    // fill is in commonSpec, specific text properties like fontWeight, textAlign can be added if needed
                } as CanvasObjectSpec;
                break;
            case 'line':
                const line = obj as Line;
                objectSpec = {
                    ...commonSpec,
                    kind: 'line',
                    points: [line.x1!, line.y1!, line.x2!, line.y2!], // These are relative to object's origin (left, top)
                } as CanvasObjectSpec;
                break;
            case 'path':
                const path = obj as Path;
                objectSpec = {
                    ...commonSpec,
                    kind: 'path',
                    points: path.path ? path.path.map((p: Array<string | number>) => p.join(' ')).join(' ') : undefined,
                } as CanvasObjectSpec;
                break;
            case 'image':
                const image = obj as FabricImage;
                objectSpec = {
                    ...commonSpec,
                    kind: 'image',
                    src: image.getSrc(),
                } as CanvasObjectSpec;
                break;
            case 'group':
                const group = obj as Group;
                objectSpec = {
                    ...commonSpec,
                    kind: commonSpec.kind, // This should be 'group' or metadata.kind if set
                    objects: group.getObjects().map(groupObj => getCanvasStateAsSpecs({ getObjects: () => [groupObj] } as any)[0]).filter(s => s),
                    // The above is a recursive call. It might need a more direct conversion or careful handling
                    // of relative vs absolute positioning of child objects if they are to be reconstructed flatly.
                    // For now, it tries to convert each child object back to a spec.
                } as CanvasObjectSpec;
                break;
            default:
                console.warn(`[getCanvasStateAsSpecs] Unhandled Fabric object type: ${obj.type} for ID: ${id}. Using common spec.`);
                objectSpec = commonSpec as CanvasObjectSpec;
                if (!objectSpec.kind) objectSpec.kind = 'unknown';
        }

        // Restore percentage-based dimensions if they were stored in metadata
        if (commonSpec.metadata?.pctCoords) {
            objectSpec.xPct = commonSpec.metadata.pctCoords.xPct;
            objectSpec.yPct = commonSpec.metadata.pctCoords.yPct;
            objectSpec.widthPct = commonSpec.metadata.pctCoords.widthPct;
            objectSpec.heightPct = commonSpec.metadata.pctCoords.heightPct;
        }
        if (commonSpec.metadata?.groupId) {
            objectSpec.groupId = commonSpec.metadata.groupId;
        }

        specs.push(objectSpec);
    });

    return specs;
}

export async function renderLatexToSvg(latexString: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/katexWorker.ts', import.meta.url), {
      type: 'module'
    });

    const uniqueId = `katex-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.id === uniqueId) {
        worker.removeEventListener('message', handleMessage); // Clean up listener
        worker.terminate(); // Terminate worker after use
        if (event.data.type === 'RENDER_RESULT') {
          if (event.data.error) {
            console.error('KaTeX rendering error:', event.data.error);
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.svg);
          }
        } else {
          // Should not happen if worker logic is correct
          reject(new Error('Unexpected message from KaTeX worker'));
        }
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', (err) => {
        console.error('KaTeX worker error:', err);
        worker.removeEventListener('message', handleMessage); // Clean up listener
        worker.terminate(); // Terminate worker
        reject(new Error(`Worker error: ${err.message}`));
    });

    worker.postMessage({ type: 'RENDER_LATEX', latex: latexString, id: uniqueId });
  });
}

export async function getGraphLayout(
  nodes: NodeSpec[], 
  edges: EdgeSpec[], 
  layoutType: string = 'layered' // Default layout type
): Promise<{ [nodeId: string]: { x: number; y: number } }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/layoutWorker.ts', import.meta.url), {
      type: 'module'
    });

    const uniqueId = `layout-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.id === uniqueId) {
        worker.removeEventListener('message', handleMessage); // Clean up listener
        worker.terminate(); // Terminate worker after use
        if (event.data.type === 'LAYOUT_RESULT') {
          if (event.data.error) {
            console.error('Layout worker error:', event.data.error);
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.positions);
          }
        } else {
          reject(new Error('Unexpected message from layout worker'));
        }
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', (err) => {
      console.error('Layout worker instance error:', err);
      worker.removeEventListener('message', handleMessage); // Clean up listener
      worker.terminate(); // Terminate worker
      reject(new Error(`Layout Worker error: ${err.message}`));
    });

    worker.postMessage({ 
      type: 'LAYOUT_GRAPH', 
      nodes, 
      edges, 
      layoutType, 
      id: uniqueId 
    });
  });
} 