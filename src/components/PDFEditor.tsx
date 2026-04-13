"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";

type Tool = "select" | "draw" | "line" | "rectangle" | "circle" | "text" | "highlight" | "eraser";

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
  const [zoom, setZoom] = useState(100);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const fabricRef = useRef<any>(null);
  const fabricModule = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);
  const activeShapeRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const pdfBytesRef = useRef<Uint8Array>(new Uint8Array(0));
  const pageAnnotationsRef = useRef<Map<number, string>>(new Map());
  const annotationImagesRef = useRef<Map<number, string>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(1);
  const toolRef = useRef<Tool>("draw");
  const colorRef = useRef("#ef4444");
  const strokeWidthRef = useRef(3);
  const isNavigatingRef = useRef(false);
  const isDrawingShapeRef = useRef(false);
  const shapeStartRef = useRef({ x: 0, y: 0 });
  const historyRef = useRef<Map<number, string[]>>(new Map());
  const historyIndexRef = useRef<Map<number, number>>(new Map());
  const isRestoringRef = useRef(false);
  // Store per-page: the scale used when rendering + base PDF page size
  const pageRenderInfoRef = useRef<Map<number, { scale: number; pdfW: number; pdfH: number }>>(new Map());

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  const updateUndoRedoState = useCallback(() => {
    const page = currentPageRef.current;
    const h = historyRef.current.get(page);
    const i = historyIndexRef.current.get(page);
    setCanUndo(!!(h && i !== undefined && i > 0));
    setCanRedo(!!(h && i !== undefined && i < h.length - 1));
  }, []);

  const pushToHistory = useCallback(() => {
    if (isRestoringRef.current || isNavigatingRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const page = currentPageRef.current;
    const objects = canvas.getObjects().map((o: any) => o.toObject()); // eslint-disable-line @typescript-eslint/no-explicit-any
    const state = JSON.stringify(objects);
    if (!historyRef.current.has(page)) {
      historyRef.current.set(page, ["[]"]);
      historyIndexRef.current.set(page, 0);
    }
    const history = historyRef.current.get(page)!;
    history.splice(historyIndexRef.current.get(page)! + 1);
    history.push(state);
    if (history.length > 50) history.shift();
    historyIndexRef.current.set(page, history.length - 1);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => performAutoSave(), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCurrentPageAnnotations = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    const page = currentPageRef.current;
    if (objects.length > 0) {
      const json = objects.map((o: any) => o.toObject()); // eslint-disable-line @typescript-eslint/no-explicit-any
      pageAnnotationsRef.current.set(page, JSON.stringify(json));
      // Export annotation-only image
      const bg = canvas.backgroundImage;
      canvas.backgroundImage = undefined;
      canvas.renderAll();
      annotationImagesRef.current.set(page, canvas.toDataURL({ format: "png" }));
      canvas.backgroundImage = bg;
      canvas.renderAll();
    } else {
      pageAnnotationsRef.current.delete(page);
      annotationImagesRef.current.delete(page);
    }
  }, []);

  const performAutoSave = useCallback(async () => {
    saveCurrentPageAnnotations();
    const images = annotationImagesRef.current;
    const bytes = pdfBytesRef.current;
    if (images.size === 0) {
      const blob = new Blob([bytes.slice()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      return;
    }
    try {
      setSaving(true);
      const doc = await PDFDocument.load(bytes.slice());
      const pages = doc.getPages();
      for (const [pageNum, dataUrl] of images) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        const res = await fetch(dataUrl);
        const pngBytes = new Uint8Array(await res.arrayBuffer());
        const pngImage = await doc.embedPng(pngBytes);
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      }
      const saved = await doc.save();
      const blob = new Blob([saved.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch (err) {
      console.error("Auto-save error:", err);
    } finally {
      setSaving(false);
    }
  }, [saveCurrentPageAnnotations]);

  /**
   * Render a PDF page onto the Fabric canvas.
   * The canvas pixel size = PDF page size * renderScale.
   * renderScale is chosen to fit the container at zoom=100,
   * then multiplied by zoom/100 for zooming.
   */
  const renderPage = useCallback(async (pageNum: number, canvas?: any, fabric?: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const c = canvas || fabricRef.current;
    const f = fabric || fabricModule.current;
    const container = editorContainerRef.current;
    if (!c || !f || !pdfDocRef.current || !container) return;

    isNavigatingRef.current = true;

    const page = await pdfDocRef.current.getPage(pageNum);
    const baseVP = page.getViewport({ scale: 1 });
    const pdfW = baseVP.width;
    const pdfH = baseVP.height;

    // Measure the container. Use window size as fallback if container hasn't laid out yet.
    const containerW = container.clientWidth > 100 ? container.clientWidth : window.innerWidth * 0.6;
    const containerH = container.clientHeight > 100 ? container.clientHeight : window.innerHeight - 60;
    const pad = 40;
    const fitScale = Math.min((containerW - pad) / pdfW, (containerH - pad) / pdfH);

    // Always render canvas at fit-scale (100% zoom equivalent).
    // Visual zoom is handled via CSS transform — canvas pixel count stays constant
    // so drawing performance is the same at any zoom level.
    const renderScale = fitScale;

    const viewport = page.getViewport({ scale: renderScale });

    // Render the PDF page to a temp canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    const ctx = tempCanvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Size the Fabric canvas to match exactly
    c.setDimensions({ width: viewport.width, height: viewport.height });
    // Reset any viewport transform (pan/zoom applied via Fabric itself)
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);

    // Set PDF page as background — temp canvas is already the right pixel size
    const bgImage = await f.FabricImage.fromURL(tempCanvas.toDataURL());
    // Force top-left origin so the image fills from (0,0); default may be center which clips the page
    bgImage.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: 1, scaleY: 1 });

    // Clear old objects, set new background
    c.getObjects().slice().forEach((o: any) => c.remove(o)); // eslint-disable-line @typescript-eslint/no-explicit-any
    c.backgroundImage = bgImage;

    // Store render info for annotation export
    pageRenderInfoRef.current.set(pageNum, { scale: renderScale, pdfW, pdfH });

    // Restore saved annotations (scaled to current render scale)
    const savedJson = pageAnnotationsRef.current.get(pageNum);
    if (savedJson) {
      const objects = JSON.parse(savedJson);
      if (objects.length > 0) {
        const enlivened = await f.util.enlivenObjects(objects);
        enlivened.forEach((obj: any) => c.add(obj)); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    }
    c.renderAll();
    setCanvasSize({ w: viewport.width, h: viewport.height });
    // Scroll editor container back to top so the full page is visible from the start
    container.scrollTop = 0;
    container.scrollLeft = 0;

    // Init history
    if (!historyRef.current.has(pageNum)) {
      const objs = c.getObjects().map((o: any) => o.toObject()); // eslint-disable-line @typescript-eslint/no-explicit-any
      historyRef.current.set(pageNum, [JSON.stringify(objs)]);
      historyIndexRef.current.set(pageNum, 0);
    }
    isNavigatingRef.current = false;
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // --- Load PDF ---
  useEffect(() => {
    const load = async () => {
      pdfBytesRef.current = new Uint8Array(pdfData).slice();
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const dataCopy = pdfBytesRef.current.slice();
      const doc = await pdfjsLib.getDocument({ data: dataCopy }).promise;
      pdfDocRef.current = doc;
      setNumPages(doc.numPages);
      const blob = new Blob([pdfBytesRef.current.slice()], { type: "application/pdf" });
      setPreviewUrl(URL.createObjectURL(blob));
      setReady(true);
    };
    load().catch(err => console.error("Failed to load PDF:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Init Fabric.js ---
  useEffect(() => {
    if (!ready) return;
    const init = async () => {
      const fabric = await import("fabric");
      fabricModule.current = fabric;
      const canvas = new fabric.Canvas(canvasElRef.current!, {
        isDrawingMode: true,
        selection: false,
        enableRetinaScaling: false, // retina doubles pixel count → kills draw perf
        renderOnAddRemove: false,   // batch renders, don't redraw on every add
      });
      const brush = new fabric.PencilBrush(canvas);
      brush.color = colorRef.current;
      brush.width = strokeWidthRef.current;
      brush.decimate = 2; // reduce point simplification overhead for faster input
      canvas.freeDrawingBrush = brush;
      fabricRef.current = canvas;

      const onChange = () => {
        if (!isNavigatingRef.current && !isRestoringRef.current) {
          pushToHistory();
          triggerAutoSave();
        }
      };
      canvas.on("object:added", onChange);
      canvas.on("object:modified", onChange);
      canvas.on("object:removed", onChange);

      canvas.on("mouse:down", (opt: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const t = toolRef.current;
        if (t === "eraser") {
          if (opt.target) { canvas.remove(opt.target); canvas.renderAll(); }
          return;
        }
        if (t === "text") {
          if (opt.target && opt.target.type === "i-text") return;
          const p = canvas.getScenePoint(opt.e);
          const text = new fabric.IText("Type here", {
            left: p.x, top: p.y,
            fontSize: Math.max(18, strokeWidthRef.current * 6),
            fill: colorRef.current, fontFamily: "Arial, sans-serif",
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          return;
        }
        if (["rectangle", "circle", "line"].includes(t)) {
          const p = canvas.getScenePoint(opt.e);
          isDrawingShapeRef.current = true;
          shapeStartRef.current = { x: p.x, y: p.y };
          let shape: any; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (t === "rectangle") shape = new fabric.Rect({ left: p.x, top: p.y, width: 0, height: 0, fill: "transparent", stroke: colorRef.current, strokeWidth: strokeWidthRef.current, strokeUniform: true });
          else if (t === "circle") shape = new fabric.Ellipse({ left: p.x, top: p.y, rx: 0, ry: 0, fill: "transparent", stroke: colorRef.current, strokeWidth: strokeWidthRef.current, strokeUniform: true });
          else if (t === "line") shape = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: colorRef.current, strokeWidth: strokeWidthRef.current });
          if (shape) {
            isNavigatingRef.current = true;
            activeShapeRef.current = shape;
            canvas.add(shape);
            isNavigatingRef.current = false;
          }
        }
      });
      canvas.on("mouse:move", (opt: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!isDrawingShapeRef.current || !activeShapeRef.current) return;
        const p = canvas.getScenePoint(opt.e);
        const s = shapeStartRef.current;
        const shape = activeShapeRef.current;
        const t = toolRef.current;
        if (t === "rectangle") shape.set({ left: Math.min(s.x, p.x), top: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
        else if (t === "circle") shape.set({ left: Math.min(s.x, p.x), top: Math.min(s.y, p.y), rx: Math.abs(p.x - s.x) / 2, ry: Math.abs(p.y - s.y) / 2 });
        else if (t === "line") shape.set({ x2: p.x, y2: p.y });
        canvas.renderAll();
      });
      canvas.on("mouse:up", () => {
        if (isDrawingShapeRef.current && activeShapeRef.current) {
          isDrawingShapeRef.current = false;
          activeShapeRef.current = null;
          pushToHistory();
          triggerAutoSave();
        }
      });

      // Wait for layout to settle before measuring container
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await renderPage(1, canvas, fabric);
    };
    init();
    return () => { fabricRef.current?.dispose(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Zoom is applied as a CSS transform — no canvas re-render needed on zoom changes.

  // --- Tool mode ---
  useEffect(() => {
    const canvas = fabricRef.current;
    const fabric = fabricModule.current;
    if (!canvas || !fabric) return;
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = "default";
    canvas.getObjects().forEach((o: any) => o.set({ selectable: false, evented: false })); // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (tool) {
      case "select":
        canvas.selection = true;
        canvas.getObjects().forEach((o: any) => o.set({ selectable: true, evented: true })); // eslint-disable-line @typescript-eslint/no-explicit-any
        break;
      case "draw": {
        canvas.isDrawingMode = true;
        const db = new fabric.PencilBrush(canvas);
        db.color = color; db.width = strokeWidth; db.decimate = 2;
        canvas.freeDrawingBrush = db;
        break;
      }
      case "highlight": {
        canvas.isDrawingMode = true;
        const hb = new fabric.PencilBrush(canvas);
        hb.color = color + "55"; hb.width = Math.max(20, strokeWidth * 6); hb.decimate = 2;
        canvas.freeDrawingBrush = hb;
        break;
      }
      case "eraser": canvas.defaultCursor = "not-allowed"; break;
      case "text":
        canvas.defaultCursor = "text";
        canvas.getObjects().forEach((o: any) => { if (o.type === "i-text") o.set({ selectable: true, evented: true }); }); // eslint-disable-line @typescript-eslint/no-explicit-any
        break;
      case "rectangle": case "circle": case "line":
        canvas.defaultCursor = "crosshair"; break;
    }
    canvas.renderAll();
  }, [tool, color, strokeWidth]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const canvas = fabricRef.current;
      if (canvas) {
        const active = canvas.getActiveObject();
        if (active?.type === "i-text" && active.isEditing) return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); }
        else if (e.key === "s") { e.preventDefault(); handleDownload(); }
        else if (e.key === "=" || e.key === "+") { e.preventDefault(); changeZoom(25); }
        else if (e.key === "-") { e.preventDefault(); changeZoom(-25); }
        else if (e.key === "0") { e.preventDefault(); setZoom(100); }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && canvas && tool === "select") {
        const active = canvas.getActiveObject();
        if (active) { canvas.remove(active); canvas.renderAll(); }
        return;
      }
      const shortcuts: Record<string, Tool> = { v: "select", d: "draw", l: "line", r: "rectangle", c: "circle", t: "text", h: "highlight", e: "eraser" };
      const t = shortcuts[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // --- Scroll wheel zoom ---
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(prev => Math.min(400, Math.max(50, prev + delta)));
      }
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, []);

  const changeZoom = (delta: number) => setZoom(prev => Math.min(400, Math.max(50, prev + delta)));

  const goToPage = useCallback(async (page: number) => {
    if (page < 1 || page > numPages || page === currentPageRef.current) return;
    saveCurrentPageAnnotations();
    setCurrentPage(page);
    await renderPage(page);
  }, [numPages, saveCurrentPageAnnotations, renderPage]);

  const restoreState = useCallback(async (state: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModule.current;
    if (!canvas || !fabric) return;
    isRestoringRef.current = true;
    isNavigatingRef.current = true;
    const bg = canvas.backgroundImage;
    canvas.getObjects().slice().forEach((o: any) => canvas.remove(o)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const objects = JSON.parse(state);
    if (objects.length > 0) {
      const enlivened = await fabric.util.enlivenObjects(objects);
      enlivened.forEach((obj: any) => canvas.add(obj)); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    canvas.backgroundImage = bg;
    canvas.renderAll();
    isRestoringRef.current = false;
    isNavigatingRef.current = false;
    updateUndoRedoState();
    triggerAutoSave();
  }, [updateUndoRedoState, triggerAutoSave]);

  const handleUndo = useCallback(async () => {
    const p = currentPageRef.current;
    const h = historyRef.current.get(p), i = historyIndexRef.current.get(p);
    if (!h || i === undefined || i <= 0) return;
    historyIndexRef.current.set(p, i - 1);
    await restoreState(h[i - 1]);
  }, [restoreState]);

  const handleRedo = useCallback(async () => {
    const p = currentPageRef.current;
    const h = historyRef.current.get(p), i = historyIndexRef.current.get(p);
    if (!h || i === undefined || i >= h.length - 1) return;
    historyIndexRef.current.set(p, i + 1);
    await restoreState(h[i + 1]);
  }, [restoreState]);

  const clearAnnotations = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().slice().forEach((o: any) => canvas.remove(o)); // eslint-disable-line @typescript-eslint/no-explicit-any
    canvas.renderAll();
    pushToHistory(); triggerAutoSave();
  }, [pushToHistory, triggerAutoSave]);

  const handleDownload = useCallback(async () => {
    saveCurrentPageAnnotations();
    const images = annotationImagesRef.current;
    const bytes = pdfBytesRef.current;
    let blob: Blob;
    if (images.size === 0) {
      blob = new Blob([bytes.slice()], { type: "application/pdf" });
    } else {
      const doc = await PDFDocument.load(bytes.slice());
      const pages = doc.getPages();
      for (const [pageNum, dataUrl] of images) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        const res = await fetch(dataUrl);
        const pngBytes = new Uint8Array(await res.arrayBuffer());
        const pngImage = await doc.embedPng(pngBytes);
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      }
      const saved = await doc.save();
      blob = new Blob([saved.buffer as ArrayBuffer], { type: "application/pdf" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName.replace(/\.pdf$/i, "_edited.pdf");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fileName, saveCurrentPageAnnotations]);

  const toolItems: { id: Tool; label: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: "select", label: "Select", shortcut: "V", icon: <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /> },
    { id: "draw", label: "Draw", shortcut: "D", icon: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /> },
    { id: "line", label: "Line", shortcut: "L", icon: <line x1="5" y1="19" x2="19" y2="5" /> },
    { id: "rectangle", label: "Rect", shortcut: "R", icon: <rect x="3" y="3" width="18" height="18" rx="2" /> },
    { id: "circle", label: "Circle", shortcut: "C", icon: <circle cx="12" cy="12" r="10" /> },
    { id: "text", label: "Text", shortcut: "T", icon: <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9.5" y1="4" x2="9.5" y2="20" /><line x1="6" y1="20" x2="13" y2="20" /></> },
    { id: "highlight", label: "Highlight", shortcut: "H", icon: <><path d="M9 11l-6 6v3h9l3-3" /><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></> },
    { id: "eraser", label: "Eraser", shortcut: "E", icon: <><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L15 16" /></> },
  ];

  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff", "#000000"];
  const svgBase = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Left Sidebar */}
      <div className="w-14 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-1 flex-shrink-0">
        {toolItems.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tool === t.id ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title={`${t.label} (${t.shortcut})`}>
            <svg {...svgBase}>{t.icon}</svg>
          </button>
        ))}
        <div className="w-8 h-px bg-slate-700 my-2" />
        <button onClick={handleUndo} disabled={!canUndo} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Undo">
          <svg {...svgBase}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9H3" /></svg>
        </button>
        <button onClick={handleRedo} disabled={!canRedo} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Redo">
          <svg {...svgBase}><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9h9" /></svg>
        </button>
        <button onClick={clearAnnotations} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all" title="Clear">
          <svg {...svgBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-1.5 mb-2">
          {colors.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-white scale-125 shadow-lg" : "border-slate-700 hover:scale-110"}`}
              style={{ backgroundColor: c }} />
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer mt-1" />
        </div>
        <div className="w-8 h-px bg-slate-700 my-1" />
        <div className="flex flex-col items-center gap-1 mb-2">
          <span className="text-[10px] text-slate-400 font-mono">{strokeWidth}px</span>
          <input type="range" min="1" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="w-10"
            style={{ writingMode: "vertical-lr", WebkitAppearance: "slider-vertical", height: 60, width: 14 } as React.CSSProperties} />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 flex-shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="text-sm text-slate-300 truncate font-medium">{fileName}</span>
          </div>
          <div className="w-px h-6 bg-slate-700" />
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-xs text-slate-300 font-mono px-2">Page {currentPage} / {numPages}</span>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="w-px h-6 bg-slate-700" />
          <div className="flex items-center gap-1">
            <button onClick={() => changeZoom(-25)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all" title="Zoom out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
            <button onClick={() => setZoom(100)} className="px-2 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 font-mono transition-all min-w-[48px] text-center" title="Reset zoom">{zoom}%</button>
            <button onClick={() => changeZoom(25)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all" title="Zoom in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
          </div>
          <div className="flex-1" />
          {saving && <div className="flex items-center gap-1.5 mr-2"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" /><span className="text-[11px] text-amber-400">Saving...</span></div>}
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Split View */}
        <div className="flex flex-1 overflow-hidden">
          <div ref={editorContainerRef} className="flex-1 overflow-auto bg-slate-800/30">
            {!ready ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4 text-slate-400">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading PDF...</span>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-center p-4 min-h-full">
                {/* Outer div reserves the zoomed layout space so the container scrolls correctly */}
                <div style={{ width: canvasSize.w * zoom / 100, height: canvasSize.h * zoom / 100, flexShrink: 0 }}>
                  {/* Inner div scales visually — CSS transform doesn't affect layout so we need the outer sizer */}
                  <div
                    className="shadow-2xl shadow-black/50"
                    style={{ transformOrigin: 'top left', transform: `scale(${zoom / 100})` }}
                  >
                    <canvas ref={canvasElRef} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="w-px bg-slate-700 flex-shrink-0" />
          <div className="w-[35%] min-w-[300px] flex flex-col bg-slate-900/50">
            <div className="h-10 flex items-center px-4 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${saving ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <span className="text-xs text-slate-400 font-medium">{saving ? "Updating..." : "Live Preview"}</span>
              </div>
            </div>
            {previewUrl ? (
              <iframe key={previewUrl} src={previewUrl} className="flex-1 w-full bg-white" title="PDF Preview" />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Preview loading...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
