'use client';

import { useState } from 'react';
import type { ImageInsertionPoint, GeneratedImage } from '@/types';

interface ImageManagerProps {
  imagePoints: ImageInsertionPoint[];
  generatedImages: GeneratedImage[];
  onGenerateImage: (point: ImageInsertionPoint) => Promise<void>;
  onUpdatePrompt: (pointId: string, newPrompt: string) => void;
  onToggleApprove: (pointId: string) => void;
  isGenerating: boolean;
}

export default function ImageManager({
  imagePoints,
  generatedImages,
  onGenerateImage,
  onUpdatePrompt,
  onToggleApprove,
  isGenerating,
}: ImageManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleEditStart = (point: ImageInsertionPoint) => {
    setEditingId(point.id);
    setEditPrompt(point.generatedPrompt);
  };

  const handleEditSave = (pointId: string) => {
    onUpdatePrompt(pointId, editPrompt);
    setEditingId(null);
  };

  const handleGenerate = async (point: ImageInsertionPoint) => {
    setGeneratingId(point.id);
    try {
      await onGenerateImage(point);
    } finally {
      setGeneratingId(null);
    }
  };

  if (imagePoints.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 p-6">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>Analyze content to get image suggestions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Image Points</h2>
        <p className="text-sm text-gray-500 mt-1">
          {imagePoints.filter((p) => p.approved).length} of {imagePoints.length} approved
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {imagePoints.map((point) => {
          const image = generatedImages.find((img) => img.id === point.id);
          const isEditing = editingId === point.id;
          const isThisGenerating = generatingId === point.id;

          return (
            <div key={point.id} className={`border rounded-lg p-4 ${point.approved ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                  {point.suggestedType}
                </span>
                <button
                  onClick={() => onToggleApprove(point.id)}
                  className={`px-2 py-1 text-xs rounded ${point.approved ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}
                >
                  {point.approved ? 'Approved' : 'Approve'}
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{point.context}</p>

              {isEditing ? (
                <div className="mb-3">
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className="input text-sm h-24 resize-none" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleEditSave(point.id)} className="btn-primary text-sm py-1">Save</button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-sm py-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mb-3">
                  <p className="text-sm text-gray-800 bg-gray-50 p-2 rounded">{point.generatedPrompt}</p>
                  <button onClick={() => handleEditStart(point)} className="text-xs text-primary-600 mt-1 hover:underline">Edit prompt</button>
                </div>
              )}

              {image?.imageData ? (
                <div className="mt-3">
                  <img src={image.imageData} alt={point.generatedPrompt} className="w-full h-40 object-cover rounded-lg" />
                  <button onClick={() => handleGenerate(point)} disabled={isGenerating} className="mt-2 text-xs text-primary-600 hover:underline">Regenerate</button>
                </div>
              ) : (
                <button onClick={() => handleGenerate(point)} disabled={isGenerating || isThisGenerating} className="btn-outline w-full text-sm">
                  {isThisGenerating ? 'Generating...' : 'Generate Image'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
