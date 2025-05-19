// @ts-nocheck
// eslint-disable

import * as fabric from 'fabric';
import { Rect, Circle, Textbox, Line, Path, Group, Image as FabricImage, Object as FabricObject, Canvas, Pattern, Polygon, Triangle } from 'fabric';
import type { CanvasObjectSpec, Metadata as NewMetadata } from '@/types';
import { calculateAbsoluteCoords } from './whiteboardUtils';

// Re-add module augmentation for metadata property
declare module 'fabric' {
    namespace fabric {
        interface Object {
            id?: string;
            metadata?: NewMetadata & {
                pctCoords?: { xPct?: number; yPct?: number; widthPct?: number; heightPct?: number };
                [key: string]: any 
            };
        }
    }
}

/**
 * Internal helper to create synchronous objects without adding them to canvas.
 */
function createFabricObjectInternal(spec: CanvasObjectSpec, canvas?: Canvas): FabricObject | null {
    let fabricObject: FabricObject | null = null;
    
    // Calculate absolute coordinates if percentage coordinates are provided
    // Requires canvas dimensions. If canvas is not available, percent coords cannot be resolved yet.
    let coords = { x: spec.x, y: spec.y, width: spec.width, height: spec.height };
    let pctCoordsMetadata: NonNullable<FabricObject['metadata']>['pctCoords'] | undefined = undefined;

    if (canvas && (spec.xPct !== undefined || spec.yPct !== undefined || spec.widthPct !== undefined || spec.heightPct !== undefined)) {
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        const abs = calculateAbsoluteCoords(spec, canvasWidth, canvasHeight);
        coords = { x: abs.x, y: abs.y, width: abs.width, height: abs.height };
        pctCoordsMetadata = abs.metadataPctCoords as NonNullable<FabricObject['metadata']>['pctCoords'];
    }
    
    // --- START: ANCHOR LOGIC MOVED HERE ---
    let rp: any | undefined;
    if (spec.metadata && (spec.metadata as any).relativePlacement) {
        rp = (spec.metadata as any).relativePlacement;
    }
    if (!rp && (spec as any).anchor) { // Back-compat for top-level 'anchor'
        const a = (spec as any).anchor;
        rp = {
            anchorObjectId: a.object_id || a.objectId,
            anchor_object_id: a.object_id || a.objectId,
            anchorEdge: a.anchor_edge || a.anchorEdge,
            objectEdge: a.object_edge || a.objectEdge,
            anchor_edge_x: a.anchor_edge_x,
            anchor_edge_y: a.anchor_edge_y,
            object_edge_x: a.object_edge_x,
            object_edge_y: a.object_edge_y,
            offset_x_pct: a.offset_x_pct,
            offset_y_pct: a.offset_y_pct,
            align_y: a.align_y,
            align_x: a.align_x,
        };
    }

    if (rp && canvas) { // Ensure canvas is available for anchor lookup & coord calculation
      const anchorId: string | undefined = rp.anchorObjectId || rp.anchor_object_id;
      console.log(`[FabricFactory] Anchoring ${spec.id} to ${anchorId}. RelativePlacement data:`, JSON.parse(JSON.stringify(rp)));

      if (anchorId) {
        const anchorObj = canvas.getObjects().find(o => o.metadata?.id === anchorId);
        if (anchorObj) {
          console.log(`[FabricFactory] Found anchorObj ${anchorId} for ${spec.id}.`);
          // @ts-ignore - fabric typings may not include boolean arg
          const rect = anchorObj.getBoundingRect(true);
          const ancLeft = rect.left;
          const ancTop = rect.top;
          const ancWidth = rect.width;
          const ancHeight = rect.height;
          console.log(`[FabricFactory] Anchor ${anchorId} dims: left=${ancLeft}, top=${ancTop}, width=${ancWidth}, height=${ancHeight}`);

          const cWidth = canvas.getWidth();
          const cHeight = canvas.getHeight();
          console.log(`[FabricFactory] Canvas dimensions for ${spec.id} anchoring: cWidth=${cWidth}, cHeight=${cHeight}`);

          let objWidth: number = coords.width ?? 50; // Use already potentially resolved width
          let objHeight: number = coords.height ?? 50; // Use already potentially resolved height
          
          // If original spec had Pct for width/height, ensure they are used if absolute not resolved
          if (typeof spec.widthPct === 'number' && coords.width === undefined) objWidth = spec.widthPct * cWidth;
          if (typeof spec.heightPct === 'number' && coords.height === undefined) objHeight = spec.heightPct * cHeight;


          const aEdgeX: string = rp.anchorEdge || rp.anchor_edge || rp.anchor_edge_x || 'right';
          const aEdgeY: string = rp.anchorEdge || rp.anchor_edge || rp.anchor_edge_y || 'top';

          let anchorX = ancLeft;
          if (aEdgeX === 'center_x' || aEdgeX === 'center') anchorX = ancLeft + ancWidth / 2;
          else if (aEdgeX === 'right') anchorX = ancLeft + ancWidth;

          let anchorY = ancTop;
          if (aEdgeY === 'center_y' || aEdgeY === 'middle') anchorY = ancTop + ancHeight / 2;
          else if (aEdgeY === 'bottom') anchorY = ancTop + ancHeight;

          const oEdgeX: string = rp.objectEdge || rp.object_edge || rp.object_edge_x || 'left';
          const oEdgeY: string = rp.objectEdge || rp.object_edge || rp.object_edge_y || 'top';

          let objOffsetX = 0;
          if (oEdgeX === 'center_x' || oEdgeX === 'center') objOffsetX = objWidth / 2;
          else if (oEdgeX === 'right') objOffsetX = objWidth;

          let objOffsetY = 0;
          if (oEdgeY === 'center_y' || oEdgeY === 'middle') objOffsetY = objHeight / 2;
          else if (oEdgeY === 'bottom') objOffsetY = objHeight;

          const offsetXPct: number = rp.offsetXPercent ?? rp.offset_x_pct ?? 0;
          const offsetYPct: number = rp.offsetYPercent ?? rp.offset_y_pct ?? 0;
          console.log(`[FabricFactory] For ${spec.id}: offsetXPct=${offsetXPct} (from rp.offset_x_pct=${rp.offset_x_pct}), offsetYPct=${offsetYPct} (from rp.offset_y_pct=${rp.offset_y_pct})`);

          coords.x = anchorX + offsetXPct * cWidth - objOffsetX;
          coords.y = anchorY + offsetYPct * cHeight - objOffsetY;
          console.log(`[FabricFactory] For ${spec.id}: final calculated coords: x=${coords.x}, y=${coords.y}`);
          coords.width = objWidth; // Ensure width is set after potential calculation
          coords.height = objHeight; // Ensure height is set

          // Since we've calculated absolute, remove any percentage helpers from the original spec
          // that might have been used by calculateAbsoluteCoords if not for anchoring
          delete (spec as any).xPct;
          delete (spec as any).yPct;
          // We keep spec.widthPct/heightPct as they might be used for the object's own sizing,
          // but coords.width/height now hold the determined absolute size for placement.
          // The `pctCoordsMetadata` would have captured original xPct/yPct if they existed.

        } else {
          console.warn(`[FabricFactory] Anchor object NOT FOUND for relativePlacement during object creation: ${anchorId}. Anchored object: ${spec.id}. Current canvas objects:`, canvas.getObjects().map(o => o.metadata?.id));
        }
      }
    }
    // --- END: ANCHOR LOGIC MOVED HERE ---
    
    const metadataForFabricObject: FabricObject['metadata'] = {
        id: spec.id,
        ...(spec.metadata || {}),
        ...(pctCoordsMetadata && { pctCoords: pctCoordsMetadata }),
    };
    if (!metadataForFabricObject.source) {
        metadataForFabricObject.source = 'assistant';
    }

    // --- Normalize style shortcuts (style.fill -> fill, etc.) ---
    if (spec.style) {
        const s: any = spec.style;
        if (spec.fill === undefined && s.fill !== undefined) spec.fill = s.fill;
        if (spec.stroke === undefined && s.stroke !== undefined) spec.stroke = s.stroke;
        if (spec.strokeWidth === undefined && s.strokeWidth !== undefined) spec.strokeWidth = s.strokeWidth;
    }

    const baseOptions = {
      left: coords.x,
      top: coords.y,
      fill: spec.fill,
      stroke: spec.stroke,
      strokeWidth: spec.strokeWidth,
      angle: spec.angle ?? 0,
      selectable: spec.selectable ?? !(['option_selector', 'option_label'].includes(spec.metadata?.role ?? '')),
      evented: spec.evented ?? (['option_selector', 'option_label'].includes(spec.metadata?.role ?? '') ? true : false),
      originX: 'left' as const,
      originY: 'top' as const,
    };

    try {
        switch (spec.kind) {
            case 'rect':
                fabricObject = new Rect({
                    ...baseOptions,
                    width: coords.width ?? 50,
                    height: coords.height ?? 50,
                    fill: spec.fill ?? 'transparent',
                    stroke: spec.stroke ?? 'black',
                    strokeWidth: spec.strokeWidth ?? 1,
                });
                break;
            case 'ellipse': {
                // Compute rx, ry
                let rx = spec.rx;
                let ry = spec.ry;
                if (canvas) {
                    if (rx === undefined && spec.rxPct !== undefined) {
                        rx = spec.rxPct * canvas.getWidth();
                    }
                    if (ry === undefined && spec.ryPct !== undefined) {
                        ry = spec.ryPct * canvas.getHeight();
                    }
                }
                // If coords.width/height (absolute) available use them when rx/ry still undefined
                if ((rx === undefined || ry === undefined) && coords.width !== undefined && coords.height !== undefined) {
                    rx = rx ?? coords.width / 2;
                    ry = ry ?? coords.height / 2;
                }
                // Fallback if only radius provided (treat as circle-like)
                if (rx === undefined && ry === undefined && spec.radius !== undefined) {
                    rx = ry = spec.radius;
                }
                rx = rx ?? 30;
                ry = ry ?? rx; // default circle if ry missing

                fabricObject = new fabric.Ellipse({
                    ...baseOptions,
                    rx,
                    ry,
                    fill: spec.fill ?? 'transparent',
                    stroke: spec.stroke ?? 'black',
                    strokeWidth: spec.strokeWidth ?? 1,
                    evented: spec.evented ?? true,
                } as any);
                break;
            }
            case 'circle': {
                let radiusVal = spec.radius;
                if (canvas && radiusVal === undefined) {
                    if (spec.rxPct !== undefined) {
                        radiusVal = spec.rxPct * canvas.getWidth();
                    } else if (spec.widthPct !== undefined) {
                        radiusVal = (spec.widthPct * canvas.getWidth()) / 2;
                    }
                }
                radiusVal = radiusVal ?? 25;
                fabricObject = new Circle({
                    ...baseOptions,
                    radius: radiusVal,
                    fill: spec.fill ?? 'transparent',
                    stroke: spec.stroke ?? 'black',
                    strokeWidth: spec.strokeWidth ?? 1,
                    evented: spec.evented ?? true,
                });
                break;
            }
            case 'textbox':
                fabricObject = new Textbox(spec.text ?? 'Text', {
                    ...baseOptions,
                    width: coords.width ?? (canvas ? canvas.getWidth() * 0.85 : 250),
                    ...(coords.height !== undefined && { height: coords.height }),
                    fontSize: spec.fontSize ?? 16,
                    fontFamily: spec.fontFamily ?? 'Arial',
                    fill: spec.fill ?? 'black',
                    strokeWidth: spec.strokeWidth ?? 0,
                    stroke: undefined,
                    editable: spec.editable ?? false,
                    hasControls: spec.hasControls ?? false,
                    hasBorders: spec.hasBorders ?? false,
                    visible: false,
                });
                break;
            case 'text':
                // Treat plain text as a textbox for simplicity
                fabricObject = new Textbox(spec.text ?? 'Text', {
                    ...baseOptions,
                    width: coords.width ?? (canvas ? canvas.getWidth() * 0.85 : 250),
                    fontSize: spec.fontSize ?? 18,
                    fontFamily: spec.fontFamily ?? 'Arial',
                    fill: spec.fill ?? 'black',
                    strokeWidth: 0,
                    stroke: undefined,
                    selectable: spec.selectable ?? true,
                    editable: spec.editable ?? false,
                    hasControls: spec.hasControls ?? false,
                    hasBorders: spec.hasBorders ?? false,
                    visible: false,
                });
                break;
            case 'line': { 
                let linePoints: [number, number, number, number] = [0, 0, 50, 50];
                if (Array.isArray(spec.points)) {
                    if (spec.points.length === 4 && typeof spec.points[0] === 'number') {
                         linePoints = spec.points as [number, number, number, number];
                     } else if (spec.points.length === 2 && typeof spec.points[0] === 'object' && spec.points[0] !== null && 'x' in spec.points[0]) {
                         const p1 = spec.points[0] as { x: number; y: number };
                         const p2 = spec.points[1] as { x: number; y: number };
                         linePoints = [p1.x, p1.y, p2.x, p2.y];
                     }
                }
                fabricObject = new Line(linePoints, {
                  stroke: spec.stroke ?? 'black',
                  strokeWidth: spec.strokeWidth ?? 2,
                  angle: spec.angle ?? 0,
                  left: coords.x,
                  top: coords.y,
                  selectable: spec.selectable ?? true,
                  evented: spec.evented ?? false,
                });
                break;
            }
            case 'path': { 
                 if (typeof spec.points !== 'string') {
                     console.error(`[InternalFactory] Path requires string points, got:`, spec.points);
                     return null;
                 }
                 fabricObject = new Path(spec.points, {
                   ...baseOptions,
                   fill: spec.fill,
                   stroke: spec.stroke ?? 'black',
                   strokeWidth: spec.strokeWidth ?? 1,
                 });
                 break;
            }
            case 'highlight_stroke': {
                 if (typeof spec.points !== 'string') {
                     console.error(`[InternalFactory] highlight_stroke requires string points, got:`, spec.points);
                     return null;
                 }
                 fabricObject = new Path(spec.points, {
                     ...baseOptions,
                     fill: undefined,
                     stroke: spec.stroke ?? 'rgba(255, 255, 0, 0.6)',
                     strokeWidth: spec.strokeWidth ?? 12,
                     globalCompositeOperation: 'multiply', // So highlight blends
                     selectable: false,
                     evented: false,
                 } as any);
                 break;
            }
            case 'question_tag': {
                 // Create a small circle with '?' text centered
                 const radius = spec.radius ?? 12;
                 const circle = new Circle({
                     left: 0,
                     top: 0,
                     radius,
                     fill: spec.fill ?? '#FFD966',
                     stroke: spec.stroke ?? '#CC9900',
                     strokeWidth: spec.strokeWidth ?? 2,
                     selectable: false,
                     evented: false,
                 });
                 const label = new Textbox('?', {
                     left: radius,
                     top: radius,
                     fontSize: spec.fontSize ?? 18,
                     fontFamily: 'Arial',
                     fill: '#000000',
                     originX: 'center',
                     originY: 'center',
                     selectable: false,
                     evented: false,
                 });
                 const group = new Group([circle, label], {
                     ...baseOptions,
                     selectable: false,
                     evented: false,
                 });
                 fabricObject = group;
                 break;
            }
            case 'pointer_ping': {
                 const circle = new Circle({
                     ...baseOptions,
                     radius: spec.radius ?? 6,
                     fill: spec.fill ?? 'rgba(0,0,0,0.0)',
                     stroke: spec.stroke ?? 'red',
                     strokeWidth: spec.strokeWidth ?? 2,
                     selectable: false,
                     evented: false,
                 });
                 fabricObject = circle;
                 break;
            }
            case 'polygon': {
                 if (!Array.isArray(spec.points) || spec.points.length < 3) {
                     console.error(`[InternalFactory] Polygon requires 'points' array of at least 3 points, got:`, spec.points);
                     return null;
                 }
                 // Prepare points. If values are all between 0 and 1, treat as normalized and scale by width/height.
                 const useNormalized = spec.points.every((p:any)=> Array.isArray(p) && p.length===2 && p.every((n:any)=> typeof n==='number' && n>=0 && n<=1));
                 const w = coords.width ?? (spec.width ?? 100);
                 const h = coords.height ?? (spec.height ?? 100);
                 const processedPts = (spec.points as Array<[number,number]>).map(([px,py])=> {
                     return useNormalized ? { x: px * w, y: py * h } : { x: px, y: py };
                 });
                 fabricObject = new Polygon(processedPts, {
                     ...baseOptions,
                     width: w,
                     height: h,
                     fill: spec.fill ?? 'transparent',
                     stroke: spec.stroke ?? 'black',
                     strokeWidth: spec.strokeWidth ?? 1,
                 });
                 break;
            }
            case 'triangle': {
                 const w = coords.width ?? (spec.width ?? 100);
                 const h = coords.height ?? (spec.height ?? 100);
                 fabricObject = new Triangle({
                     ...baseOptions,
                     width: w,
                     height: h,
                     fill: spec.fill ?? 'transparent',
                     stroke: spec.stroke ?? 'black',
                     strokeWidth: spec.strokeWidth ?? 1,
                 });
                 break;
            }
            // IMPORTANT: Exclude 'group', 'image', 'arrow', 'radio', 'checkbox' or any complex/async types here
            default:
                console.warn(`[InternalFactory] Unsupported sync kind: ${spec.kind} (ID: ${spec.id})`);
                return null;
        }
        if (fabricObject) {
            fabricObject.id = spec.id;
            fabricObject.metadata = metadataForFabricObject;
        }
    } catch (error) {
        console.error(`[InternalFactory] Error creating object (kind: ${spec.kind}, id: ${spec.id}):`, error);
        return null;
    }
    return fabricObject;
}

