"use client";

export type Tool =
  | "select"
  | "draw"
  | "line"
  | "rectangle"
  | "circle"
  | "text"
  | "highlight"
  | "eraser";

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDownload: () => void;
  onClose: () => void;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ToolIcon({ tool }: { tool: Tool }) {
  switch (tool) {
    case "select":
      return (
        <svg {...svgProps}>
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      );
    case "draw":
      return (
        <svg {...svgProps}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      );
    case "line":
      return (
        <svg {...svgProps}>
          <line x1="5" y1="19" x2="19" y2="5" />
        </svg>
      );
    case "rectangle":
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      );
    case "circle":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case "text":
      return (
        <svg {...svgProps}>
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9.5" y1="4" x2="9.5" y2="20" />
          <line x1="6" y1="20" x2="13" y2="20" />
        </svg>
      );
    case "highlight":
      return (
        <svg {...svgProps}>
          <path d="M9 11l-6 6v3h9l3-3" />
          <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...svgProps}>
          <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L15 16" />
        </svg>
      );
  }
}

const tools: { id: Tool; label: string; shortcut: string }[] = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "draw", label: "Draw", shortcut: "D" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "rectangle", label: "Rect", shortcut: "R" },
  { id: "circle", label: "Circle", shortcut: "C" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "highlight", label: "Highlight", shortcut: "H" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
];

const presetColors = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
  "#000000",
];

export default function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  currentPage,
  totalPages,
  onPageChange,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  onClose,
  saving,
  canUndo,
  canRedo,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
      {/* Tools */}
      <div className="flex items-center bg-slate-900/50 rounded-lg p-0.5 gap-0.5">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              tool === t.id
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
            title={`${t.label} (${t.shortcut})`}
          >
            <ToolIcon tool={t.id} />
            <span className="hidden xl:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-slate-700 mx-1" />

      {/* Color & Width */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {presetColors.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                color === c
                  ? "border-white scale-125"
                  : "border-slate-600 hover:scale-110"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer"
            title="Custom color"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            Size
          </span>
          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="w-16"
          />
          <span className="text-xs text-slate-400 w-4 text-center">
            {strokeWidth}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-slate-700 mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <svg {...svgProps}>
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9H3" />
          </svg>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg {...svgProps}>
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9h9" />
          </svg>
        </button>
        <button
          onClick={onClear}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
          title="Clear page annotations"
        >
          <svg {...svgProps}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-slate-700 mx-1" />

      {/* Page Navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg {...svgProps}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs text-slate-300 font-mono min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg {...svgProps}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status */}
      {saving && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mr-2">
          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          Saving...
        </div>
      )}

      {/* Download */}
      <button
        onClick={onDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 transition-colors"
      >
        <svg {...svgProps} width={14} height={14}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors ml-1"
        title="Close editor"
      >
        <svg {...svgProps}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
