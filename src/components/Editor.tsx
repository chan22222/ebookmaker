'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  onOpenPreprocessor?: () => void;
}

export default function Editor({
  content,
  onChange,
  onAnalyze,
  isAnalyzing,
  onOpenPreprocessor,
}: EditorProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const textFile = files.find(
        (f) =>
          f.type === 'text/plain' ||
          f.type === 'text/markdown' ||
          f.name.endsWith('.md') ||
          f.name.endsWith('.txt')
      );

      if (textFile) {
        const text = await textFile.text();
        onChange(text);
      }
    },
    [onChange]
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const text = await file.text();
        onChange(text);
      }
    },
    [onChange]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Content Editor</h2>
        <div className="flex gap-2">
          <label className="btn-outline cursor-pointer">
            <input
              type="file"
              accept=".txt,.md,.markdown"
              onChange={handleFileUpload}
              className="hidden"
            />
            Upload
          </label>
          {onOpenPreprocessor && content.trim() && (
            <button
              onClick={onOpenPreprocessor}
              className="btn-outline flex items-center gap-1"
              title="콘텐츠 전처리 (자동 줄바꿈, 목차 감지)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              Format
            </button>
          )}
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing || !content.trim()}
            className="btn-primary"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analyzing...
              </span>
            ) : (
              'Analyze Content'
            )}
          </button>
        </div>
      </div>

      <div
        className={`flex-1 relative overflow-hidden ${
          isDragOver ? 'bg-primary-50 border-2 border-dashed border-primary-400' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minHeight: 0 }}
      >
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary-50/80 z-10">
            <p className="text-primary-600 font-medium">Drop your file here</p>
          </div>
        )}

        <div className="h-full w-full" style={{ display: 'flex', flexDirection: 'column' }}>
          <MDEditor
            value={content}
            onChange={(val) => onChange(val || '')}
            height="100%"
            preview="edit"
            visibleDragbar={false}
            hideToolbar={false}
            style={{ flex: 1, overflow: 'auto' }}
          />
        </div>
      </div>

      {content && (
        <div className="p-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 flex items-center justify-between">
          <span>{content.split(/\s+/).filter(Boolean).length.toLocaleString()} words · {content.length.toLocaleString()} characters</span>
          {content.length > 8000 && (
            <span className="text-blue-500 text-xs" title="Long content will be processed in multiple chunks for better analysis">
              📦 Will be chunked ({Math.ceil(content.length / 8000)} chunks)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
