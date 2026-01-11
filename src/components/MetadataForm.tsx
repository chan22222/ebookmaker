'use client';

import { useEffect } from 'react';
import type { GeneratedMetadata, TitleOption } from '@/types';

interface MetadataFormProps {
  metadata: GeneratedMetadata | null;
  selectedTitle: TitleOption | null;
  onSelectTitle: (title: TitleOption) => void;
  onUpdateMetadata: (field: string, value: string | string[]) => void;
  onGenerateMetadata: () => void;
  isGenerating: boolean;
  // New props for controlled form
  formData: {
    title: string;
    subtitle: string;
    author: string;
    description: string;
    keywords: string[];
    language: string;
  };
  onFormDataChange: (data: Partial<MetadataFormProps['formData']>) => void;
}

const LANGUAGES = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
];

export default function MetadataForm({
  metadata,
  selectedTitle,
  onSelectTitle,
  onUpdateMetadata,
  onGenerateMetadata,
  isGenerating,
  formData,
  onFormDataChange,
}: MetadataFormProps) {
  // Auto-fill when metadata is generated
  useEffect(() => {
    if (metadata) {
      if (metadata.titles.length > 0 && !formData.title) {
        const firstTitle = metadata.titles[0];
        onFormDataChange({
          title: firstTitle.title,
          subtitle: firstTitle.subtitle || '',
        });
        onSelectTitle(firstTitle);
      }
      if (metadata.description && !formData.description) {
        onFormDataChange({ description: metadata.description });
      }
      if (metadata.keywords.length > 0 && formData.keywords.length === 0) {
        onFormDataChange({ keywords: metadata.keywords });
      }
    }
  }, [metadata]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Metadata & SEO</h2>
        <button
          onClick={onGenerateMetadata}
          disabled={isGenerating}
          className="btn-primary text-sm"
        >
          {isGenerating ? 'Generating...' : 'Auto Generate'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Language Selection */}
        <div>
          <label className="label">Language</label>
          <select
            value={formData.language}
            onChange={(e) => onFormDataChange({ language: e.target.value })}
            className="input"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title Suggestions */}
        {metadata && metadata.titles.length > 0 && (
          <div>
            <label className="label">Suggested Titles</label>
            <div className="space-y-2">
              {metadata.titles.map((title, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelectTitle(title);
                    onFormDataChange({
                      title: title.title,
                      subtitle: title.subtitle || '',
                    });
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedTitle === title
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-800">{title.title}</p>
                  {title.subtitle && (
                    <p className="text-sm text-gray-500">{title.subtitle}</p>
                  )}
                  <span className="text-xs text-primary-600 capitalize">{title.style}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Title */}
        <div>
          <label className="label">Title *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => onFormDataChange({ title: e.target.value })}
            placeholder="Enter book title"
            className="input"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="label">Subtitle</label>
          <input
            type="text"
            value={formData.subtitle}
            onChange={(e) => onFormDataChange({ subtitle: e.target.value })}
            placeholder="Enter subtitle (optional)"
            className="input"
          />
        </div>

        {/* Author */}
        <div>
          <label className="label">Author *</label>
          <input
            type="text"
            value={formData.author}
            onChange={(e) => onFormDataChange({ author: e.target.value })}
            placeholder="Enter author name"
            className="input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => onFormDataChange({ description: e.target.value })}
            placeholder="Book description for marketing"
            rows={4}
            className="input resize-none"
          />
          {metadata?.salesCopy && (
            <p className="mt-2 text-sm text-gray-500 italic">
              Sales Copy: {metadata.salesCopy}
            </p>
          )}
        </div>

        {/* Keywords */}
        <div>
          <label className="label">SEO Keywords</label>
          <textarea
            value={formData.keywords.join(', ')}
            onChange={(e) => onFormDataChange({
              keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
            })}
            placeholder="keyword1, keyword2, keyword3"
            rows={2}
            className="input resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">Separate keywords with commas</p>
        </div>
      </div>
    </div>
  );
}
