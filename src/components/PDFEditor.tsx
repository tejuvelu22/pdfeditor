"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import Toolbar from "./Toolbar";
import type { Tool } from "./Toolbar";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const RENDER_SCALE = 2;

interface Props {
  pdfData: ArrayBuffer;
  fileName: string;
  onClose: () => void;
}

export default function PDFEditor({ pdfData, fileName, onClose }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Refs
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricModule = useRef<any>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pageAnnotationsRef = useRef<Map<number, string>>(new Map());
  const annotationImagesRef = useRef<Map<number, string>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(1);
  const toolRef = useRef<Tool>("draw");
  const colorRef = useRef("#ef4444");
  const strokeWidthRef = useRef(3);
  const isNavigatingRef = useRef(false);

  // Shape drawing state
  const isDrawingShapeRef = useRef(false);
  const shapeStartRef = useRef({ x: 0, y: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeShapeRef = useRef<any>(null);

  // Undo/Redo
  const historyRef = useRef<Map<number, string[]>>(new Map());
  const historyIndexRef = useRef<Map<number, number>>(new Map());
  const isRestoringRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  // --- Update undo/redo button state ---
  const updateUndoRedoState = useCallback(() => {
    const page = currentPageRef.current;
    const history = historyRef.current.get(page);
    const index = historyIndexRef.current.get(page);
    setCanUndo(!!(history && index !== undefined && index > 0));
    setCanRedo(
      !!(history && index !== undefined && index < history.length - 1)
    );
  }, []);

  // --- Push to history ---
  const pushToHistory = useCallback(() => {
    if (isRestoringRef.current || isNavigatingRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const page = currentPageRef.current;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objects = canvas.getObjects().map((o: any) => o.toObject());
    const state = JSON.stringify(objects);

    if (!historyRef.current.has(page)) {
      historyRef.current.set(page, ["[]"]);
      historyIndexRef.current.set(page, 0);
    }

    const history = historyRef.current.get(page)!;
    let index = historyIndexRef.current.get(page)!;

    // Trim future states
    history.splice(index + 1);
    history.push(state);
    index = history.length - 1;
    historyIndexRef.current.set(page, index);

    // Limit to 50 entries
    if (history.length > 50) {
      history.shift();
      historyIndexRef.current.set(page, history.length - 1);
    }

    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // --- Trigger auto-save (debounced) ---
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save current page annotations ---
  const saveCurrentPageAnnotations = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    const page = currentPageRef.current;

    if (objects.length > 0) {
      // Save fabric objects JSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = objects.map((o: any) => o.toObject());
      pageAnnotationsRef.current.set(page, JSON.stringify(json));

      // Export annotation image without background
      const bg = canvas.backgroundImage;
      const bgColor = canvas.backgroundColor;
      canvas.backgroundImage = undefined;
      canvas.backgroundColor = "rgba(0,0,0,0)";
      canvas.renderAll();
      const dataUrl = canvas.toDataURL({ format: "png" });
      canvas.backgroundImage = bg;
      canvas.backgroundColor = bgColor;
      canvas.renderAll();
      annotationImagesRef.current.set(page, dataUrl);
    } else {
      pageAnnotationsRef.current.delete(page);
      annotationImagesRef.current.delete(page);
    }
  }, []);

  // --- Perform auto-save ---
  const performAutoSave = useCallback(async () => {
    saveCurrentPageAnnotations();

    const images = annotationImagesRef.current;
    if (images.size === 0) {
      const blob = new Blob([pdfData], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      return;
    }

    try {
      setSaving(true);
      const doc = await PDFDocument.load(pdfData);
      const pages = doc.getPages();

      for (const [pageNum, dataUrl] of images) {
        const page = pages[pageNum - 1];
        if (!page) continue;

        const { width, height } = page.getSize();
        const response = await fetch(dataUrl);
        const pngBytes = new Uint8Array(await response.arrayBuffer());
        const pngImage = await doc.embedPng(pngBytes);

        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      }

      const modifiedBytes = await doc.save();
      const blob = new Blob([modifiedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Auto-save error:", err);
    } finally {
      setSaving(false);
    }
  }, [pdfData, saveCurrentPageAnnotations]);

  // --- Render a PDF page on the Fabric canvas ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (pageNum: number, canvas?: any, fabric?: any) => {
      const c = canvas || fabricRef.current;
      const f = fabric || fabricModule.current;
      if (!c || !f || !pdfDocRef.current) return;

      isNavigatingRef.current = true;

      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      // Render PDF page to temp canvas
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const ctx = tempCanvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Set canvas dimensions
      c.setDimensions({ width: viewport.width, height: viewport.height });

      // Set as background
      const bgImage = await f.FabricImage.fromURL(tempCanvas.toDataURL());
      bgImage.scaleX = viewport.width / bgImage.width;
      bgImage.scaleY = viewport.height / bgImage.height;

      // Clear and set background
      c.getObjects()
        .slice()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .forEach((o: any) => c.remove(o));
      c.backgroundImage = bgImage;

      // Restore annotations for this page
      const savedJson = pageAnnotationsRef.current.get(pageNum);
      if (savedJson) {
        const objects = JSON.parse(savedJson);
        if (objects.length > 0) {
          const enlivened = await f.util.enlivenObjects(objects);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enlivened.forEach((obj: any) => c.add(obj));
        }
      }

      c.renderAll();

      // Initialize history for this page if needed
      if (!historyRef.current.has(pageNum)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objs = c.getObjects().map((o: any) => o.toObject());
        historyRef.current.set(pageNum, [JSON.stringify(objs)]);
        historyIndexRef.current.set(pageNum, 0);
      }

      isNavigatingRef.current = false;
      updateUndoRedoState();
    },
    [updateUndoRedoState]
  );

  // --- Load PDF document ---
  useEffect(() => {
    const load = async () => {
      const data = new Uint8Array(pdfData);
      const doc = await pdfjsLib.getDocument({ data }).promise;
      pdfDocRef.current = doc;
      setNumPages(doc.numPages);

      // Initial preview
      const blob = new Blob([pdfData], { type: "application/pdf" });
      setPreviewUrl(URL.createObjectURL(blob));

      setReady(true);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfData]);

  // --- Initialize Fabric.js canvas ---
  useEffect(() => {
    if (!ready) return;

    const init = async () => {
      const fabric = await import("fabric");
      fabricModule.current = fabric;

      const canvas = new fabric.Canvas(canvasElRef.current!, {
        isDrawingMode: true,
        selection: false,
      });

      const brush = new fabric.PencilBrush(canvas);
      brush.color = colorRef.current;
      brush.width = strokeWidthRef.current;
      canvas.freeDrawingBrush = brush;

      fabricRef.current = canvas;

      // --- Change listeners ---
      const onChange = () => {
        if (!isNavigatingRef.current && !isRestoringRef.current) {
          pushToHistory();
          triggerAutoSave();
        }
      };
      canvas.on("object:added", onChange);
      canvas.on("object:modified", onChange);
      canvas.on("object:removed", onChange);

      // --- Mouse handlers for shapes, text, eraser ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on("mouse:down", (opt: any) => {
        const currentTool = toolRef.current;

        // Eraser
        if (currentTool === "eraser") {
          const target = opt.target;
          if (target) {
            canvas.remove(target);
            canvas.renderAll();
          }
          return;
        }

        // Text
        if (currentTool === "text") {
          if (opt.target && opt.target.type === "i-text") {
            return; // Let fabric handle clicking existing text
          }
          const pointer = canvas.getScenePoint(opt.e);
          const text = new fabric.IText("Type here", {
            left: pointer.x,
            top: pointer.y,
            fontSize: Math.max(18, strokeWidthRef.current * 6),
            fill: colorRef.current,
            fontFamily: "Arial, sans-serif",
            fontWeight: "normal",
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          return;
        }

        // Shape tools
        if (["rectangle", "circle", "line"].includes(currentTool)) {
          const pointer = canvas.getScenePoint(opt.e);
          isDrawingShapeRef.current = true;
          shapeStartRef.current = { x: pointer.x, y: pointer.y };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let shape: any;

          if (currentTool === "rectangle") {
            shape = new fabric.Rect({
              left: pointer.x,
              top: pointer.y,
              width: 0,
              height: 0,
              fill: "transparent",
              stroke: colorRef.current,
              strokeWidth: strokeWidthRef.current,
              strokeUniform: true,
            });
          } else if (currentTool === "circle") {
            shape = new fabric.Ellipse({
              left: pointer.x,
              top: pointer.y,
              rx: 0,
              ry: 0,
              fill: "transparent",
              stroke: colorRef.current,
              strokeWidth: strokeWidthRef.current,
              strokeUniform: true,
            });
          } else if (currentTool === "line") {
            shape = new fabric.Line(
              [pointer.x, pointer.y, pointer.x, pointer.y],
              {
                stroke: colorRef.current,
                strokeWidth: strokeWidthRef.current,
              }
            );
          }

          if (shape) {
            isNavigatingRef.current = true; // Suppress changes while drawing
            activeShapeRef.current = shape;
            canvas.add(shape);
            isNavigatingRef.current = false;
          }
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on("mouse:move", (opt: any) => {
        if (!isDrawingShapeRef.current || !activeShapeRef.current) return;

        const pointer = canvas.getScenePoint(opt.e);
        const start = shapeStartRef.current;
        const shape = activeShapeRef.current;
        const currentTool = toolRef.current;

        if (currentTool === "rectangle") {
          shape.set({
            left: Math.min(start.x, pointer.x),
            top: Math.min(start.y, pointer.y),
            width: Math.abs(pointer.x - start.x),
            height: Math.abs(pointer.y - start.y),
          });
        } else if (currentTool === "circle") {
          shape.set({
            left: Math.min(start.x, pointer.x),
            top: Math.min(start.y, pointer.y),
            rx: Math.abs(pointer.x - start.x) / 2,
            ry: Math.abs(pointer.y - start.y) / 2,
          });
        } else if (currentTool === "line") {
          shape.set({ x2: pointer.x, y2: pointer.y });
        }

        canvas.renderAll();
      });

      canvas.on("mouse:up", () => {
        if (isDrawingShapeRef.current && activeShapeRef.current) {
          isDrawingShapeRef.current = false;
          activeShapeRef.current = null;
          // Trigger save for the completed shape
          pushToHistory();
          triggerAutoSave();
        }
      });

      // Load first page
      await renderPage(1, canvas, fabric);
    };

    init();

    return () => {
      fabricRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // --- Update tool mode ---
  useEffect(() => {
    const canvas = fabricRef.current;
    const fabric = fabricModule.current;
    if (!canvas || !fabric) return;

    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = "default";

    // Make all objects non-selectable by default
    canvas.getObjects().forEach((o: { set: (opts: { selectable: boolean; evented: boolean }) => void }) => {
      o.set({ selectable: false, evented: false });
    });

    switch (tool) {
      case "select":
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.getObjects().forEach((o: { set: (opts: { selectable: boolean; evented: boolean }) => void }) => {
          o.set({ selectable: true, evented: true });
        });
        break;

      case "draw":
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color;
        canvas.freeDrawingBrush.width = strokeWidth;
        break;

      case "highlight":
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color + "55";
        canvas.freeDrawingBrush.width = Math.max(20, strokeWidth * 6);
        break;

      case "eraser":
        canvas.defaultCursor = "crosshair";
        break;

      case "text":
        canvas.defaultCursor = "text";
        canvas.getObjects().forEach((o: { type: string; set: (opts: { selectable: boolean; evented: boolean }) => void }) => {
          if (o.type === "i-text") o.set({ selectable: true, evented: true });
        });
        break;

      case "rectangle":
      case "circle":
      case "line":
        canvas.defaultCursor = "crosshair";
        break;
    }

    canvas.renderAll();
  }, [tool, color, strokeWidth]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in text
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      // Check if editing text on canvas
      const canvas = fabricRef.current;
      if (canvas) {
        const active = canvas.getActiveObject();
        if (active && active.type === "i-text" && active.isEditing) return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          redo();
        } else if (e.key === "s") {
          e.preventDefault();
          handleDownload();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (canvas && tool === "select") {
          const active = canvas.getActiveObject();
          if (active) {
            canvas.remove(active);
            canvas.renderAll();
          }
        }
        return;
      }

      const shortcuts: Record<string, Tool> = {
        v: "select",
        d: "draw",
        l: "line",
        r: "rectangle",
        c: "circle",
        t: "text",
        h: "highlight",
        e: "eraser",
      };

      const newTool = shortcuts[e.key.toLowerCase()];
      if (newTool) setTool(newTool);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // --- Page navigation ---
  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1 || page > numPages || page === currentPageRef.current)
        return;
      saveCurrentPageAnnotations();
      setCurrentPage(page);
      await renderPage(page);
    },
    [numPages, saveCurrentPageAnnotations, renderPage]
  );

  // --- Undo ---
  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    const fabric = fabricModule.current;
    if (!canvas || !fabric) return;
    const page = currentPageRef.current;

    const history = historyRef.current.get(page);
    const index = historyIndexRef.current.get(page);
    if (!history || index === undefined || index <= 0) return;

    const newIndex = index - 1;
    historyIndexRef.current.set(page, newIndex);
    const state = history[newIndex];

    isRestoringRef.current = true;
    isNavigatingRef.current = true;

    const bg = canvas.backgroundImage;
    canvas
      .getObjects()
      .slice()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .forEach((o: any) => canvas.remove(o));

    const objects = JSON.parse(state);
    if (objects.length > 0) {
      const enlivened = await fabric.util.enlivenObjects(objects);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enlivened.forEach((obj: any) => canvas.add(obj));
    }

    canvas.backgroundImage = bg;
    canvas.renderAll();

    isRestoringRef.current = false;
    isNavigatingRef.current = false;

    updateUndoRedoState();
    triggerAutoSave();
  }, [updateUndoRedoState, triggerAutoSave]);

  // --- Redo ---
  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    const fabric = fabricModule.current;
    if (!canvas || !fabric) return;
    const page = currentPageRef.current;

    const history = historyRef.current.get(page);
    const index = historyIndexRef.current.get(page);
    if (!history || index === undefined || index >= history.length - 1) return;

    const newIndex = index + 1;
    historyIndexRef.current.set(page, newIndex);
    const state = history[newIndex];

    isRestoringRef.current = true;
    isNavigatingRef.current = true;

    const bg = canvas.backgroundImage;
    canvas
      .getObjects()
      .slice()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .forEach((o: any) => canvas.remove(o));

    const objects = JSON.parse(state);
    if (objects.length > 0) {
      const enlivened = await fabric.util.enlivenObjects(objects);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enlivened.forEach((obj: any) => canvas.add(obj));
    }

    canvas.backgroundImage = bg;
    canvas.renderAll();

    isRestoringRef.current = false;
    isNavigatingRef.current = false;

    updateUndoRedoState();
    triggerAutoSave();
  }, [updateUndoRedoState, triggerAutoSave]);

  // --- Clear page annotations ---
  const clearAnnotations = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas
      .getObjects()
      .slice()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .forEach((o: any) => canvas.remove(o));
    canvas.renderAll();

    pushToHistory();
    triggerAutoSave();
  }, [pushToHistory, triggerAutoSave]);

  // --- Download ---
  const handleDownload = useCallback(async () => {
    saveCurrentPageAnnotations();

    const images = annotationImagesRef.current;
    let pdfBlob: Blob;

    if (images.size === 0) {
      pdfBlob = new Blob([pdfData], { type: "application/pdf" });
    } else {
      const doc = await PDFDocument.load(pdfData);
      const pages = doc.getPages();

      for (const [pageNum, dataUrl] of images) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        const response = await fetch(dataUrl);
        const pngBytes = new Uint8Array(await response.arrayBuffer());
        const pngImage = await doc.embedPng(pngBytes);
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      }

      const saved = await doc.save();
      pdfBlob = new Blob([saved.buffer as ArrayBuffer], { type: "application/pdf" });
    }

    const blob = pdfBlob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.pdf$/i, "_edited.pdf");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfData, fileName, saveCurrentPageAnnotations]);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      <Toolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        currentPage={currentPage}
        totalPages={numPages}
        onPageChange={goToPage}
        onUndo={undo}
        onRedo={redo}
        onClear={clearAnnotations}
        onDownload={handleDownload}
        onClose={onClose}
        saving={saving}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Canvas */}
        <div className="flex-1 flex items-center justify-center bg-slate-800/50 overflow-auto p-6">
          {!ready ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading PDF...</span>
            </div>
          ) : (
            <div className="canvas-container">
              <canvas ref={canvasElRef} />
            </div>
          )}
        </div>

        {/* Resizable Divider */}
        <div className="w-1 bg-slate-700 hover:bg-blue-500 transition-colors cursor-col-resize flex-shrink-0" />

        {/* Live Preview */}
        <div className="w-[38%] min-w-[280px] flex flex-col bg-slate-900">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${saving ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`}
              />
              <span className="text-xs font-medium text-slate-400">
                {saving ? "Updating preview..." : "Live Preview"}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {fileName}
            </span>
          </div>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="flex-1 w-full bg-white"
              title="PDF Preview"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Preview will appear here
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800 border-t border-slate-700 text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          <span>
            Page {currentPage} of {numPages}
          </span>
          <span>Tool: {tool}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Annotations: {annotationImagesRef.current.size} page(s)
          </span>
          <span>Shortcuts: V D L R C T H E | Ctrl+Z/Y</span>
        </div>
      </div>
    </div>
  );
}
