'use client';

import { useMemo } from 'react';
import type { ContentAnalysis, GeneratedImage } from '@/types';

interface PreviewProps {
  content: string;
  analysis: ContentAnalysis | null;
  images: GeneratedImage[];
  analysisMeta?: { wasChunked: boolean; chunkCount: number } | null;
}

export default function Preview({ content, analysis, images, analysisMeta }: PreviewProps) {
  const renderedContent = useMemo(() => {
    if (!content) return '';

    let html = content
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-8 mb-3 pb-2 border-b">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-10 mb-4">$1</h1>')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 p-4 rounded-lg my-4 overflow-x-auto"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-600 underline">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full my-4 rounded-lg" />')
      .replace(/^\s*[-*]\s+(.*$)/gm, '<li class="ml-4">$1</li>')
      .replace(/^>\s*(.*$)/gm, '<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4">$1</blockquote>')
      .replace(/\n\n/g, '</p><p class="my-4">')
      .replace(/\n/g, '<br />');

    html = html.replace(/(<li.*?<\/li>)+/g, '<ul class="list-disc my-4">$&</ul>');
    return `<p class="my-4">${html}</p>`;
  }, [content]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Preview</h2>
        {analysis && (
          <div className="flex gap-4 text-sm text-gray-500">
            <span>{analysis.wordCount.toLocaleString()} words</span>
            <span>{analysis.estimatedPages} pages</span>
            <span className="text-gray-400">|</span>
            <span>{analysis.contentType}</span>
            {analysisMeta?.wasChunked && (
              <>
                <span className="text-gray-400">|</span>
                <span className="text-blue-500" title="Content was split into chunks for analysis">
                  📦 {analysisMeta.chunkCount} chunks
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 bg-white">
        {content ? (
          <article
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <p>Enter content in the editor to see preview</p>
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-8 pt-8 border-t">
            <h3 className="text-lg font-semibold mb-4">Generated Images</h3>
            <div className="grid grid-cols-2 gap-4">
              {images.map((img) => (
                <div key={img.id} className="border rounded-lg overflow-hidden">
                  {img.imageData && (
                    <img src={img.imageData} alt={img.prompt} className="w-full h-48 object-cover" />
                  )}
                  <p className="p-2 text-sm text-gray-600 truncate">{img.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {analysis && analysis.tableOfContents.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50 max-h-48 overflow-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Table of Contents</h3>
          <ul className="text-sm space-y-1">
            {analysis.tableOfContents.map((entry) => (
              <li
                key={entry.id}
                style={{ marginLeft: `${(entry.level - 1) * 16}px` }}
                className="text-gray-600 hover:text-primary-600 cursor-pointer"
              >
                {entry.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
