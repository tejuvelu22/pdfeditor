"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const PDFEditor = dynamic(() => import("@/components/PDFEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400">Loading editor...</span>
      </div>
    </div>
  ),
});

export default function Home() {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setPdfData(e.target?.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  }, []);

  if (pdfData) {
    return (
      <PDFEditor
        pdfData={pdfData}
        fileName={fileName}
        onClose={() => { setPdfData(null); setFileName(""); }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="mb-10 text-center">
          <h1 className="text-5xl font-bold text-white tracking-tight mb-3">
            PDF Editor
          </h1>
          <p className="text-slate-400 text-lg">
            Upload a PDF, draw on it like a whiteboard, download the result.
          </p>
        </div>

        {/* Upload */}
        <div
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`
            w-full max-w-md p-14 rounded-2xl border-2 border-dashed cursor-pointer
            transition-all duration-200 group backdrop-blur-sm
            ${isDragging
              ? "border-blue-400 bg-blue-500/10 scale-[1.02]"
              : "border-slate-700 hover:border-blue-500/60 hover:bg-slate-900/50"
            }
          `}
        >
          <input ref={fileInputRef} type="file" accept="application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden" />
          <div className="flex flex-col items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
              ${isDragging ? "bg-blue-500/20" : "bg-slate-800 group-hover:bg-blue-500/10"}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={`transition-colors ${isDragging ? "text-blue-400" : "text-slate-400 group-hover:text-blue-400"}`}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">
                {isDragging ? "Drop PDF here" : "Upload PDF"}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Drag and drop or click to browse
              </p>
            </div>
          </div>
        </div>

        {/* Feature list */}
        <div className="mt-10 flex gap-8 text-slate-500 text-xs">
          <span>Draw & annotate</span>
          <span>Live preview</span>
          <span>Auto-save to PDF</span>
          <span>Shapes & text</span>
        </div>
      </div>
    </div>
  );
}
