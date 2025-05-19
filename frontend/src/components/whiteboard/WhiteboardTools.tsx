import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { Highlighter, HelpCircle, MousePointer, RotateCcw, RotateCw, History, Hand, Download, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWhiteboard } from '@/contexts/WhiteboardProvider';
import { CanvasObjectSpec } from '@/lib/types';
import * as fabric from 'fabric';
import { Slider } from '../ui/slider';

// Simple throttle implementation for pointer pings
function throttleFn(fn: (...args: any[]) => void, wait: number) {
  let last = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

type LearnerTool = 'select' | 'highlight' | 'question_tag' | 'pointer';

const HIGHLIGHT_TTL_MS = 60 * 1000;
const POINTER_TTL_MS = 3 * 1000;
const POINTER_THROTTLE_MS = 100;

const WhiteboardTools: React.FC = () => {
  const { fabricCanvas, undoGlobal, redoGlobal, returnToLiveWhiteboard, currentSnapshotIndex, replayWhiteboardToSnapshotIndex, historyLength } = useWhiteboard() as any;
  const [currentTool, setCurrentTool] = useState<LearnerTool>('select');
  const [highlightColor, setHighlightColor] = useState<string>('rgba(255, 255, 0, 0.4)');
  const [highlightStrokeWidth, setHighlightStrokeWidth] = useState<number>(15);

  const { writeEphemeral } = useWhiteboard() as any;

  const isDrawingHighlight = useRef(false);
  const currentHighlightPath = useRef<fabric.Path | null>(null);

  const throttledWritePointer = useRef(
    throttleFn((x: number, y: number) => {
      const spec: CanvasObjectSpec = {
        id: `user-pointer-${fabricCanvas?.lowerCanvasEl.dataset.userId || 'local'}`,
        kind: 'pointer_ping',
        x,
        y,
        metadata: {
          id: `user-pointer-${fabricCanvas?.lowerCanvasEl.dataset.userId || 'local'}`,
          source: 'user',
          expiresAt: Date.now() + POINTER_TTL_MS,
        }
      };
      writeEphemeral(spec);
    }, POINTER_THROTTLE_MS)
  ).current;

  const handleToolChange = useCallback((tool: LearnerTool) => {
    if (!fabricCanvas) return;
    setCurrentTool(tool);

    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = (tool === 'select');
    fabricCanvas.defaultCursor = (tool === 'select') ? 'default' : 'crosshair';
    fabricCanvas.hoverCursor = (tool === 'select') ? 'move' : 'crosshair';
    fabricCanvas.getObjects().forEach((o: fabric.Object) => o.set({ selectable: tool === 'select' }));

    fabricCanvas.off('mouse:down');
    fabricCanvas.off('mouse:move');
    fabricCanvas.off('mouse:up');

    if (tool === 'highlight') {
      fabricCanvas.on('mouse:down', (o: any) => {
        isDrawingHighlight.current = true;
        const pointer = fabricCanvas.getPointer(o.e);
        const points = [pointer.x, pointer.y, pointer.x, pointer.y];
        currentHighlightPath.current = new fabric.Path(`M ${points[0]} ${points[1]} L ${points[2]} ${points[3]}`, {
          strokeWidth: highlightStrokeWidth,
          fill: null,
          stroke: highlightColor,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        fabricCanvas.add(currentHighlightPath.current);
      });

      fabricCanvas.on('mouse:move', (o: any) => {
        if (!isDrawingHighlight.current || !currentHighlightPath.current) return;
        const pointer = fabricCanvas.getPointer(o.e);
        const path = currentHighlightPath.current.path ?? [];
        path.push(['L', pointer.x, pointer.y]);
        currentHighlightPath.current.set({ path: path });
        fabricCanvas.requestRenderAll();
      });

      fabricCanvas.on('mouse:up', (o: any) => {
        if (!isDrawingHighlight.current || !currentHighlightPath.current) return;
        isDrawingHighlight.current = false;
        currentHighlightPath.current.setCoords();
        
        const specPathStr = (currentHighlightPath.current.path || []).map((seg: any[]) => seg.join(' ')).join(' ');
        const spec: CanvasObjectSpec = {
          id: crypto.randomUUID(),
          kind: 'highlight_stroke',
          points: specPathStr,
          stroke: highlightColor,
          strokeWidth: highlightStrokeWidth,
          metadata: {
            id: crypto.randomUUID(),
            source: 'user',
            expiresAt: Date.now() + HIGHLIGHT_TTL_MS,
          },
        };
        writeEphemeral(spec);
        
        fabricCanvas.remove(currentHighlightPath.current);
        currentHighlightPath.current = null;
      });
    } else if (tool === 'question_tag') {
       fabricCanvas.on('mouse:down', (o: any) => {
        const pointer = fabricCanvas.getPointer(o.e);
        const target = fabricCanvas.findTarget(o.e, false);
        const linkedObjectId = (target as any)?.metadata?.id || null;

        const spec: CanvasObjectSpec = {
          id: crypto.randomUUID(),
          kind: 'question_tag',
          x: pointer.x,
          y: pointer.y,
          metadata: {
            id: crypto.randomUUID(),
            source: 'user',
            linkedObjectId: linkedObjectId,
          }
        };
        writeEphemeral(spec);
      });
    } else if (tool === 'pointer') {
       fabricCanvas.on('mouse:move', (o: any) => {
          const pointer = fabricCanvas.getPointer(o.e);
          throttledWritePointer(pointer.x, pointer.y);
       });
    }

  }, [fabricCanvas, writeEphemeral, highlightColor, highlightStrokeWidth, throttledWritePointer]);

  useEffect(() => {
    return () => {
      if (fabricCanvas) {
        handleToolChange('select');
      }
    };
  }, [fabricCanvas, handleToolChange]);

  const handleUndo = React.useCallback(() => { if (undoGlobal) undoGlobal(); }, [undoGlobal]);
  const handleRedo = React.useCallback(() => { if (redoGlobal) redoGlobal(); }, [redoGlobal]);
  const handleReturnLive = React.useCallback(() => { if (returnToLiveWhiteboard) returnToLiveWhiteboard(); }, [returnToLiveWhiteboard]);

  const [aiVisible, setAiVisible] = useState(true);
  const [userVisible, setUserVisible] = useState(true);
  const toggleAiLayer = useCallback(() => {
    if (!fabricCanvas) return;
    setAiVisible(prev => {
      const show = !prev;
      fabricCanvas.getObjects().forEach((obj: any) => {
        if (obj.metadata?.source === 'assistant') obj.visible = show;
      });
      fabricCanvas.requestRenderAll();
      return show;
    });
  }, [fabricCanvas]);
  const toggleUserLayer = useCallback(() => {
    if (!fabricCanvas) return;
    setUserVisible(prev => {
      const show = !prev;
      fabricCanvas.getObjects().forEach((obj: any) => {
        if (obj.metadata?.isEphemeral) obj.visible = show;
      });
      fabricCanvas.requestRenderAll();
      return show;
    });
  }, [fabricCanvas]);
  const handleExportPng = React.useCallback(() => {
    if (!fabricCanvas) return;
    try {
      const dataUrl = fabricCanvas.toDataURL({ format: 'png', multiplier: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `whiteboard_${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error('[WhiteboardTools] Failed to export PNG:', err);
    }
  }, [fabricCanvas]);

  const onSliderChange = React.useCallback((value: number[]) => {
    if (!value || !value.length) return;
    const idx = value[0];
    replayWhiteboardToSnapshotIndex(idx);
  }, [replayWhiteboardToSnapshotIndex]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      } else if (cmdCtrl && (e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        handleRedo();
      } else if (!cmdCtrl && !e.metaKey && !e.ctrlKey) {
        switch(e.key.toLowerCase()) {
          case 'v': handleToolChange('select'); break;
          case 'h': handleToolChange('highlight'); break;
          case 'q': handleToolChange('question_tag'); break;
          case 'p': handleToolChange('pointer'); break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleToolChange]);

  if (!fabricCanvas) {
    return <div className="p-2 text-center text-muted-foreground">Whiteboard initializing...</div>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-2 p-2 border-b bg-card">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentTool === 'select' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleToolChange('select')}
                className={cn(currentTool === 'select' && 'ring-2 ring-primary')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select / Move (V)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentTool === 'highlight' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleToolChange('highlight')}
                className={cn(currentTool === 'highlight' && 'ring-2 ring-primary')}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Highlight (H)</TooltipContent>
          </Tooltip>
           <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentTool === 'question_tag' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleToolChange('question_tag')}
                className={cn(currentTool === 'question_tag' && 'ring-2 ring-primary')}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Question Tag (Q)</TooltipContent>
          </Tooltip>
           <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentTool === 'pointer' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleToolChange('pointer')}
                className={cn(currentTool === 'pointer' && 'ring-2 ring-primary')}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Laser Pointer (P)</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-grow flex items-center justify-center px-4">
          {/* Timeline Slider */}
          {historyLength > 0 && (
            <div className="w-full max-w-sm flex items-center gap-2">
              <Slider
                min={0}
                max={Math.max(historyLength - 1, 0)}
                value={[Math.max(currentSnapshotIndex, 0)]}
                onValueChange={onSliderChange}
              />
              <span className="text-xs text-muted-foreground w-10 text-right">{currentSnapshotIndex + 1}/{historyLength}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Export PNG */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleExportPng}>
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export as PNG</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleUndo}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleRedo}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y / Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleReturnLive}>
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Return to Live Whiteboard</TooltipContent>
          </Tooltip>

          {/* Layer Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleAiLayer}>
                {aiVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{aiVisible ? 'Hide AI Layer' : 'Show AI Layer'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleUserLayer}>
                {userVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{userVisible ? 'Hide User Layer' : 'Show User Layer'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default WhiteboardTools; 