/**
 * Creates and adds a Fabric.js object to the canvas based on the specification.
 * Handles asynchronous loading for images.
 */
export function createFabricObject(canvas: Canvas, spec: CanvasObjectSpec): void {
  let fabricObject: FabricObject | null = null;
  
  // TEMP DIAGNOSTIC
  console.log('[FabricFactory] createFabricObject received spec.kind:', spec.kind, 'Full spec:', JSON.parse(JSON.stringify(spec)));

  // Calculate absolute coordinates if percentage coordinates are provided
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  const { x, y, width, height, metadataPctCoords } = calculateAbsoluteCoords(spec, canvasWidth, canvasHeight);

  const metadataForFabricObject: FabricObject['metadata'] = { 
      id: spec.id,
      ...(spec.metadata || {}),
      ...(metadataPctCoords && { pctCoords: metadataPctCoords }),
  };
  if (!metadataForFabricObject.source) {
      metadataForFabricObject.source = 'assistant';
  }

  try {
    // Base options used by multiple kinds
    const baseOptions = {
      left: x,
      top: y,
      fill: spec.fill,
      stroke: spec.stroke,
      strokeWidth: spec.strokeWidth,
      angle: spec.angle ?? 0,
      selectable: spec.selectable ?? !(['option_selector', 'option_label'].includes(spec.metadata?.role ?? '')),
      evented: spec.evented ?? (['option_selector', 'option_label'].includes(spec.metadata?.role ?? '') ? true : false),
      originX: 'left' as const,
      originY: 'top' as const,
    };

    switch (spec.kind) {
      // --- Basic Shapes (Use Internal Helper for consistency, but create here) ---
      case 'rect':
        fabricObject = createFabricObjectInternal(spec, canvas);
        break;
      case 'ellipse':
      case 'circle':
        fabricObject = createFabricObjectInternal(spec, canvas);
        break;
      case 'textbox':
      case 'text':
      case 'line':
      case 'path':
        fabricObject = createFabricObjectInternal(spec, canvas);
        break;

      // --- Complex Shapes / Async --- 
      case 'group': {
        console.log(`[fabricFactory] Creating group: ${spec.id}`);
        const groupObjects: FabricObject[] = [];
        if (Array.isArray(spec.objects)) { // Assuming group items are in spec.objects
          spec.objects.forEach((itemSpec: CanvasObjectSpec) => {
             // Recursively create objects *without* adding them to canvas yet
             const itemObject = createFabricObjectInternal(itemSpec, canvas);
             if (itemObject) {
                 groupObjects.push(itemObject);
             }
          });
        }
        if (groupObjects.length > 0) {
            fabricObject = new Group(groupObjects, {
                ...baseOptions, // Apply group-level position, angle etc.
                // Optional: Adjust left/top based on group contents if needed
            });
        } else {
            console.warn(`[fabricFactory] Group ${spec.id} has no valid objects.`);
        }
        break;
      }
      case 'image': { // Asynchronous
        if (!spec.src) {
            console.error(`Image object (ID: ${spec.id}) requires a 'src' property.`);
            return; // Don't proceed
        }
        console.log(`[fabricFactory] Loading image: ${spec.id} from ${spec.src}`);
        // @ts-expect-error Fabric.js type definitions for fromURL callback are incorrect; this works at runtime.
        FabricImage.fromURL(spec.src, (img) => {
            if (!img) {
                console.error(`Failed to load image (ID: ${spec.id}) from ${spec.src}`);
                return;
            }
            console.log(`[fabricFactory] Image loaded: ${spec.id}`);
            img.set({
                ...baseOptions,
                width: width,
                height: height,
            });
            (img as any).metadata = metadataForFabricObject;
            canvas.add(img);
            canvas.requestRenderAll();
        }, {}); // Re-added empty options object
        return; // Exit void function - handled async
      }
      case 'arrow': {
          // Simple arrow: Line + potential arrowhead logic (future)
          let linePoints: [number, number, number, number] = [0, 0, 50, 0]; // Default horizontal arrow
          if (Array.isArray(spec.points)) { // Re-use line logic for points
              if (spec.points.length === 4 && typeof spec.points[0] === 'number') {
                 linePoints = spec.points as [number, number, number, number];
              } else if (spec.points.length === 2 && typeof spec.points[0] === 'object' && spec.points[0] !== null && 'x' in spec.points[0]) {
                 const p1 = spec.points[0] as { x: number; y: number };
                 const p2 = spec.points[1] as { x: number; y: number };
                 linePoints = [p1.x, p1.y, p2.x, p2.y];
             }
          }
          fabricObject = new Line(linePoints, {
              stroke: spec.stroke ?? 'black',
              strokeWidth: spec.strokeWidth ?? 2,
              angle: spec.angle ?? 0,
              left: x,
              top: y,
              selectable: spec.selectable ?? true,
              evented: spec.evented ?? false,
              // TODO: Add arrowhead marker (e.g., using Path or Triangle)
          });
          break;
      }
      case 'radio': {
        if (Array.isArray(spec.options) && spec.options.length > 0) {
          // This is the deprecated MCQ format (kind: "radio" with an "options" array).
          // The backend should send MCQs as a list of individual text/circle objects.
          console.warn(`[fabricObjectFactory] Received deprecated MCQ format (kind: "radio" with options array) for ID: ${spec.id || 'unknown'}. This format is no longer supported for MCQs. Object will not be rendered.`);
          fabricObject = null; // Ensure no object is created for this deprecated format
        } else {
          // This handles a spec intended to be a SINGLE radio button (kind: "radio" but NO options array).
          // This is not intended for rendering full MCQs.
          const circle = new Circle({
            // Position relative to the intended group origin initially
            left: 0,
            top: 4, // Small offset for alignment with text
            radius: spec.radius ?? 8,
            stroke: spec.stroke ?? '#555555',
            strokeWidth: spec.strokeWidth ?? 1,
            fill: spec.fill ?? '#FFFFFF',
            selectable: spec.selectable ?? false,
            evented: spec.evented ?? true,
          });

          (circle as any).metadata = {
            ...metadataForFabricObject,
            role: 'option_selector', // Generic role
          };

          const labelText = spec.label ?? ''; 
          const label = new Textbox(labelText, {
            // Position relative to the intended group origin
            left: (spec.radius ?? 8) * 2 + 4, // Place label to the right of the circle
            top: 0,
            width: spec.width || (canvas ? canvas.getWidth() * 0.7 : 200), // Use spec.width for label if provided
            fontSize: spec.fontSize ?? 16,
            fontFamily: spec.fontFamily ?? 'Arial',
            fill: spec.fill ?? '#333333', // Text fill should be distinct from object fill
            selectable: false,
            evented: false,
          });
          (label as any).metadata = {
            ...metadataForFabricObject,
            id: `${metadataForFabricObject.id}-label`, // Ensure label has a distinct ID
            role: 'radio_label_for_single_item',
          };
          
          // Group the circle and label for a single radio button instance
          // The group itself will be positioned by baseOptions (derived from spec.x, spec.y, spec.xPct, spec.yPct)
          fabricObject = new Group([circle, label], {
            // baseOptions (left, top, angle etc.) are applied to the group by the default logic later IF this fabricObject is returned
            // However, the internal elements (circle, label) are positioned relative to the group's (0,0)
            // So, we use the baseOptions spread here to ensure the group has them directly.
            ...baseOptions, // Apply spec's x,y,angle etc. to the group
            selectable: spec.selectable ?? false, 
            evented: spec.evented ?? false, 
            subTargetCheck: true, 
          });
          // Ensure the group's metadata is set, including its kind if it's specific
          (fabricObject as any).metadata = { ...metadataForFabricObject, kind: metadataForFabricObject.kind || 'radio_button_group' }; 
        }
        break;
      }
      case 'highlight_stroke':
      case 'question_tag':
      case 'pointer_ping':
        fabricObject = createFabricObjectInternal(spec, canvas);
        break;
      case 'polygon':
      case 'triangle':
        fabricObject = createFabricObjectInternal(spec, canvas);
        break;
      default:
        // Removed exhaustive check for now, rely on warning
        // const _exhaustiveCheck: never = spec.kind; 
        console.warn(`[fabricFactory] Unsupported object kind: ${spec.kind} (ID: ${spec.id})`);
        return; // Exit void function
    }

    // Add the synchronously created object to canvas (if not handled async)
    if (fabricObject) {
      (fabricObject as any).metadata = metadataForFabricObject; // Assign metadata
      canvas.add(fabricObject);
    }

  } catch (error) {
    console.error(`Error creating Fabric object (kind: ${spec.kind}, id: ${spec.id}):`, error);
  }
  // No explicit return needed (void function)
}

