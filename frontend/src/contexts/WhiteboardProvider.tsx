'use client';

import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import * as fabric from 'fabric';
import { WhiteboardAction, CanvasObjectSpec, WhiteboardActionType } from '@/types';
import { createFabricObject, updateFabricObject, deleteFabricObject } from '@/lib/fabricObjectFactory'; // Import factory (to be created)
import { useSessionStore } from '@/store/sessionStore'; // Import useSessionStore
import { renderLatexToSvg } from '@/lib/whiteboardUtils'; // Added for LaTeX rendering
import { calculateAbsoluteCoords } from '@/lib/whiteboardUtils'; // Ensure this is imported if used for coords
import { getGraphLayout } from '@/lib/whiteboardUtils'; // Added for graph layout
import type { NodeSpec, EdgeSpec } from '@/lib/types'; // Added for graph layout
import { useYjsWhiteboard } from '@/hooks/useYjsWhiteboard';
import * as Y from 'yjs'; // Import Yjs for type annotation if needed

interface WhiteboardContextType {
  fabricCanvas: fabric.Canvas | null;
  setFabricCanvas: (canvas: fabric.Canvas | null) => void;
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void;

  // History helpers
  replayWhiteboardToSnapshotIndex: (index: number) => void | Promise<void>;
  returnToLiveWhiteboard: () => void;
  currentSnapshotIndex: number;
  historyLength: number;

  // Undo/Redo
  undoUserAction: () => void;
  redoUserAction: () => void;
  undoAITurn: () => void;
  redoAITurn: () => void;

  // Global unified undo/redo
  undoGlobal: () => void;
  redoGlobal: () => void;

  // Ephemeral write helper
  writeEphemeral: (spec: CanvasObjectSpec) => void;
}

const WhiteboardContext = createContext<WhiteboardContextType | undefined>(undefined);

