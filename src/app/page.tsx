"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const PDFEditor = dynamic(() => import("@/components/PDFEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading editor...</span>
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
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPdfData(e.target?.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (pdfData) {
    return (
      <PDFEditor
        pdfData={pdfData}
        fileName={fileName}
        onClose={() => {
          setPdfData(null);
          setFileName("");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-500"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6" />
            <path d="M9 15l3 3 3-3" />
          </svg>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            PDF Editor
          </h1>
        </div>
        <p className="text-slate-400 text-lg max-w-md">
          Upload a PDF and edit it like a whiteboard. Draw, annotate, and see
          changes live.
        </p>
      </div>

      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative w-full max-w-lg mx-4 p-16 rounded-2xl border-2 border-dashed
          cursor-pointer transition-all duration-300 group
          ${
            isDragging
              ? "border-blue-400 bg-blue-500/10 scale-105"
              : "border-slate-600 hover:border-blue-500 hover:bg-slate-800/50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={`
            w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
            ${isDragging ? "bg-blue-500/20" : "bg-slate-700 group-hover:bg-blue-500/20"}
          `}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-colors ${isDragging ? "text-blue-400" : "text-slate-400 group-hover:text-blue-400"}`}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-white font-semibold text-lg mb-1">
              {isDragging ? "Drop your PDF here" : "Upload PDF"}
            </p>
            <p className="text-slate-500 text-sm">
              Drag and drop or click to browse
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg text-center">
        {[
          {
            icon: (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            ),
            label: "Draw & Annotate",
          },
          {
            icon: (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ),
            label: "Live Preview",
          },
          {
            icon: (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            ),
            label: "Auto-Save to PDF",
          },
        ].map((feature, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="text-blue-400">{feature.icon}</div>
            <span className="text-xs text-slate-400">{feature.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
