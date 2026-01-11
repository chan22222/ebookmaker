'use client';

import { useState, useCallback } from 'react';
import Editor from '@/components/Editor';
import Preview from '@/components/Preview';
import ImageManager from '@/components/ImageManager';
import MetadataForm from '@/components/MetadataForm';
import ExportPanel from '@/components/ExportPanel';
import Preprocessor from '@/components/Preprocessor';
import type {
  ContentAnalysis,
  GeneratedImage,
  GeneratedMetadata,
  ImageInsertionPoint,
  TitleOption,
  ExportOptions,
} from '@/types';

type Tab = 'preview' | 'images' | 'metadata' | 'export';

const GEMINI_MODELS = [
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview (Recommended)' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
  { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro Preview' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
];

const IMAGE_MODELS = [
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (Recommended)' },
  { id: 'gemini-2.0-flash-exp-image-generation', name: 'Gemini 2.0 Flash Image' },
];

export default function Home() {
  // Content state
  const [content, setContent] = useState('');
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<{ wasChunked: boolean; chunkCount: number } | null>(null);

  // Model selection state
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro-preview');
  const [selectedImageModel, setSelectedImageModel] = useState('gemini-3-pro-image-preview');

  // Image state
  const [imagePoints, setImagePoints] = useState<ImageInsertionPoint[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  // Metadata state
  const [metadata, setMetadata] = useState<GeneratedMetadata | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<TitleOption | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    author: '',
    description: '',
    keywords: [] as string[],
    language: 'ko',
  });

  // Form data change handler
  const handleFormDataChange = useCallback((data: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPreprocessor, setShowPreprocessor] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show toast message
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Analyze content
  const handleAnalyze = useCallback(async () => {
    if (!content.trim()) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, model: selectedModel }),
      });

      const data = await res.json();
      if (data.success) {
        setAnalysis(data.data);
        setImagePoints(data.data.imagePoints || []);
        if (data.meta) {
          setAnalysisMeta(data.meta);
        }
        const chunkMsg = data.meta?.wasChunked
          ? ` (processed in ${data.meta.chunkCount} chunks)`
          : '';
        showToast(`Content analyzed successfully!${chunkMsg}`, 'success');
      } else {
        showToast(data.error || 'Analysis failed', 'error');
      }
    } catch (error) {
      showToast('Analysis failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [content, selectedModel]);

  // Generate image
  const handleGenerateImage = useCallback(async (point: ImageInsertionPoint) => {
    setIsGeneratingImage(true);
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: point.generatedPrompt,
          imageType: point.suggestedType,
          context: point.context,
          model: selectedModel,
          imageModel: selectedImageModel,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedImages((prev) => [
          ...prev.filter((img) => img.id !== point.id),
          {
            id: point.id,
            projectId: '',
            type: point.suggestedType,
            prompt: data.data.prompt,
            position: point.position,
            imageData: data.data.imageData,
            status: 'completed',
          },
        ]);
        showToast('Image generated!', 'success');
      } else {
        showToast(data.error || 'Image generation failed', 'error');
      }
    } catch (error) {
      showToast('Image generation failed', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  }, [selectedModel, selectedImageModel]);

  // Update image prompt
  const handleUpdatePrompt = useCallback((pointId: string, newPrompt: string) => {
    setImagePoints((prev) =>
      prev.map((p) => (p.id === pointId ? { ...p, generatedPrompt: newPrompt } : p))
    );
  }, []);

  // Toggle image approval
  const handleToggleApprove = useCallback((pointId: string) => {
    setImagePoints((prev) =>
      prev.map((p) => (p.id === pointId ? { ...p, approved: !p.approved } : p))
    );
  }, []);

  // Generate metadata
  const handleGenerateMetadata = useCallback(async () => {
    if (!content.trim()) return;

    setIsGeneratingMetadata(true);
    try {
      const res = await fetch('/api/generate/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: formData.language, model: selectedModel }),
      });

      const data = await res.json();
      if (data.success) {
        setMetadata(data.data);
        if (data.data.titles.length > 0) {
          setSelectedTitle(data.data.titles[0]);
          setFormData((prev) => ({
            ...prev,
            title: data.data.titles[0].title,
            subtitle: data.data.titles[0].subtitle || '',
            description: data.data.description,
            keywords: data.data.keywords,
          }));
        }
        showToast('Metadata generated!', 'success');
      } else {
        showToast(data.error || 'Metadata generation failed', 'error');
      }
    } catch (error) {
      showToast('Metadata generation failed', 'error');
    } finally {
      setIsGeneratingMetadata(false);
    }
  }, [content, formData.language, selectedModel]);

  // Update metadata (legacy support)
  const handleUpdateMetadata = useCallback((field: string, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Prepare content with images for export
  const getContentWithImages = useCallback(() => {
    // Get approved image points that have generated images
    const approvedImages = imagePoints
      .filter((point) => point.approved)
      .map((point) => {
        const image = generatedImages.find((img) => img.id === point.id);
        return image ? { point, image } : null;
      })
      .filter((item): item is { point: ImageInsertionPoint; image: GeneratedImage } => item !== null);

    if (approvedImages.length === 0) {
      return content;
    }

    // Sort by position (descending) to insert from bottom to top
    approvedImages.sort((a, b) => b.point.position.lineNumber - a.point.position.lineNumber);

    const lines = content.split('\n');
    for (const { point, image } of approvedImages) {
      const imageMarkdown = `\n![${point.suggestedType}](${image.imageData})\n`;
      // Insert after the specified line
      const insertIndex = Math.min(point.position.lineNumber, lines.length);
      lines.splice(insertIndex, 0, imageMarkdown);
    }

    return lines.join('\n');
  }, [content, imagePoints, generatedImages]);

  // Export
  const handleExport = useCallback(
    async (format: 'pdf' | 'epub', options: Partial<ExportOptions>) => {
      if (!content.trim()) return;

      setIsExporting(true);
      try {
        // Include images if option is enabled
        const exportContent = options.includeImages !== false ? getContentWithImages() : content;

        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: exportContent,
            format,
            options,
            metadata: {
              title: formData.title || 'Untitled',
              subtitle: formData.subtitle,
              author: formData.author || 'Unknown Author',
              description: formData.description,
              keywords: formData.keywords,
              language: formData.language,
            },
          }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${formData.title || 'ebook'}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`${format.toUpperCase()} exported!`, 'success');
        } else {
          const data = await res.json();
          showToast(data.error || 'Export failed', 'error');
        }
      } catch (error) {
        showToast('Export failed', 'error');
      } finally {
        setIsExporting(false);
      }
    },
    [content, formData, getContentWithImages]
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'preview', label: 'Preview' },
    { id: 'images', label: `Images (${imagePoints.length})` },
    { id: 'metadata', label: 'Metadata' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <main className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">AutoEbook</h1>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Text:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                {GEMINI_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Image:</label>
              <select
                value={selectedImageModel}
                onChange={(e) => setSelectedImageModel(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                {IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="w-1/2 border-r border-gray-200 bg-white">
          <Editor
            content={content}
            onChange={setContent}
            onAnalyze={handleAnalyze}
            isAnalyzing={isAnalyzing}
            onOpenPreprocessor={() => setShowPreprocessor(true)}
          />
        </div>

        {/* Right Panel */}
        <div className="w-1/2 flex flex-col bg-white">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'preview' && (
              <Preview content={content} analysis={analysis} images={generatedImages} analysisMeta={analysisMeta} />
            )}
            {activeTab === 'images' && (
              <ImageManager
                imagePoints={imagePoints}
                generatedImages={generatedImages}
                onGenerateImage={handleGenerateImage}
                onUpdatePrompt={handleUpdatePrompt}
                onToggleApprove={handleToggleApprove}
                isGenerating={isGeneratingImage}
              />
            )}
            {activeTab === 'metadata' && (
              <MetadataForm
                metadata={metadata}
                selectedTitle={selectedTitle}
                onSelectTitle={setSelectedTitle}
                onUpdateMetadata={handleUpdateMetadata}
                onGenerateMetadata={handleGenerateMetadata}
                isGenerating={isGeneratingMetadata}
                formData={formData}
                onFormDataChange={handleFormDataChange}
              />
            )}
            {activeTab === 'export' && (
              <ExportPanel
                onExport={handleExport}
                isExporting={isExporting}
                disabled={!content.trim()}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`toast ${
            toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Preprocessor Modal */}
      {showPreprocessor && (
        <Preprocessor
          content={content}
          onApply={(processedContent) => {
            setContent(processedContent);
            showToast('콘텐츠가 전처리되었습니다', 'success');
          }}
          onClose={() => setShowPreprocessor(false)}
          selectedModel={selectedModel}
          language={formData.language}
        />
      )}
    </main>
  );
}
