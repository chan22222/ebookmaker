'use client';

import { useState } from 'react';
import type { ExportOptions, PageSize } from '@/types';

interface ExportPanelProps {
  onExport: (format: 'pdf' | 'epub', options: Partial<ExportOptions>) => void;
  isExporting: boolean;
  disabled: boolean;
}

export default function ExportPanel({ onExport, isExporting, disabled }: ExportPanelProps) {
  const [options, setOptions] = useState<Partial<ExportOptions>>({
    template: 'classic',
    fontSize: 12,
    fontFamily: 'Noto Sans KR',
    pageSize: 'a4',
    margins: { top: 20, bottom: 20, left: 25, right: 25 },
    includeImages: true,
    tocDepth: 3,
  });

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Export Settings</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Template */}
        <div>
          <label className="label">Template</label>
          <select
            value={options.template}
            onChange={(e) => updateOption('template', e.target.value)}
            className="input"
          >
            <option value="classic">Classic</option>
            <option value="modern">Modern</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>

        {/* Font Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Font Family</label>
            <select
              value={options.fontFamily}
              onChange={(e) => updateOption('fontFamily', e.target.value)}
              className="input"
            >
              <option value="Noto Sans KR">Noto Sans KR</option>
              <option value="Noto Serif KR">Noto Serif KR</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
            </select>
          </div>
          <div>
            <label className="label">Font Size</label>
            <select
              value={options.fontSize}
              onChange={(e) => updateOption('fontSize', Number(e.target.value))}
              className="input"
            >
              <option value={10}>10pt</option>
              <option value={11}>11pt</option>
              <option value={12}>12pt</option>
              <option value={14}>14pt</option>
            </select>
          </div>
        </div>

        {/* Page Size */}
        <div>
          <label className="label">Page Size</label>
          <select
            value={options.pageSize}
            onChange={(e) => updateOption('pageSize', e.target.value as PageSize)}
            className="input"
          >
            <option value="a4">A4 (210 x 297mm)</option>
            <option value="a5">A5 (148 x 210mm)</option>
            <option value="letter">Letter (8.5 x 11in)</option>
            <option value="6x9">6 x 9 in (Book)</option>
          </select>
        </div>

        {/* Margins */}
        <div>
          <label className="label">Margins (mm)</label>
          <div className="grid grid-cols-4 gap-2">
            {['top', 'bottom', 'left', 'right'].map((side) => (
              <div key={side}>
                <label className="text-xs text-gray-500 capitalize">{side}</label>
                <input
                  type="number"
                  value={options.margins?.[side as keyof typeof options.margins] || 20}
                  onChange={(e) =>
                    updateOption('margins', {
                      ...options.margins!,
                      [side]: Number(e.target.value),
                    })
                  }
                  className="input text-sm"
                  min={0}
                  max={50}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.includeImages}
              onChange={(e) => updateOption('includeImages', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Include generated images</span>
          </label>

          <div>
            <label className="label">TOC Depth</label>
            <select
              value={options.tocDepth}
              onChange={(e) => updateOption('tocDepth', Number(e.target.value))}
              className="input"
            >
              <option value={1}>H1 only</option>
              <option value={2}>H1 - H2</option>
              <option value={3}>H1 - H3</option>
            </select>
          </div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={() => onExport('pdf', options)}
          disabled={disabled || isExporting}
          className="btn-primary w-full"
        >
          {isExporting ? 'Exporting...' : 'Export as PDF'}
        </button>
        <button
          onClick={() => onExport('epub', options)}
          disabled={disabled || isExporting}
          className="btn-outline w-full"
        >
          Export as EPUB
        </button>
      </div>
    </div>
  );
}