/**
 * Updates an existing Fabric.js object based on the provided specification.
 * Only updates properties present in the spec.
 */
export function updateFabricObject(obj: FabricObject, spec: Partial<CanvasObjectSpec>): void {
  if (!obj) return;
  const updateOptions: Partial<FabricObject> = {};
  let requiresCoordsUpdate = false;
  for (const key in spec) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
    const specKey = key as keyof CanvasObjectSpec;
    if (specKey === 'id' || specKey === 'kind') continue;
    if (specKey === 'metadata') {
      const currentMetadata = (obj as any).metadata || {};
      const newMetadata = { ...currentMetadata, ...(spec.metadata || {}) };
      (obj as any).metadata = newMetadata;
      continue;
    }
    if (specKey === 'x') {
      updateOptions.left = spec.x;
      requiresCoordsUpdate = true;
    } else if (specKey === 'y') {
      updateOptions.top = spec.y;
      requiresCoordsUpdate = true;
    } else if (specKey === 'points') {
      // Not directly settable, see note above
      continue;
    } else {
      (updateOptions as any)[specKey] = spec[specKey];
      if ([
        'left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle', 'skewX', 'skewY', 'radius'
      ].includes(specKey)) {
        requiresCoordsUpdate = true;
      }
    }
  }
  if (Object.keys(updateOptions).length > 0) {
    obj.set(updateOptions);
  }
  if (requiresCoordsUpdate && typeof obj.setCoords === 'function') {
    obj.setCoords();
  }
}