export const WhiteboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fabricCanvasInternalState, setFabricCanvasInternalState] = useState<fabric.Canvas | null>(null);
  const setFabricCanvasInstanceInStore = useSessionStore((state) => state.setFabricCanvasInstance);
  const [actionQueue, setActionQueue] = useState<WhiteboardAction[]>([]); // NEW: queue for incoming actions before canvas ready
  const [isCanvasReady, setIsCanvasReady] = useState(false); // NEW: readiness flag

  // -------------------- History & Undo/Redo State --------------------
  // Each element in historyBatches represents a batch of whiteboard actions that were applied together (e.g. an AI turn or a user batch)
  const [historyBatches, setHistoryBatches] = useState<WhiteboardAction[][]>([]);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState<number>(-1); // -1 means empty canvas

  // Stacks for AI-turn-level undo/redo (indices into historyBatches)
  const [aiUndoStack, setAiUndoStack] = useState<number[]>([]);
  const [aiRedoStack, setAiRedoStack] = useState<number[]>([]);

  // User drawing undo/redo (snapshot JSON of the canvas)
  const [userUndoStack, setUserUndoStack] = useState<any[]>([]);
  const [userRedoStack, setUserRedoStack] = useState<any[]>([]);

  // Flag to suppress history recording while we are programmatically replaying
  const isReplayingRef = useRef(false);

  // Helper to capture canvas JSON for user-action undo
  const captureUserSnapshot = useCallback(() => {
      if (!fabricCanvasInternalState) return;
      try {
          const json = (fabricCanvasInternalState as any).toJSON(['metadata']);
          setUserUndoStack(prev => [...prev, json]);
          setUserRedoStack([]); // clear redo when new action performed
      } catch (e) {
          console.warn('[WhiteboardProvider] Failed to capture canvas snapshot:', e);
      }
  }, [fabricCanvasInternalState]);

  // Attach listeners to capture user actions when canvas becomes ready
  useEffect(() => {
      if (!fabricCanvasInternalState) return;

      const handlerAdded = () => {
          if (isReplayingRef.current) return; // Ignore programmatic modifications
          captureUserSnapshot();
      };

      fabricCanvasInternalState.on('object:added', handlerAdded);
      fabricCanvasInternalState.on('object:modified', handlerAdded);
      fabricCanvasInternalState.on('object:removed', handlerAdded);

      // Take initial snapshot (blank canvas)
      captureUserSnapshot();

      return () => {
          fabricCanvasInternalState.off('object:added', handlerAdded);
          fabricCanvasInternalState.off('object:modified', handlerAdded);
          fabricCanvasInternalState.off('object:removed', handlerAdded);
      };
  }, [fabricCanvasInternalState, captureUserSnapshot]);

  // -------------------- AI Turn Undo / Redo --------------------
  let undoAITurn = () => {};
  let redoAITurn = () => {};

  undoAITurn = () => {
      setAiUndoStack(prev => {
          if (prev.length === 0) return prev;
          const newUndo = [...prev];
          const lastSnapshot = newUndo.pop()!;
          setAiRedoStack(r => [...r, lastSnapshot]);

          const newTarget = newUndo.length ? newUndo[newUndo.length - 1] : -1;
          replayWhiteboardToSnapshotIndex(newTarget);
          return newUndo;
      });
  };

  redoAITurn = () => {
      setAiRedoStack(prev => {
          if (prev.length === 0) return prev;
          const newRedo = [...prev];
          const snapshotToRestore = newRedo.pop()!;
          setAiUndoStack(u => [...u, snapshotToRestore]);
          replayWhiteboardToSnapshotIndex(snapshotToRestore);
          return newRedo;
      });
  };

  // -------------------- User Drawing Undo / Redo --------------------
  const undoUserAction = useCallback(() => {
      if (!fabricCanvasInternalState) return;
      setUserUndoStack(prev => {
          if (prev.length <= 1) return prev; // keep at least one snapshot (initial)
          const newUndo = [...prev];
          const last = newUndo.pop();
          setUserRedoStack(r => [...r, last]);
          const previousState = newUndo[newUndo.length - 1];
          isReplayingRef.current = true;
          fabricCanvasInternalState.loadFromJSON(previousState, () => {
              fabricCanvasInternalState.renderAll();
              isReplayingRef.current = false;
          });
          return newUndo;
      });
  }, [fabricCanvasInternalState]);

  const redoUserAction = useCallback(() => {
      if (!fabricCanvasInternalState) return;
      setUserRedoStack(prev => {
          if (prev.length === 0) return prev;
          const newRedo = [...prev];
          const stateToRestore = newRedo.pop()!;
          setUserUndoStack(u => [...u, stateToRestore]);
          isReplayingRef.current = true;
          fabricCanvasInternalState.loadFromJSON(stateToRestore, () => {
              fabricCanvasInternalState.renderAll();
              isReplayingRef.current = false;
          });
          return newRedo;
      });
  }, [fabricCanvasInternalState]);

  const setFabricCanvas = useCallback((canvas: fabric.Canvas | null) => {
     console.log("[WhiteboardProvider] Setting Fabric Canvas instance in provider state:", canvas ? 'Instance received' : 'Instance cleared');
     setFabricCanvasInternalState(canvas);
     // Also set it in the global Zustand store
     setFabricCanvasInstanceInStore(canvas);
     console.log("[WhiteboardProvider] Fabric Canvas instance also set in Zustand store.");
     setIsCanvasReady(!!canvas); // update readiness flag
  }, [setFabricCanvasInstanceInStore]);

  const dispatchWhiteboardAction = useCallback(async (actionOrActions: WhiteboardAction | WhiteboardAction[]) => {
    const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions];

    // If canvas not ready, queue the actions and return
    if (!fabricCanvasInternalState || !isCanvasReady) {
      console.warn(`[WhiteboardProvider] Canvas not ready. Queuing ${actions.length} actions.`);
      setActionQueue(prev => [...prev, ...actions]);
      return;
    }

    console.log(`[WhiteboardProvider] Dispatching ${actions.length} actions:`, actions);
    let requiresRender = false;

    for (const action of actions) {
      try {
           switch (action.type) {
             case WhiteboardActionType.ADD_OBJECTS:
               // ----- NEW: If incoming objects represent a new MCQ question, clear the previous one -----
               const incomingLooksLikeQuestion = action.objects.some(obj =>
                   obj.metadata?.role === 'question' || obj.kind === 'radio'
               );

               if (incomingLooksLikeQuestion) {
                   // On live dispatch only, reposition new question to top-left
                   if (!isReplayingRef.current) {
                       const questionSpec = action.objects.find(spec => spec.metadata?.role === 'question');
                       if (questionSpec && typeof questionSpec.x === 'number' && typeof questionSpec.y === 'number') {
                           const baseX = questionSpec.x;
                           const baseY = questionSpec.y;
                           action.objects.forEach(spec => {
                               if (typeof spec.x === 'number' && typeof spec.y === 'number') {
                                   spec.x = spec.x - baseX;
                                   spec.y = spec.y - baseY;
                               }
                           });
                       }
                   }

                   // Always clear previous question objects so replay/undo shows correct state
                   const objsToRemove: fabric.Object[] = [];
                   // Clear MCQ question and related feedback objects
                   const questionRelatedRoles = new Set([
                       'question',
                       'option_selector',
                       'option_label',
                       'mcq_feedback_text',
                       'mcq_feedback_mark'
                   ]);

                   fabricCanvasInternalState.getObjects().forEach(obj => {
                       const md = (obj as any).metadata || {};
                       if (md.source === 'assistant') {
                           // Remove any objects matching question roles or feedback roles
                           if (
                               questionRelatedRoles.has(md.role) ||
                               md.role?.startsWith('mcq_') ||
                               md.kind === 'radio_option_group'
                           ) {
                               objsToRemove.push(obj as fabric.Object);
                           }
                       }
                   });

                   if (objsToRemove.length) {
                       console.log(`[WhiteboardProvider] Clearing ${objsToRemove.length} previous question objects before adding new question.`);
                       objsToRemove.forEach(o => fabricCanvasInternalState.remove(o));
                   }
               }

               for (const originalSpec of action.objects) {
                 let specToProcess = { ...originalSpec }; // shallow copy

                 if (action.strategy === 'anchor' && (action as any).anchor_object_id) {
                   const anchorParamsFromAction = action as any; // Cast to any to access fields not yet in strict type
                   specToProcess.metadata = {
                     ...(specToProcess.metadata || {}),
                     relativePlacement: {
                       anchorObjectId: anchorParamsFromAction.anchor_object_id,
                       anchor_object_id: anchorParamsFromAction.anchor_object_id, // for robustness
                       anchorEdgeX: anchorParamsFromAction.anchor_edge_x, // Ensure correct key names
                       objectEdgeX: anchorParamsFromAction.object_edge_x,
                       anchorEdgeY: anchorParamsFromAction.anchor_edge_y,
                       objectEdgeY: anchorParamsFromAction.object_edge_y,
                       offsetXPercent: anchorParamsFromAction.offset_x_pct, // Ensure correct key names
                       offsetYPercent: anchorParamsFromAction.offset_y_pct,
                       // Legacy/alternative names if factory checks for them (can be removed if factory is standardized)
                       anchor_edge_x: anchorParamsFromAction.anchor_edge_x,
                       object_edge_x: anchorParamsFromAction.object_edge_x,
                       anchor_edge_y: anchorParamsFromAction.anchor_edge_y,
                       object_edge_y: anchorParamsFromAction.object_edge_y,
                       offset_x_pct: anchorParamsFromAction.offset_x_pct,
                       offset_y_pct: anchorParamsFromAction.offset_y_pct,
                     }
                   };
                   // Clean up undefined values from relativePlacement to avoid sending e.g. offset_y_pct: undefined
                   Object.keys(specToProcess.metadata.relativePlacement).forEach(key => {
                     if ((specToProcess.metadata!.relativePlacement as any)[key] === undefined) {
                       delete (specToProcess.metadata!.relativePlacement as any)[key];
                     }
                   });
                   console.log('[WhiteboardProvider] ADD_OBJECTS with anchor strategy. Enhanced spec:', JSON.parse(JSON.stringify(specToProcess)));
                 }

                 if (specToProcess.kind === 'latex_svg') {
                   if (specToProcess.metadata?.latex) {
                     try {
                       const htmlSvgString = await renderLatexToSvg(specToProcess.metadata.latex);
                       fabric.loadSVGFromString(htmlSvgString, (loadedObjects: any, options: any) => {
                         const fabricObjects = loadedObjects as fabric.Object[]; // Cast to fabric.Object[]
                         if (fabricObjects && fabricObjects.length > 0) {
                           const group = new fabric.Group(fabricObjects, {
                             left: (typeof specToProcess.x === 'number') ? specToProcess.x : 0,
                             top: (typeof specToProcess.y === 'number') ? specToProcess.y : 0,
                           });

                           const currentSpecX = specToProcess.x; // Capture spec.x for type guarding
                           const currentSpecY = specToProcess.y; // Capture spec.y for type guarding

                           const coordSpec: Partial<CanvasObjectSpec> & { xPct?: number, yPct?: number } = { 
                               ...specToProcess,
                               x: (typeof currentSpecX === 'number') ? currentSpecX : 0,
                               y: (typeof currentSpecY === 'number') ? currentSpecY : 0,
                           }; 

                           if (typeof currentSpecX === 'string' && currentSpecX.endsWith('%')) {
                               coordSpec.xPct = parseFloat(currentSpecX) / 100;
                           }
                           if (typeof currentSpecY === 'string' && currentSpecY.endsWith('%')) {
                               coordSpec.yPct = parseFloat(currentSpecY) / 100;
                           }

                           if (fabricCanvasInternalState && fabricCanvasInternalState.width && fabricCanvasInternalState.height) {
                             const { x: absX, y: absY } = calculateAbsoluteCoords(
                                 coordSpec as any,
                                 fabricCanvasInternalState.width,
                                 fabricCanvasInternalState.height
                             );
                             group.set({ left: absX, top: absY });
                           } else {
                               console.warn('[WhiteboardProvider] Canvas dimensions not available for absolute coordinate calculation for LaTeX object.');
                               group.set({ 
                                   left: coordSpec.xPct ? coordSpec.xPct * (fabricCanvasInternalState?.width || 0) : coordSpec.x,
                                   top: coordSpec.yPct ? coordSpec.yPct * (fabricCanvasInternalState?.height || 0) : coordSpec.y
                               });
                           }
                           
                           (group as any).metadata = { 
                               ...specToProcess.metadata, 
                               id: specToProcess.id, 
                               source: specToProcess.metadata?.source,
                               fabricObject: group,
                               kind: 'latex_svg'
                           };
                           fabricCanvasInternalState.add(group);
                           requiresRender = true;
                         } else {
                           console.warn('[WhiteboardProvider] No objects loaded from SVG/HTML for LaTeX spec:', specToProcess);
                         }
                       });
                     } catch (error) {
                       console.error('[WhiteboardProvider] Error rendering or loading LaTeX SVG/HTML:', error, specToProcess);
                     }
                   } else {
                     console.warn('[WhiteboardProvider] LaTeX SVG spec missing metadata.latex:', specToProcess);
                   }
                 } else if (specToProcess.kind === 'graph_layout') {
                   if (specToProcess.metadata?.layoutSpec && fabricCanvasInternalState) {
                     const layoutSpec = specToProcess.metadata.layoutSpec as { nodes: NodeSpec[], edges: EdgeSpec[], layoutType?: string, graphId?: string };
                     if (layoutSpec.nodes && layoutSpec.edges) {
                       try {
                         const nodePositions = await getGraphLayout(layoutSpec.nodes, layoutSpec.edges, layoutSpec.layoutType || 'layered');
                         const fabricObjectsInGraph: fabric.Object[] = [];
                         const canvas = fabricCanvasInternalState; // Alias for clarity

                         // Create Fabric objects for nodes
                         layoutSpec.nodes.forEach(nodeSpec => {
                           const pos = nodePositions[nodeSpec.id];
                           if (pos) {
                             const nodeRect = new fabric.Rect({
                               left: pos.x,
                               top: pos.y,
                               width: nodeSpec.width,
                               height: nodeSpec.height,
                               fill: 'lightblue', // Default fill
                               stroke: 'blue',    // Default stroke
                               strokeWidth: 2,
                               originX: 'left', 
                               originY: 'top',
                             });
                             const nodeLabel = new fabric.Textbox(nodeSpec.label || nodeSpec.id, {
                               left: pos.x + nodeSpec.width / 2,
                               top: pos.y + nodeSpec.height / 2,
                               width: nodeSpec.width - 10, // Padding
                               fontSize: 16,
                               textAlign: 'center',
                               originX: 'center',
                               originY: 'center',
                               selectable: false,
                             });
                             const nodeGroup = new fabric.Group([nodeRect, nodeLabel], {
                               left: pos.x,
                               top: pos.y,
                               selectable: true,
                               evented: true,
                             });
                             (nodeGroup as any).metadata = {
                               id: nodeSpec.id,
                               kind: 'graph_node',
                               parentGraphId: specToProcess.id,
                               ...(nodeSpec.metadata || {})
                             };
                             fabricObjectsInGraph.push(nodeGroup);
                           }
                         });

                         // Create Fabric objects for edges
                         layoutSpec.edges.forEach(edgeSpec => {
                           const sourcePos = nodePositions[edgeSpec.source];
                           const targetPos = nodePositions[edgeSpec.target];
                           const sourceNode = layoutSpec.nodes.find(n => n.id === edgeSpec.source);
                           const targetNode = layoutSpec.nodes.find(n => n.id === edgeSpec.target);

                           if (sourcePos && targetPos && sourceNode && targetNode) {
                             // Calculate center points of nodes for edge connection
                             const x1 = sourcePos.x + sourceNode.width / 2;
                             const y1 = sourcePos.y + sourceNode.height / 2;
                             const x2 = targetPos.x + targetNode.width / 2;
                             const y2 = targetPos.y + targetNode.height / 2;

                             const edgeLine = new fabric.Line([x1, y1, x2, y2], {
                               stroke: 'gray',
                               strokeWidth: 2,
                               selectable: false,
                               evented: false,
                             });
                             (edgeLine as any).metadata = {
                               id: edgeSpec.id,
                               kind: 'graph_edge',
                               parentGraphId: specToProcess.id,
                               ...(edgeSpec.metadata || {})
                             };
                             fabricObjectsInGraph.push(edgeLine);
                             // TODO: Add arrowheads if needed
                           }
                         });
                         
                         // Optionally, group all created nodes and edges into one encompassing group
                         if (fabricObjectsInGraph.length > 0) {
                           if (specToProcess.metadata?.combineIntoGroup || true) { // Default to grouping them
                               const entireGraphGroup = new fabric.Group(fabricObjectsInGraph, {
                                   left: (specToProcess.x as number) || 0,
                                   top: (specToProcess.y as number) || 0,
                               });
                               (entireGraphGroup as any).metadata = {
                                   id: specToProcess.id,
                                   kind: 'graph_group',
                                   source: specToProcess.metadata?.source,
                                   layoutAlgorithm: layoutSpec.layoutType || 'layered',
                               };
                               canvas.add(entireGraphGroup);
                           } else {
                                fabricObjectsInGraph.forEach(obj => canvas.add(obj));
                           }
                         }

                       } catch (error) {
                         console.error('[WhiteboardProvider] Error processing graph layout:', error, specToProcess);
                       }
                     } else {
                       console.warn('[WhiteboardProvider] Graph layout spec missing nodes or edges:', specToProcess);
                     }
                   } else {
                     console.warn('[WhiteboardProvider] Graph layout spec missing metadata.layoutSpec or canvas not ready:', specToProcess);
                   }
                 } else {
                   createFabricObject(fabricCanvasInternalState, specToProcess as any);
                 }
               }
               // Fade-in for legacy objects (any other kinds)
               for (const spec of action.objects.filter(s => s.kind !== 'latex_svg')) {
                 const added = fabricCanvasInternalState.getObjects().find((o: any) => o.metadata?.id === spec.id);
                 if (added) {
                   added.set({ opacity: 0 });
                   // Animate opacity from 0 to 1 using properties-object signature
                   added.animate(
                     { opacity: 1 },
                     {
                       duration: 300,
                       onChange: () => fabricCanvasInternalState.requestRenderAll(),
                     }
                   );
                 }
               }
               break;
             case WhiteboardActionType.ADD_EPHEMERAL:
               if (fabricCanvasInternalState) {
                 // TODO: Consider a separate, always-on-top canvas for ephemeral objects
                 // For now, add to main canvas but ensure they are not selectable and visually distinct
                 const ephemeralSpec = {
                     ...action.spec,
                     selectable: false,
                     evented: false, // So they don't interfere with main content selection
                     metadata: {
                         ...(action.spec.metadata || {}),
                         isEphemeral: true, // Mark for easier identification/styling
                         id: action.spec.id // Ensure ID is present
                     }
                 };
                 createFabricObject(fabricCanvasInternalState, ephemeralSpec as any);
               }
               break;
             case WhiteboardActionType.DELETE_EPHEMERAL:
               if (fabricCanvasInternalState) {
                 deleteFabricObject(fabricCanvasInternalState, action.id);
               }
               break;
             case WhiteboardActionType.UPDATE_OBJECTS:
                if ((action as any).objects) { // action.objects should be an array of update operations
                  (action as any).objects.forEach((updateOp: any) => {
                    const targetId = updateOp.objectId ?? updateOp.id; // ID from the incoming action
                    console.log(`[WhiteboardProvider] Attempting to find object for update. Target ID: ${targetId}`);

                    const fabricObjectToUpdate = fabricCanvasInternalState.getObjects().find(obj => {
                        const meta = (obj as any).metadata;
                        // Primary check: metadata.id (our application-specific UUID)
                        if (meta && meta.id === targetId) return true;
                        // Fallback check: top-level id (if FabricJS or other logic sets it there)
                        if ((obj as any).id === targetId) return true; 
                        return false;
                    });

                    if (fabricObjectToUpdate) {
                      console.log(`[WhiteboardProvider] Found object to update: Target ID ${targetId}`, fabricObjectToUpdate);
                      const originalStroke = fabricObjectToUpdate.stroke;
                      const updatesToApply = updateOp.updates || {}; // The actual updates dictionary (e.g., { fill: 'blue', yPct: 0.5 })

                      // Ensure metadata and pctCoords exist and are mutable
                      let currentMetadata = JSON.parse(JSON.stringify((fabricObjectToUpdate as any).metadata || {}));
                      currentMetadata.pctCoords = currentMetadata.pctCoords || {};

                      const propsForFabricObject: any = {}; // Accumulates props to be set directly on the Fabric object

                      let needsRecalculationFromPct = false;

                      // Iterate over the keys in updatesToApply
                      for (const key in updatesToApply) {
                        const value = updatesToApply[key];

                        if (key === 'xPct' || key === 'yPct' || key === 'widthPct' || key === 'heightPct') {
                          if (value !== null && value !== undefined) {
                            currentMetadata.pctCoords[key] = value;
                            // Corresponding absolute prop will be derived, so don't set it directly from updatesToApply if Pct is present
                          } else {
                            delete currentMetadata.pctCoords[key];
                          }
                          needsRecalculationFromPct = true;
                        } else if (key === 'x' || key === 'y' || key === 'width' || key === 'height') {
                          if (value !== null && value !== undefined) {
                            // If an absolute value is provided, it takes precedence for direct setting,
                            // and its Pct counterpart in metadata should be cleared.
                            const absPropMap:any = { x: 'left', y: 'top', width: 'width', height: 'height' };
                            const pctPropMap:any = { x: 'xPct', y: 'yPct', width: 'widthPct', height: 'heightPct' };
                            propsForFabricObject[absPropMap[key]] = value;
                            delete currentMetadata.pctCoords[pctPropMap[key]];
                          } else {
                            // If absolute is explicitly nulled (e.g. { x: null } when yPct is set),
                            // it means Pct should drive it. Handled by needsRecalculationFromPct.
                          }
                          needsRecalculationFromPct = true; // Change in abs can affect Pct interpretation
                        } else if (key === 'metadata') {
                          // Merge incoming metadata, being careful with pctCoords
                          const incomingMetaChanges = value || {};
                          const { pctCoords: incomingPctMeta, ...otherIncomingMeta } = incomingMetaChanges;
                          currentMetadata = { ...currentMetadata, ...otherIncomingMeta };
                          if (incomingPctMeta) {
                            currentMetadata.pctCoords = { ...currentMetadata.pctCoords, ...incomingPctMeta };
                            needsRecalculationFromPct = true;
                          }
                        } else {
                          // Other properties like fill, stroke, etc.
                          propsForFabricObject[key] = value;
                        }
                      }
                      
                      // Update the Fabric object's metadata with the processed currentMetadata
                      (fabricObjectToUpdate as any).metadata = currentMetadata;

                      // If any percentage coordinate/dimension was set or an absolute one that affects it,
                      // recalculate absolute values from the potentially updated metadata.pctCoords.
                      if (needsRecalculationFromPct || 
                          currentMetadata.pctCoords.xPct !== undefined ||
                          currentMetadata.pctCoords.yPct !== undefined ||
                          currentMetadata.pctCoords.widthPct !== undefined ||
                          currentMetadata.pctCoords.heightPct !== undefined
                          ) {
                          
                        const specForCoordCalculation: import('@/lib/types').CanvasObjectSpec = {
                            id: targetId, // targetId is a string
                            kind: (fabricObjectToUpdate as any).kind || currentMetadata.kind || 'unknown', // Provide a kind, required by CanvasObjectSpec
                            metadata: { // Must conform to @/lib/types definition
                                id: currentMetadata.metadataId || targetId, // Ensure metadata.id is a string
                                // pctCoords are not part of metadata in @/lib/types.CanvasObjectSpec, but top-level
                                // Add other fields if calculateAbsoluteCoords or its types depend on them, otherwise keep minimal
                            },
                            // Pass all Pct values from the authoritative currentMetadata.pctCoords
                            xPct: currentMetadata.pctCoords.xPct,
                            yPct: currentMetadata.pctCoords.yPct,
                            widthPct: currentMetadata.pctCoords.widthPct,
                            heightPct: currentMetadata.pctCoords.heightPct,
                            // Pass absolute values from propsForFabricObject ONLY IF their Pct counterpart is NOT in currentMetadata.pctCoords
                            x: (currentMetadata.pctCoords.xPct === undefined && propsForFabricObject.left !== undefined) ? propsForFabricObject.left : undefined,
                            y: (currentMetadata.pctCoords.yPct === undefined && propsForFabricObject.top !== undefined) ? propsForFabricObject.top : undefined,
                            width: (currentMetadata.pctCoords.widthPct === undefined && propsForFabricObject.width !== undefined) ? propsForFabricObject.width : undefined,
                            height: (currentMetadata.pctCoords.heightPct === undefined && propsForFabricObject.height !== undefined) ? propsForFabricObject.height : undefined,
                        };
                        
                        console.log('[WhiteboardProvider] UPDATE_OBJECTS - specForCoordCalculation:', JSON.parse(JSON.stringify(specForCoordCalculation)));

                        const { x: absX, y: absY, width: absWidth, height: absHeight } = calculateAbsoluteCoords(
                            specForCoordCalculation,
                            fabricCanvasInternalState.width!,
                            fabricCanvasInternalState.height!
                        );

                        // Update propsForFabricObject with calculated values, respecting Pct precedence
                        if (currentMetadata.pctCoords.xPct !== undefined || propsForFabricObject.left === undefined) propsForFabricObject.left = absX;
                        if (currentMetadata.pctCoords.yPct !== undefined || propsForFabricObject.top === undefined) propsForFabricObject.top = absY;
                        if (currentMetadata.pctCoords.widthPct !== undefined || propsForFabricObject.width === undefined) propsForFabricObject.width = absWidth;
                        if (currentMetadata.pctCoords.heightPct !== undefined || propsForFabricObject.height === undefined) propsForFabricObject.height = absHeight;
                      }
                      
                      // Remove any undefined properties to avoid issues with obj.set()
                      Object.keys(propsForFabricObject).forEach(k => propsForFabricObject[k] === undefined && delete propsForFabricObject[k]);

                      console.log(`[WhiteboardProvider] Applying final props to ${targetId}:`, JSON.parse(JSON.stringify(propsForFabricObject)));
                      console.log(`[WhiteboardProvider] Object metadata for ${targetId} AFTER update:`, JSON.parse(JSON.stringify((fabricObjectToUpdate as any).metadata)));

                      fabricObjectToUpdate.set(propsForFabricObject);
                      // Flash effect
                      (fabricObjectToUpdate as any).animate('stroke', '#FFFF00', {
                        duration: 150,
                        onChange: fabricCanvasInternalState.requestRenderAll.bind(fabricCanvasInternalState),
                        onComplete: () => {
                          (fabricObjectToUpdate as any).animate('stroke', originalStroke || 'transparent', {
                            duration: 150,
                            onChange: fabricCanvasInternalState.requestRenderAll.bind(fabricCanvasInternalState),
                          });
                        }
                      } as any);
                      
                      console.log(`[WhiteboardProvider] Updated object ${targetId}:`, updateOp.updates ?? updateOp);
                      requiresRender = true;
                    } else {
                      console.warn(`[WhiteboardProvider] Object with ID ${targetId} not found for update.`);
                    }
                  });
                }
                break;
             case WhiteboardActionType.DELETE_OBJECTS:
                if (action.objectIds) {
                  action.objectIds.forEach(objectId => {
                    const fabricObjectToDelete = fabricCanvasInternalState.getObjects().find(obj => (obj as any).id === objectId);
                    if (fabricObjectToDelete) {
                      fabricCanvasInternalState.remove(fabricObjectToDelete);
                      console.log(`[WhiteboardProvider] Deleted object ${objectId}`);
                      requiresRender = true;
                    } else {
                      console.warn(`[WhiteboardProvider] Object with ID ${objectId} not found for deletion.`);
                    }
                  });
                }
                break;
             case WhiteboardActionType.CLEAR_BOARD:
               console.log("[WhiteboardProvider] Clearing whiteboard");
               fabricCanvasInternalState.clear(); // Clears main canvas
               // If there's a separate ephemeral layer or specific Yjs maps to clear, handle here too.
               // For now, just the main canvas clear.
               requiresRender = true;
               break;
             // @ts-expect-error - handle CLEAR_CANVAS variant
             case 'CLEAR_CANVAS':
               console.log("[WhiteboardProvider] Clearing whiteboard (CLEAR_CANVAS)");
               fabricCanvasInternalState.clear();
               requiresRender = true;
               break;
             case 'GROUP_OBJECTS': {
                const objectsToGroup = fabricCanvasInternalState.getObjects().filter((obj: any) => 
                    action.objectIds.includes(obj.metadata?.id)
                );
                if (objectsToGroup.length !== action.objectIds.length) {
                    console.warn(`[WhiteboardProvider] GROUP_OBJECTS: Not all specified object IDs found. Found ${objectsToGroup.length} of ${action.objectIds.length}.`);
                    // Potentially filter out already grouped items if necessary
                }
                if (objectsToGroup.length > 0) {
                    // Remove individual objects from canvas before grouping
                    objectsToGroup.forEach(obj => fabricCanvasInternalState.remove(obj));

                    const group = new fabric.Group(objectsToGroup, {
                        // fabric.js calculates left/top of group based on its contents
                        // an explicit left/top in spec might be for initial absolute placement if desired
                    });
                    // Assign groupId to the group's metadata
                    (group as any).metadata = {
                        ...(group as any).metadata, // Preserve any existing metadata on the group if fabric adds some
                        id: action.groupId, // This is the group's own ID
                        isGroup: true, // Custom flag to identify this as a managed group
                        // store constituent object IDs if needed for ungrouping later
                        // groupedObjectIds: action.objectIds 
                    };
                    fabricCanvasInternalState.add(group);
                    fabricCanvasInternalState.setActiveObject(group); // Optionally make the new group active
                } else {
                    console.warn(`[WhiteboardProvider] GROUP_OBJECTS: No valid objects found to group for groupId ${action.groupId}.`);
                }
                break;
            }
            case 'MOVE_GROUP': {
                const groupToMove = fabricCanvasInternalState.getObjects().find((obj: any) => 
                    obj.metadata?.id === action.groupId && (obj.metadata?.isGroup || obj.type === 'group')
                ) as fabric.Group | undefined;

                if (groupToMove) {
                    groupToMove.set({
                        left: (groupToMove.left ?? 0) + action.dx,
                        top: (groupToMove.top ?? 0) + action.dy,
                    });
                    groupToMove.setCoords(); // Important after position change
                } else {
                    console.warn(`[WhiteboardProvider] MOVE_GROUP: Group with ID ${action.groupId} not found.`);
                }
                break;
            }
            case 'DELETE_GROUP': {
                const groupToDelete = fabricCanvasInternalState.getObjects().find((obj: any) => 
                    obj.metadata?.id === action.groupId && (obj.metadata?.isGroup || obj.type === 'group')
                );
                if (groupToDelete) {
                    // Option 1: Remove the group directly (children are removed with it by fabric)
                    fabricCanvasInternalState.remove(groupToDelete);

                    // Option 2: If ungrouping is needed before deletion (e.g. to return children to canvas)
                    // if (groupToDelete.type === 'group') {
                    //   (groupToDelete as fabric.Group).forEachObject(obj => {
                    //     // fabricCanvasInternalState.add(obj); // Add back to canvas if needed, adjusting coords
                    //   });
                    //   (groupToDelete as fabric.Group).destroy(); // Ungroup
                    //   fabricCanvasInternalState.remove(groupToDelete); // Then remove the empty group
                    // }
                } else {
                    console.warn(`[WhiteboardProvider] DELETE_GROUP: Group with ID ${action.groupId} not found.`);
                }
                break;
            }
            case WhiteboardActionType.HIGHLIGHT_OBJECT:
              if (fabricCanvasInternalState) {
                const { targetObjectId, color = '#FFFF00', pulse } = action as any;
                const obj = fabricCanvasInternalState
                  .getObjects()
                  .find(o => ((o as any).metadata?.id || (o as any).id) === targetObjectId);

                if (obj) {
                  const originalStroke = (obj as any).stroke || 'transparent';
                  const originalShadow = (obj as any).shadow;

                  (obj as any).set('stroke', color);
                  (obj as any).set('strokeWidth', 4);
                  requiresRender = true;

                  const animateBack = () => {
                    (obj as any).animate('stroke', originalStroke, {
                      duration: 300,
                      onChange: fabricCanvasInternalState.requestRenderAll.bind(fabricCanvasInternalState),
                      onComplete: () => {
                        (obj as any).set({ strokeWidth: (obj as any).strokeWidth ?? 1 });
                      },
                    } as any);
                  };

                  if (pulse) {
                    // Pulse animation: repeat highlight twice
                    (obj as any).animate('strokeWidth', 8, {
                      duration: 150,
                      easing: fabric.util.ease.easeInOutQuad,
                      onChange: fabricCanvasInternalState.requestRenderAll.bind(fabricCanvasInternalState),
                      onComplete: () => {
                        (obj as any).animate('strokeWidth', 4, {
                          duration: 150,
                          onChange: fabricCanvasInternalState.requestRenderAll.bind(fabricCanvasInternalState),
                          onComplete: animateBack,
                        } as any);
                      },
                    } as any);
                  } else {
                    // No pulse, just revert after short delay
                    setTimeout(animateBack, 600);
                  }
                } else {
                  console.warn(`[WhiteboardProvider] HIGHLIGHT_OBJECT: Object with ID ${targetObjectId} not found.`);
                }
              }
              break;
             default:
               // type assertion to help TS narrow down 'action'
               const unhandledAction = action as any;
               console.warn(`[WhiteboardProvider] Unhandled action type: ${unhandledAction.type}`);
           }
      } catch (error) {
           console.error("[WhiteboardProvider] Error dispatching whiteboard action:", action, error);
      }
    }

    if (requiresRender) {
      fabricCanvasInternalState.requestRenderAll();
      // After AI actions that modify the board, capture a new history snapshot
      if (!isReplayingRef.current) {
          // TODO: This history batching needs to be carefully managed.
          // For now, let's assume each dispatch of AI actions is a new batch.
          setHistoryBatches(prev => [...prev, actions]);
          setCurrentSnapshotIndex(prev => prev + 1); // This simple increment might need adjustment based on actual snapshot meaning
          // setAiUndoStack(prev => [...prev, historyBatches.length -1]); // This was old logic, needs review
      }
    }

  }, [fabricCanvasInternalState, isCanvasReady]);

  // NEW EFFECT: When canvas becomes ready, flush any queued actions
  useEffect(() => {
     if (isCanvasReady && fabricCanvasInternalState && actionQueue.length > 0) {
        console.log(`[WhiteboardProvider] Processing ${actionQueue.length} queued actions.`);
        const queued = [...actionQueue];
        setActionQueue([]); // clear queue BEFORE processing to avoid recursive queueing
        dispatchWhiteboardAction(queued);
     }
  }, [isCanvasReady, fabricCanvasInternalState, actionQueue, dispatchWhiteboardAction]);

  // -------------------- Snapshot Replay Helpers --------------------
  const replayWhiteboardToSnapshotIndex = useCallback(async (targetIndex: number) => {
      if (!fabricCanvasInternalState) {
          console.warn('[WhiteboardProvider] Cannot replay, canvas not ready.');
          return;
      }
      if (targetIndex < -1 || targetIndex > historyBatches.length - 1) {
          console.warn('[WhiteboardProvider] snapshot index out of bounds:', targetIndex);
          return;
      }

      console.log(`[WhiteboardProvider] Replaying to snapshot index ${targetIndex}`);

      // Clear canvas first
      isReplayingRef.current = true;
      fabricCanvasInternalState.getObjects().forEach(obj => fabricCanvasInternalState.remove(obj));
      fabricCanvasInternalState.discardActiveObject();
      fabricCanvasInternalState.requestRenderAll();
      isReplayingRef.current = false;

      // Apply batches up to targetIndex
      isReplayingRef.current = true;
      for (let i = 0; i <= targetIndex; i++) {
          const batch = historyBatches[i];
          await dispatchWhiteboardAction(batch);
      }
      isReplayingRef.current = false;

      setCurrentSnapshotIndex(targetIndex);
      useSessionStore.setState({ currentWhiteboardSnapshotIndex: targetIndex });
  }, [fabricCanvasInternalState, historyBatches, dispatchWhiteboardAction]);

  const returnToLiveWhiteboard = useCallback(() => {
      replayWhiteboardToSnapshotIndex(historyBatches.length - 1);
  }, [replayWhiteboardToSnapshotIndex, historyBatches]);

  // -------------------- Global Unified Undo / Redo (AI + User action batches) --------------------
  const undoGlobal = useCallback(() => {
      const targetIdx = currentSnapshotIndex - 1;
      if (targetIdx < -1) return;
      replayWhiteboardToSnapshotIndex(targetIdx);
  }, [currentSnapshotIndex, replayWhiteboardToSnapshotIndex]);

  const redoGlobal = useCallback(() => {
      const targetIdx = currentSnapshotIndex + 1;
      if (targetIdx > historyBatches.length - 1) return;
      replayWhiteboardToSnapshotIndex(targetIdx);
  }, [currentSnapshotIndex, historyBatches.length, replayWhiteboardToSnapshotIndex]);

  // The context value will provide the internal state for local consumption if needed,
  // but the primary source for other hooks/services should be the Zustand store.
  const value = { 
      fabricCanvas: fabricCanvasInternalState, 
      setFabricCanvas, 
      dispatchWhiteboardAction, 
      replayWhiteboardToSnapshotIndex, 
      returnToLiveWhiteboard,
      undoUserAction,
      redoUserAction,
      undoAITurn,
      redoAITurn,
      undoGlobal,
      redoGlobal,
      currentSnapshotIndex,
      historyLength: historyBatches.length,
  } as const;

  // ---------- Yjs Integration (Phase-0) ---------- //
  const yjsEnabled = process.env.NEXT_PUBLIC_USE_YJS === 'true';

  // Cast dispatchWhiteboardAction to any to satisfy differing generic params between type modules
  const dispatchForYjs = (a: any) => dispatchWhiteboardAction(a as any);
  const { writeEphemeral, getYjsDoc } = useYjsWhiteboard(
    yjsEnabled,
    dispatchForYjs as any
  ) as any;

  const YjsExtras = {
    writeEphemeral,
  } as const;

  // Augment context value to include ephemeral write helper
  const contextValue = { ...value, ...YjsExtras } as any;

  return (
    <WhiteboardContext.Provider value={contextValue}>
      {children}
    </WhiteboardContext.Provider>
  );
};

export const useWhiteboard = () => {
  const context = useContext(WhiteboardContext);
  if (context === undefined) {
    throw new Error('useWhiteboard must be used within a WhiteboardProvider');
  }
  return context as ReturnType<typeof useWhiteboardInner>;
};

// helper to satisfy TS inference (not exported)
function useWhiteboardInner() {
  return {} as any;
} 