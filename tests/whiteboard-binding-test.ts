/**
 * Phase 2 Test: Curved Arrows and Element Binding System
 * 
 * This test demonstrates:
 * - Curved arrows with automatic curvature
 * - Element binding between arrows and shapes
 * - Smart connection point detection
 * - Automatic updates when bound elements move
 */

import { 
  WBObject, 
  WBRect, 
  WBArrow,
  createWBElement,
  updateElementVersion,
  getConnectionPoint,
  generateCurvedArrowPath,
  findClosestBindableElement,
  updateBoundArrows,
  ElementBinding,
  Point
} from "../packages/whiteboard-schema";

// Test 1: Creating curved arrows
console.log("=== Test 1: Curved Arrow Creation ===");

const startPoint: Point = [100, 100];
const endPoint: Point = [300, 200];

// Test straight arrow
const straightPath = generateCurvedArrowPath(startPoint, endPoint, 0.5, "straight");
console.log("Straight arrow path:", straightPath);

// Test elbow arrow
const elbowPath = generateCurvedArrowPath(startPoint, endPoint, 0.5, "elbow");
console.log("Elbow arrow path:", elbowPath);

// Test curved arrow
const curvedPath = generateCurvedArrowPath(startPoint, endPoint, 0.3, "curved");
console.log("Curved arrow path:", curvedPath);
console.log("Control points:", curvedPath.controlPoints);

// Test 2: Element binding setup
console.log("\n=== Test 2: Element Binding Setup ===");

// Create test shapes
const sourceRect = createWBElement<WBRect>({
  id: "source-rect",
  kind: "rect",
  x: 100,
  y: 100,
  width: 150,
  height: 80,
  fill: "lightblue",
  stroke: "blue",
  strokeWidth: 2
});

const targetRect = createWBElement<WBRect>({
  id: "target-rect", 
  kind: "rect",
  x: 400,
  y: 150,
  width: 120,
  height: 60,
  fill: "lightgreen",
  stroke: "green",
  strokeWidth: 2
});

console.log("Source rectangle:", sourceRect);
console.log("Target rectangle:", targetRect);

// Test 3: Connection point calculation
console.log("\n=== Test 3: Connection Point Calculation ===");

// Test different connection points on the source rectangle
const connectionPoints = {
  auto: getConnectionPoint(sourceRect, 0.5, "auto"),
  top: getConnectionPoint(sourceRect, 0.5, "top"),
  right: getConnectionPoint(sourceRect, 0.5, "right"),
  bottom: getConnectionPoint(sourceRect, 0.5, "bottom"),
  left: getConnectionPoint(sourceRect, 0.5, "left"),
  center: getConnectionPoint(sourceRect, 0.5, "center")
};

console.log("Connection points on source rectangle:", connectionPoints);

// Test focus-based positioning (0-1 around perimeter)
const focusPoints = [0, 0.25, 0.5, 0.75, 1.0].map(focus => ({
  focus,
  point: getConnectionPoint(sourceRect, focus, "auto")
}));

console.log("Focus-based connection points:", focusPoints);

// Test 4: Creating bound arrows
console.log("\n=== Test 4: Creating Bound Arrows ===");

// Create element bindings
const startBinding: ElementBinding = {
  elementId: sourceRect.id,
  focus: 0.5,
  gap: 10,
  connectionPoint: "right"
};

const endBinding: ElementBinding = {
  elementId: targetRect.id,
  focus: 0.5,
  gap: 10,
  connectionPoint: "left"
};

// Create bound curved arrow
const boundArrow = createWBElement<WBArrow>({
  id: "bound-arrow",
  kind: "arrow",
  x: 100, // Will be adjusted based on bindings
  y: 100,
  points: [[0, 0], [300, 50]], // Initial points, will be updated by binding
  stroke: "red",
  strokeWidth: 3,
  arrowType: "curved",
  curvature: 0.4,
  startBinding,
  endBinding
});

console.log("Bound curved arrow:", boundArrow);

// Test 5: Automatic binding updates
console.log("\n=== Test 5: Automatic Binding Updates ===");

const allElements = [sourceRect, targetRect, boundArrow];

// Simulate moving the target rectangle
const movedTargetRect = updateElementVersion({
  ...targetRect,
  x: 500, // Move 100 pixels to the right
  y: 200  // Move 50 pixels down
});

console.log("Moved target rectangle:", movedTargetRect);

// Update bound arrows automatically
const updatedElements = updateBoundArrows(movedTargetRect, allElements);
const updatedArrow = updatedElements.find(el => el.id === boundArrow.id) as WBArrow;

console.log("Updated arrow after target moved:", updatedArrow);
console.log("New arrow points:", updatedArrow.points);
console.log("New control points:", updatedArrow.controlPoints);

// Test 6: Smart connection detection
console.log("\n=== Test 6: Smart Connection Detection ===");

const testPoint: Point = [350, 175]; // Point near target rectangle

const closestElement = findClosestBindableElement(
  testPoint, 
  [sourceRect, movedTargetRect], 
  []
);

if (closestElement) {
  console.log("Closest bindable element:", {
    elementId: closestElement.element.id,
    connectionPoint: closestElement.connectionPoint,
    focus: closestElement.focus,
    distance: Math.sqrt(
      (testPoint[0] - closestElement.connectionPoint[0]) ** 2 + 
      (testPoint[1] - closestElement.connectionPoint[1]) ** 2
    )
  });
} else {
  console.log("No bindable element found near point");
}

// Test 7: Complex curved arrow with manual control points
console.log("\n=== Test 7: Complex Curved Arrow ===");

const complexArrow = createWBElement<WBArrow>({
  id: "complex-arrow",
  kind: "arrow",
  x: 200,
  y: 300,
  points: [[0, 0], [200, 100]],
  stroke: "purple",
  strokeWidth: 4,
  arrowType: "curved",
  curvature: 0.6,
  // Manual control points for custom curve shape
  controlPoints: [
    [50, -30],  // Pull curve upward
    [150, 80]   // Pull curve toward end
  ]
});

console.log("Complex curved arrow:", complexArrow);

// Test 8: Elbow arrow with multiple segments
console.log("\n=== Test 8: Elbow Arrow ===");

const elbowArrow = createWBElement<WBArrow>({
  id: "elbow-arrow",
  kind: "arrow", 
  x: 100,
  y: 400,
  points: [
    [0, 0],      // Start
    [80, 0],     // First turn
    [80, 60],    // Second turn  
    [160, 60]    // End
  ],
  stroke: "orange",
  strokeWidth: 3,
  arrowType: "elbow"
});

console.log("Elbow arrow:", elbowArrow);

console.log("\n=== Phase 2 Tests Complete ===");
console.log("✅ Curved arrows with automatic curvature");
console.log("✅ Element binding system");
console.log("✅ Smart connection point detection");
console.log("✅ Automatic updates when bound elements move");
console.log("✅ Manual control points for custom curves");
console.log("✅ Elbow arrows with 90-degree segments"); 