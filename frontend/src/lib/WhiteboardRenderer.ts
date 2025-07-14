import * as fabric from 'fabric';
import { 
  WBObject, 
  Viewport, 
  Point, 
  LOGICAL_SPACE, 
  logicalToScreen, 
  screenToLogical,
  normalizePoints,
  isLinearElement,
  isBindableElement,
  ElementBinding
} from '@aitutor/whiteboard-schema';
import type { CanvasObjectSpec } from '@/types';

/**
 * WhiteboardRenderer manages viewport transformations and element rendering
 * following Excalidraw's coordinate system approach
 */
export class WhiteboardRenderer {
  private canvas: fabric.Canvas;
  private viewport: Viewport = {
    zoom: 1.0,
    scrollX: 0,
    scrollY: 0
  };
  
  private elementCache = new WeakMap<WBObject, {
    version: number;
    fabricObject: fabric.Object;
  }>();

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas;
    this.setupViewportEvents();
  }

  // ---------------------------------------------------------------------------
  // Viewport Management
  // ---------------------------------------------------------------------------

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  setViewport(viewport: Partial<Viewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
    this.updateCanvasTransform();
  }

  zoomToFit(elements: WBObject[], padding: number = 50): void {
    if (elements.length === 0) return;

    const bounds = this.calculateElementsBounds(elements);
    if (!bounds) return;

    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    
    const scaleX = (canvasWidth - 2 * padding) / bounds.width;
    const scaleY = (canvasHeight - 2 * padding) / bounds.height;
    const zoom = Math.min(scaleX, scaleY, 2.0); // Max zoom 2x

    this.setViewport({
      zoom,
      scrollX: bounds.x - (canvasWidth / zoom - bounds.width) / 2,
      scrollY: bounds.y - (canvasHeight / zoom - bounds.height) / 2
    });
  }

  private updateCanvasTransform(): void {
    this.canvas.setViewportTransform([
      this.viewport.zoom, 0, 0, 
      this.viewport.zoom,
      -this.viewport.scrollX * this.viewport.zoom,
      -this.viewport.scrollY * this.viewport.zoom
    ]);
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------------------
  // Coordinate Transformations
  // ---------------------------------------------------------------------------

  logicalToCanvas(logicalX: number, logicalY: number): Point {
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    
    return logicalToScreen(
      logicalX, logicalY, 
      this.viewport, 
      canvasWidth, canvasHeight
    );
  }

  canvasToLogical(canvasX: number, canvasY: number): Point {
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    
    return screenToLogical(
      canvasX, canvasY, 
      this.viewport, 
      canvasWidth, canvasHeight
    );
  }

  // ---------------------------------------------------------------------------
  // Element Rendering
  // ---------------------------------------------------------------------------

  renderElement(element: WBObject): fabric.Object | null {
    // Check cache first
    const cached = this.elementCache.get(element);
    if (cached && cached.version === element.version) {
      return cached.fabricObject;
    }

    let fabricObject: fabric.Object | null = null;

    switch (element.kind) {
      case 'rect':
        fabricObject = this.createRectangle(element);
        break;
      case 'ellipse':
        fabricObject = this.createEllipse(element);
        break;
      case 'text':
        fabricObject = this.createText(element);
        break;
      case 'line':
        fabricObject = this.createLine(element);
        break;
      case 'arrow':
        fabricObject = this.createArrow(element);
        break;
      case 'path':
        fabricObject = this.createPath(element);
        break;
      default:
        console.warn(`[WhiteboardRenderer] Unsupported element kind: ${(element as any).kind}`);
        return null;
    }

    if (fabricObject) {
      // Apply common properties
      this.applyCommonProperties(fabricObject, element);
      
      // Cache the result
      this.elementCache.set(element, {
        version: element.version,
        fabricObject
      });
    }

    return fabricObject;
  }

  private createRectangle(element: WBObject & { kind: 'rect' }): fabric.Rect {
    const [canvasX, canvasY] = this.logicalToCanvas(element.x, element.y);
    const canvasWidth = element.width * this.getLogicalToCanvasScale();
    const canvasHeight = element.height * this.getLogicalToCanvasScale();

    return new fabric.Rect({
      left: canvasX,
      top: canvasY,
      width: canvasWidth,
      height: canvasHeight,
      fill: element.fill || 'transparent',
      stroke: element.stroke || 'black',
      strokeWidth: element.strokeWidth || 1,
      rx: element.cornerRadius || 0,
      ry: element.cornerRadius || 0,
    });
  }

  private createEllipse(element: WBObject & { kind: 'ellipse' }): fabric.Ellipse {
    const [canvasX, canvasY] = this.logicalToCanvas(element.x, element.y);
    const scale = this.getLogicalToCanvasScale();
    
    return new fabric.Ellipse({
      left: canvasX,
      top: canvasY,
      rx: (element.width / 2) * scale,
      ry: (element.height / 2) * scale,
      fill: element.fill || 'transparent',
      stroke: element.stroke || 'black',
      strokeWidth: element.strokeWidth || 1,
    });
  }

  private createText(element: WBObject & { kind: 'text' }): fabric.Textbox {
    const [canvasX, canvasY] = this.logicalToCanvas(element.x, element.y);
    const scale = this.getLogicalToCanvasScale();

    return new fabric.Textbox(element.text, {
      left: canvasX,
      top: canvasY,
      fontSize: (element.fontSize || 16) * scale,
      fontFamily: element.fontFamily || 'Arial',
      fill: element.fill || 'black',
      textAlign: element.textAlign || 'left',
      width: element.width ? element.width * scale : undefined,
      height: element.height ? element.height * scale : undefined,
    });
  }

  private createLine(element: WBObject & { kind: 'line' }): fabric.Line {
    if (element.points.length < 2) {
      console.warn('[WhiteboardRenderer] Line requires at least 2 points');
      return new fabric.Line([0, 0, 0, 0]);
    }

    // Convert points from logical to canvas coordinates
    const [elementX, elementY] = this.logicalToCanvas(element.x, element.y);
    const scale = this.getLogicalToCanvasScale();
    
    // First point is [0,0] relative to element, subsequent points are relative
    const [, startY] = element.points[0]; // Should be [0,0]
    const [endX, endY] = element.points[1];
    
    const line = new fabric.Line([
      0, 0, // Start at element origin
      endX * scale, endY * scale // End point scaled
    ], {
      left: elementX,
      top: elementY,
      stroke: element.stroke || 'black',
      strokeWidth: element.strokeWidth || 2,
      originX: 'left',
      originY: 'top',
    });

    // Add arrow markers if specified
    if (element.markerEnd === 'arrow') {
      this.addArrowMarker(line, 'end');
    }
    if (element.markerStart === 'arrow') {
      this.addArrowMarker(line, 'start');
    }

    return line;
  }

  private createArrow(element: WBObject & { kind: 'arrow' }): fabric.Group | fabric.Path {
    if (element.points.length < 2) {
      console.warn('[WhiteboardRenderer] Arrow requires at least 2 points');
      return new fabric.Group([]);
    }

    const [elementX, elementY] = this.logicalToCanvas(element.x, element.y);
    const scale = this.getLogicalToCanvasScale();
    
    // Handle different arrow types
    if (element.arrowType === 'curved' && element.curvature) {
      return this.createCurvedArrow(element, elementX, elementY, scale);
    } else if (element.arrowType === 'elbow') {
      return this.createElbowArrow(element, elementX, elementY, scale);
    } else {
      return this.createStraightArrow(element, elementX, elementY, scale);
    }
  }

  private createStraightArrow(
    element: WBObject & { kind: 'arrow' },
    elementX: number,
    elementY: number,
    scale: number
  ): fabric.Group {
    // Create straight line
    const [startX, startY] = element.points[0];
    const [endX, endY] = element.points[element.points.length - 1];
    
    const line = new fabric.Line([
      startX * scale, startY * scale,
      endX * scale, endY * scale
    ], {
      stroke: element.stroke || 'black',
      strokeWidth: (element.strokeWidth || 2) * scale,
      originX: 'left',
      originY: 'top',
    });

    const arrowHead = this.createArrowHead(element, scale);
    
    return new fabric.Group([line, arrowHead], {
      left: elementX,
      top: elementY,
      originX: 'left',
      originY: 'top',
    });
  }

  private createCurvedArrow(
    element: WBObject & { kind: 'arrow' },
    elementX: number,
    elementY: number,
    scale: number
  ): fabric.Path {
    const [startX, startY] = element.points[0];
    const [endX, endY] = element.points[element.points.length - 1];
    
    // Use provided control points or generate them
    let controlPoints = element.controlPoints;
    if (!controlPoints && element.curvature) {
      // Generate automatic control points
      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const controlOffset = distance * element.curvature * 0.5;
      const perpX = -dy / distance * controlOffset;
      const perpY = dx / distance * controlOffset;
      
      const midX = (startX + endX) * 0.5;
      const midY = (startY + endY) * 0.5;
      
      controlPoints = [
        [midX + perpX, midY + perpY] as Point,
        [midX - perpX, midY - perpY] as Point
      ];
    }

    // Create SVG path for curved arrow
    let pathData = `M ${startX * scale} ${startY * scale}`;
    
    if (controlPoints && controlPoints.length >= 2) {
      // Quadratic Bezier curve
      const [cp1X, cp1Y] = controlPoints[0];
      pathData += ` Q ${cp1X * scale} ${cp1Y * scale} ${endX * scale} ${endY * scale}`;
    } else {
      // Fallback to straight line
      pathData += ` L ${endX * scale} ${endY * scale}`;
    }

    const curvedPath = new fabric.Path(pathData, {
      left: elementX,
      top: elementY,
      fill: '',
      stroke: element.stroke || 'black',
      strokeWidth: (element.strokeWidth || 2) * scale,
      originX: 'left',
      originY: 'top',
    });

    // Add arrowhead at the end
    const arrowHead = this.createArrowHead(element, scale);
    
    // Create group with path and arrowhead
    const group = new fabric.Group([curvedPath, arrowHead], {
      left: elementX,
      top: elementY,
      originX: 'left',
      originY: 'top',
    });

    return group as any; // Return as fabric.Path interface
  }

  private createElbowArrow(
    element: WBObject & { kind: 'arrow' },
    elementX: number,
    elementY: number,
    scale: number
  ): fabric.Group {
    const points = element.points;
    const pathPoints: fabric.Point[] = [];
    
    // Convert all points to fabric.Point objects
    for (const [x, y] of points) {
      pathPoints.push(new fabric.Point(x * scale, y * scale));
    }

    // Create polyline for elbow arrow
    const polyline = new fabric.Polyline(pathPoints, {
      fill: '',
      stroke: element.stroke || 'black',
      strokeWidth: (element.strokeWidth || 2) * scale,
      strokeLineJoin: 'round',
      originX: 'left',
      originY: 'top',
    });

    const arrowHead = this.createArrowHead(element, scale);
    
    return new fabric.Group([polyline, arrowHead], {
      left: elementX,
      top: elementY,
      originX: 'left',
      originY: 'top',
    });
  }

  private createPath(element: WBObject & { kind: 'path' }): fabric.Path {
    const [canvasX, canvasY] = this.logicalToCanvas(element.x, element.y);
    
    return new fabric.Path(element.d, {
      left: canvasX,
      top: canvasY,
      fill: element.fill || 'transparent',
      stroke: element.stroke || 'black',
      strokeWidth: element.strokeWidth || 1,
    });
  }

  private createArrowHead(element: WBObject & { kind: 'arrow' }, scale: number): fabric.Triangle {
    const headSize = (element.strokeWidth || 2) * 6 * scale;
    
    // Calculate arrow direction from last two points
    const points = element.points;
    const [x1, y1] = points[points.length - 2] || [0, 0];
    const [x2, y2] = points[points.length - 1] || [0, 0];
    
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    return new fabric.Triangle({
      left: x2 * scale,
      top: y2 * scale,
      width: headSize,
      height: headSize,
      fill: element.stroke || 'black',
      angle: (angle * 180 / Math.PI) + 90, // Convert to degrees
      originX: 'center',
      originY: 'center',
    });
  }

  private addArrowMarker(line: fabric.Line, position: 'start' | 'end'): void {
    // Implementation for adding arrow markers to lines
    // This would create and attach triangle markers
  }

  private applyCommonProperties(fabricObject: fabric.Object, element: WBObject): void {
    // Apply common properties like rotation, metadata, etc.
    if (element.angle) {
      fabricObject.set('angle', element.angle * 180 / Math.PI); // Convert to degrees
    }

    // Store element metadata
    (fabricObject as any).metadata = {
      id: element.id,
      version: element.version,
      ...element.metadata
    };

    // Apply selection and interaction properties
    fabricObject.set({
      selectable: true,
      evented: true,
      hoverCursor: 'move',
      moveCursor: 'move',
    });
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  private getLogicalToCanvasScale(): number {
    const canvasWidth = this.canvas.getWidth();
    return canvasWidth / LOGICAL_SPACE.width;
  }

  private calculateElementsBounds(elements: WBObject[]): {
    x: number, y: number, width: number, height: number
  } | null {
    if (elements.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    elements.forEach(element => {
      const x1 = element.x;
      const y1 = element.y;
      const x2 = x1 + (element.width || 0);
      const y2 = y1 + (element.height || 0);

      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private setupViewportEvents(): void {
    // Handle mouse wheel for zooming
    this.canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = this.viewport.zoom;
      zoom *= 0.999 ** delta;
      
      // Clamp zoom between 0.1x and 5x
      zoom = Math.max(0.1, Math.min(5, zoom));
      
      if (zoom !== this.viewport.zoom) {
        const point = this.canvas.getPointer(opt.e);
        this.zoomToPoint(point, zoom);
      }
      
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Handle panning with right-click drag
    let isPanning = false;
    let lastPanPoint: { x: number, y: number } | null = null;

    this.canvas.on('mouse:down', (opt) => {
      if (opt.e.button === 2) { // Right click
        isPanning = true;
        lastPanPoint = this.canvas.getPointer(opt.e);
        this.canvas.selection = false;
      }
    });

    this.canvas.on('mouse:move', (opt) => {
      if (isPanning && lastPanPoint) {
        const pointer = this.canvas.getPointer(opt.e);
        const deltaX = pointer.x - lastPanPoint.x;
        const deltaY = pointer.y - lastPanPoint.y;
        
        this.setViewport({
          scrollX: this.viewport.scrollX - deltaX / this.viewport.zoom,
          scrollY: this.viewport.scrollY - deltaY / this.viewport.zoom
        });
        
        lastPanPoint = pointer;
      }
    });

    this.canvas.on('mouse:up', () => {
      isPanning = false;
      lastPanPoint = null;
      this.canvas.selection = true;
    });
  }

  private zoomToPoint(point: { x: number, y: number }, zoom: number): void {
    const beforeTransform = this.canvas.getPointer(point as any);
    
    this.setViewport({ zoom });
    
    const afterTransform = this.canvas.getPointer(point as any);
    this.setViewport({
      scrollX: this.viewport.scrollX + (beforeTransform.x - afterTransform.x) / zoom,
      scrollY: this.viewport.scrollY + (beforeTransform.y - afterTransform.y) / zoom
    });
  }

  // ---------------------------------------------------------------------------
  // Legacy Compatibility
  // ---------------------------------------------------------------------------

  /**
   * Convert legacy CanvasObjectSpec to new WBObject format
   */
  convertLegacySpec(spec: CanvasObjectSpec): WBObject | null {
    // Implementation to convert old format to new format
    // This helps during migration period
    
    const baseElement = {
      id: spec.id,
      x: typeof spec.x === 'number' ? spec.x : (spec.xPct || 0) * LOGICAL_SPACE.width,
      y: typeof spec.y === 'number' ? spec.y : (spec.yPct || 0) * LOGICAL_SPACE.height,
      version: spec.version || 1,
      metadata: {
        groupId: spec.groupId || spec.id,
        source: spec.metadata?.source as any || 'ai',
        ...spec.metadata
      }
    };

    switch (spec.kind) {
      case 'rect':
        return {
          ...baseElement,
          kind: 'rect',
          width: typeof spec.width === 'number' ? spec.width : (spec.widthPct || 0.1) * LOGICAL_SPACE.width,
          height: typeof spec.height === 'number' ? spec.height : (spec.heightPct || 0.1) * LOGICAL_SPACE.height,
          fill: spec.fill,
          stroke: spec.stroke,
          strokeWidth: spec.strokeWidth
        };
      
      // Add other conversions as needed
      default:
        console.warn(`[WhiteboardRenderer] Cannot convert legacy spec kind: ${spec.kind}`);
        return null;
    }
  }
}

export default WhiteboardRenderer; 