import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  MousePointer2,
  MoveRight,
  Minus,
  Square,
  Pencil,
  Type,
  Undo2,
  Redo2,
  Save,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

type DrawCommand =
  | { type: 'arrow'; from: Point; to: Point; color: string; width: number }
  | { type: 'line'; from: Point; to: Point; color: string; width: number }
  | { type: 'rect'; from: Point; to: Point; color: string; width: number }
  | { type: 'freeform'; points: Point[]; color: string; width: number }
  | { type: 'text'; position: Point; text: string; color: string; fontSize: number };

type Tool = 'select' | 'arrow' | 'line' | 'rect' | 'freeform' | 'text';

interface AnnotationCanvasProps {
  imageSrc: string;
  initialCommands?: DrawCommand[];
  onSave: (annotatedDataUrl: string, commands: DrawCommand[]) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Preset colours & stroke widths
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'White', value: '#ffffff' },
];

const STROKE_WIDTHS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 6 },
];

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawArrowhead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - size * Math.cos(angle - Math.PI / 6),
    to.y - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    to.x - size * Math.cos(angle + Math.PI / 6),
    to.y - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function renderCommand(ctx: CanvasRenderingContext2D, cmd: DrawCommand) {
  ctx.save();
  switch (cmd.type) {
    case 'arrow': {
      ctx.strokeStyle = cmd.color;
      ctx.fillStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cmd.from.x, cmd.from.y);
      ctx.lineTo(cmd.to.x, cmd.to.y);
      ctx.stroke();
      drawArrowhead(ctx, cmd.from, cmd.to, cmd.width * 4);
      break;
    }
    case 'line': {
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cmd.from.x, cmd.from.y);
      ctx.lineTo(cmd.to.x, cmd.to.y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.rect(cmd.from.x, cmd.from.y, cmd.to.x - cmd.from.x, cmd.to.y - cmd.from.y);
      ctx.stroke();
      break;
    }
    case 'freeform': {
      if (cmd.points.length < 2) break;
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
      for (let i = 1; i < cmd.points.length; i++) {
        ctx.lineTo(cmd.points[i].x, cmd.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.fillStyle = cmd.color;
      ctx.font = `${cmd.fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(cmd.text, cmd.position.x, cmd.position.y);
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({ imageSrc, initialCommands, onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<Tool>('arrow');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);

  // History (command pattern)
  const [history, setHistory] = useState<DrawCommand[]>(initialCommands ?? []);
  const [redoStack, setRedoStack] = useState<DrawCommand[]>([]);

  // Drawing-in-progress state
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<Point | null>(null);
  const freeformPointsRef = useRef<Point[]>([]);
  const currentPreviewRef = useRef<DrawCommand | null>(null);

  // Text input state
  const [textInput, setTextInput] = useState<{ position: Point; canvasPos: Point } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // Image / canvas dimensions
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const scaleRef = useRef(1);

  // -----------------------------------------------------------------------
  // Load the source image
  // -----------------------------------------------------------------------

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // -----------------------------------------------------------------------
  // Fit canvas to container while keeping image aspect ratio
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!imageDims || !containerRef.current) return;

    const observe = () => {
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      const scale = Math.min(maxW / imageDims.w, maxH / imageDims.h, 1);
      scaleRef.current = scale;
      setCanvasSize({ w: Math.round(imageDims.w * scale), h: Math.round(imageDims.h * scale) });
    };

    observe();
    const ro = new ResizeObserver(observe);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imageDims]);

  // -----------------------------------------------------------------------
  // Redraw everything
  // -----------------------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    const scale = scaleRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image scaled
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Replay committed commands
    ctx.save();
    ctx.scale(scale, scale);
    for (const cmd of history) {
      renderCommand(ctx, cmd);
    }
    // Draw in-progress preview
    if (currentPreviewRef.current) {
      renderCommand(ctx, currentPreviewRef.current);
    }
    ctx.restore();
  }, [history]);

  useEffect(() => {
    redraw();
  }, [redraw, canvasSize]);

  // -----------------------------------------------------------------------
  // Coordinate helpers
  // -----------------------------------------------------------------------

  const canvasToImage = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scale = scaleRef.current;
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    },
    [],
  );

  const canvasScreenPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Commit a new command
  // -----------------------------------------------------------------------

  const commitCommand = useCallback(
    (cmd: DrawCommand) => {
      setHistory((prev) => [...prev, cmd]);
      setRedoStack([]);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Mouse handlers
  // -----------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === 'select') return;

      const pt = canvasToImage(e);

      if (activeTool === 'text') {
        const screenPt = canvasScreenPos(e);
        setTextInput({ position: pt, canvasPos: screenPt });
        setTextValue('');
        return;
      }

      setIsDrawing(true);
      drawStartRef.current = pt;

      if (activeTool === 'freeform') {
        freeformPointsRef.current = [pt];
      }
    },
    [activeTool, canvasToImage, canvasScreenPos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || activeTool === 'select' || activeTool === 'text') return;
      const pt = canvasToImage(e);
      const start = drawStartRef.current;
      if (!start) return;

      if (activeTool === 'freeform') {
        freeformPointsRef.current.push(pt);
        currentPreviewRef.current = {
          type: 'freeform',
          points: [...freeformPointsRef.current],
          color: activeColor,
          width: strokeWidth,
        };
      } else if (activeTool === 'arrow') {
        currentPreviewRef.current = {
          type: 'arrow',
          from: start,
          to: pt,
          color: activeColor,
          width: strokeWidth,
        };
      } else if (activeTool === 'line') {
        currentPreviewRef.current = {
          type: 'line',
          from: start,
          to: pt,
          color: activeColor,
          width: strokeWidth,
        };
      } else if (activeTool === 'rect') {
        currentPreviewRef.current = {
          type: 'rect',
          from: start,
          to: pt,
          color: activeColor,
          width: strokeWidth,
        };
      }

      redraw();
    },
    [isDrawing, activeTool, activeColor, strokeWidth, canvasToImage, redraw],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      setIsDrawing(false);

      const pt = canvasToImage(e);
      const start = drawStartRef.current;
      if (!start) return;

      currentPreviewRef.current = null;

      if (activeTool === 'freeform') {
        if (freeformPointsRef.current.length >= 2) {
          commitCommand({
            type: 'freeform',
            points: [...freeformPointsRef.current],
            color: activeColor,
            width: strokeWidth,
          });
        }
        freeformPointsRef.current = [];
      } else if (activeTool === 'arrow') {
        commitCommand({ type: 'arrow', from: start, to: pt, color: activeColor, width: strokeWidth });
      } else if (activeTool === 'line') {
        commitCommand({ type: 'line', from: start, to: pt, color: activeColor, width: strokeWidth });
      } else if (activeTool === 'rect') {
        commitCommand({ type: 'rect', from: start, to: pt, color: activeColor, width: strokeWidth });
      }

      drawStartRef.current = null;
    },
    [isDrawing, activeTool, activeColor, strokeWidth, canvasToImage, commitCommand],
  );

  // -----------------------------------------------------------------------
  // Text commit
  // -----------------------------------------------------------------------

  const commitText = useCallback(() => {
    if (textInput && textValue.trim()) {
      commitCommand({
        type: 'text',
        position: textInput.position,
        text: textValue,
        color: activeColor,
        fontSize: strokeWidth * 6,
      });
    }
    setTextInput(null);
    setTextValue('');
  }, [textInput, textValue, activeColor, strokeWidth, commitCommand]);

  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  // -----------------------------------------------------------------------
  // Undo / Redo
  // -----------------------------------------------------------------------

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setHistory((h) => [...h, last]);
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // -----------------------------------------------------------------------
  // Save – render at full resolution
  // -----------------------------------------------------------------------

  const handleSave = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = img.naturalWidth;
    offscreen.height = img.naturalHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    for (const cmd of history) {
      renderCommand(ctx, cmd);
    }

    onSave(offscreen.toDataURL('image/png'), history);
  }, [history, onSave]);

  // -----------------------------------------------------------------------
  // Tool definitions for toolbar
  // -----------------------------------------------------------------------

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: 'Select' },
    { id: 'arrow', icon: <MoveRight size={16} />, label: 'Arrow' },
    { id: 'line', icon: <Minus size={16} />, label: 'Line' },
    { id: 'rect', icon: <Square size={16} />, label: 'Rectangle' },
    { id: 'freeform', icon: <Pencil size={16} />, label: 'Freeform' },
    { id: 'text', icon: <Type size={16} />, label: 'Text' },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/80 border-b border-zinc-700 flex-shrink-0">
        {/* Drawing tools */}
        <div className="flex items-center gap-0.5">
          {tools.map((tool) => (
            <button
              key={tool.id}
              title={tool.label}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center justify-center w-8 h-8 rounded-none border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors ${
                activeTool === tool.id ? 'bg-zinc-700 text-white' : 'bg-transparent'
              }`}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-zinc-700 mx-1" />

        {/* Color swatches */}
        <div className="flex items-center gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => setActiveColor(c.value)}
              className={`w-5 h-5 rounded-none border border-zinc-600 ${
                activeColor === c.value ? 'ring-2 ring-white' : ''
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-zinc-700 mx-1" />

        {/* Stroke width */}
        <div className="flex items-center gap-0.5">
          {STROKE_WIDTHS.map((sw) => (
            <button
              key={sw.value}
              title={sw.label}
              onClick={() => setStrokeWidth(sw.value)}
              className={`flex items-center justify-center w-8 h-8 rounded-none border border-zinc-700 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors ${
                strokeWidth === sw.value ? 'bg-zinc-700 text-white' : 'bg-transparent'
              }`}
            >
              <div
                className="bg-current"
                style={{
                  width: 16,
                  height: sw.value,
                  minHeight: 1,
                }}
              />
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-zinc-700 mx-1" />

        {/* Undo / Redo */}
        <button
          title="Undo (Cmd+Z)"
          onClick={undo}
          disabled={history.length === 0}
          className="flex items-center justify-center w-8 h-8 rounded-none border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Undo2 size={16} />
        </button>
        <button
          title="Redo (Cmd+Shift+Z)"
          onClick={redo}
          disabled={redoStack.length === 0}
          className="flex items-center justify-center w-8 h-8 rounded-none border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Redo2 size={16} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save / Close */}
        <button
          title="Save"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 h-8 rounded-none border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors text-sm"
        >
          <Save size={14} />
          Save
        </button>
        <button
          title="Close"
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-none border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
          backgroundColor: '#111',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="block shadow-lg"
          style={{
            cursor:
              activeTool === 'select'
                ? 'default'
                : activeTool === 'text'
                  ? 'text'
                  : 'crosshair',
          }}
        />

        {/* Floating text input */}
        {textInput && (
          <input
            ref={textInputRef}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') {
                setTextInput(null);
                setTextValue('');
              }
            }}
            onBlur={commitText}
            className="absolute bg-transparent border border-dashed border-zinc-500 text-white outline-none px-1 rounded-none"
            style={{
              left: canvasRef.current
                ? canvasRef.current.getBoundingClientRect().left -
                  (containerRef.current?.getBoundingClientRect().left ?? 0) +
                  textInput.canvasPos.x
                : textInput.canvasPos.x,
              top: canvasRef.current
                ? canvasRef.current.getBoundingClientRect().top -
                  (containerRef.current?.getBoundingClientRect().top ?? 0) +
                  textInput.canvasPos.y
                : textInput.canvasPos.y,
              fontSize: `${strokeWidth * 6 * scaleRef.current}px`,
              color: activeColor,
              minWidth: 60,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default AnnotationCanvas;
export type { DrawCommand };