/**
 * Deletes a Fabric.js object from the canvas by its ID (stored in metadata).
 */
export function deleteFabricObject(canvas: Canvas, idToDelete: string): boolean {
    const objects = canvas.getObjects();
    const objectToDelete = objects.find((obj: FabricObject) => (obj as any).metadata?.id === idToDelete);
    if (objectToDelete) {
        canvas.remove(objectToDelete);
        canvas.requestRenderAll();
        return true;
    }
    return false;
}

export function getCanvasStateAsSpecs(canvas: Canvas): CanvasObjectSpec[] {
    const specs: CanvasObjectSpec[] = [];
    const objects = canvas.getObjects();

    objects.forEach((obj: FabricObject) => {
        const metadata = (obj as any).metadata || {};
        const id = metadata.id;

        if (!id) {
            console.warn("[getCanvasStateAsSpecs] Object found without metadata.id, skipping:", obj);
            return;
        }

        let kind = obj.type || 'unknown';
        if (obj.type === 'i-text' || obj.type === 'text') kind = 'textbox';
        if (obj.type === 'image') kind = 'image';
        if (metadata.kind) {
            kind = metadata.kind;
        }

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
            metadata: { ...metadata },
        };

        let objectSpec: CanvasObjectSpec;

        switch (obj.type) {
            case 'rect':
                objectSpec = { ...commonSpec, kind: 'rect' } as CanvasObjectSpec;
                break;
            case 'circle':
                const circle = obj as Circle;
                objectSpec = {
                    ...commonSpec,
                    kind: 'circle',
                    radius: circle.radius ? circle.radius * Math.max(obj.scaleX || 1, obj.scaleY || 1) : undefined,
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
                } as CanvasObjectSpec;
                break;
            case 'line':
                const line = obj as Line;
                objectSpec = {
                    ...commonSpec,
                    kind: 'line',
                    points: [line.x1!, line.y1!, line.x2!, line.y2!]
                } as CanvasObjectSpec;
                break;
            case 'path':
                const path = obj as Path;
                objectSpec = {
                    ...commonSpec,
                    kind: 'path',
                    points: path.path ? path.path.map((p: Array<string|number>) => p.join(' ')).join(' ') : undefined,
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
                    kind: 'group',
                    objects: group.getObjects().map((groupObj: FabricObject) => {
                        const groupObjMeta = (groupObj as any).metadata || {};
                        return {
                            id: groupObjMeta.id || `group-child-${Math.random().toString(36).substring(2,9)}`,
                            kind: groupObj.type || 'unknown',
                            x: groupObj.left,
                            y: groupObj.top,
                            width: groupObj.width ? groupObj.width * (groupObj.scaleX || 1) : undefined,
                            height: groupObj.height ? groupObj.height * (groupObj.scaleY || 1) : undefined,
                            metadata: groupObjMeta
                        } as CanvasObjectSpec;
                    })
                } as CanvasObjectSpec;
                break;
            default:
                console.warn(`[getCanvasStateAsSpecs] Unhandled Fabric object type: ${obj.type} for object ID: ${id}. Using common spec.`);
                objectSpec = commonSpec as CanvasObjectSpec;
                if (!objectSpec.kind) objectSpec.kind = 'unknown';
        }

        specs.push(objectSpec as CanvasObjectSpec);
    });

    return specs;
}