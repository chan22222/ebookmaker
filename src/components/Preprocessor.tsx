'use client';

import { useState, useEffect, useCallback } from 'react';

interface PreprocessorProps {
  content: string;
  onApply: (processedContent: string) => void;
  onClose: () => void;
  selectedModel?: string;
  language?: string;
}

interface ReadabilityAnalysis {
  issues: string[];
  score: number;
  suggestions: string[];
}

interface PreviewChapter {
  title: string;
  contentPreview: string;
  wordCount: number;
}

interface ProofreadChange {
  original: string;
  corrected: string;
  reason: string;
}

export default function Preprocessor({
  content,
  onApply,
  onClose,
  selectedModel = 'gemini-2.0-flash',
  language = 'ko',
}: PreprocessorProps) {
  const [options, setOptions] = useState({
    autoLineBreak: true,
    detectChapters: true,
    removeExtraSpaces: true,
    fixPunctuation: true,
  });

  const [preview, setPreview] = useState('');
  const [readability, setReadability] = useState<ReadabilityAnalysis | null>(null);
  const [chapters, setChapters] = useState<PreviewChapter[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProofreading, setIsProofreading] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'chapters' | 'changes'>('preview');
  const [proofreadChanges, setProofreadChanges] = useState<ProofreadChange[]>([]);
  const [proofreadSummary, setProofreadSummary] = useState('');

  // Basic preprocessing (local)
  const runBasicPreprocess = useCallback(async () => {
    if (!content) return;

    setIsProcessing(true);
    try {
      const res = await fetch('/api/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, options, analyzeOnly: false }),
      });

      const data = await res.json();
      if (data.success) {
        setPreview(data.processed);
        setReadability(data.readability);
        setChapters(data.chapters || []);
      }
    } catch (error) {
      console.error('Preprocessing error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [content, options]);

  // AI Proofreading (fixes typos, grammar, adds paragraphs)
  const runAIProofread = useCallback(async () => {
    const textToProofread = preview || content;
    if (!textToProofread) return;

    setIsProofreading(true);
    setActiveTab('changes');
    try {
      const res = await fetch('/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textToProofread,
          language,
          model: selectedModel,
          mode: 'proofread',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPreview(data.data.correctedContent);
        setProofreadChanges(data.data.changes || []);
        setProofreadSummary(data.data.summary || '');

        // Re-analyze chapters after proofreading
        const analyzeRes = await fetch('/api/preprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: data.data.correctedContent,
            options: { ...options, autoLineBreak: false, detectChapters: true },
            analyzeOnly: false,
          }),
        });
        const analyzeData = await analyzeRes.json();
        if (analyzeData.success) {
          setReadability(analyzeData.readability);
          setChapters(analyzeData.chapters || []);
        }
      }
    } catch (error) {
      console.error('AI Proofreading error:', error);
    } finally {
      setIsProofreading(false);
    }
  }, [preview, content, language, selectedModel, options]);

  // AI Formatting (structure, paragraphs, headings)
  const runAIFormat = useCallback(async () => {
    const textToFormat = preview || content;
    if (!textToFormat) return;

    setIsProofreading(true);
    try {
      const res = await fetch('/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textToFormat,
          language,
          model: selectedModel,
          mode: 'format',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPreview(data.data.correctedContent);

        // Re-analyze
        const analyzeRes = await fetch('/api/preprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: data.data.correctedContent,
            options: { ...options, autoLineBreak: false },
            analyzeOnly: false,
          }),
        });
        const analyzeData = await analyzeRes.json();
        if (analyzeData.success) {
          setReadability(analyzeData.readability);
          setChapters(analyzeData.chapters || []);
        }
      }
    } catch (error) {
      console.error('AI Formatting error:', error);
    } finally {
      setIsProofreading(false);
    }
  }, [preview, content, language, selectedModel, options]);

  // Run basic preprocessing on mount and option change
  useEffect(() => {
    const debounce = setTimeout(runBasicPreprocess, 300);
    return () => clearTimeout(debounce);
  }, [runBasicPreprocess]);

  const handleApply = () => {
    onApply(preview);
    onClose();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '좋음';
    if (score >= 60) return '보통';
    return '개선 필요';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">콘텐츠 전처리 및 교정</h2>
            <p className="text-sm text-gray-500">자동 줄바꿈, 목차 감지, AI 오탈자 교정</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Options */}
          <div className="w-80 border-r p-4 flex flex-col gap-4 overflow-auto">
            {/* Readability Score */}
            {readability && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">가독성 점수</span>
                  <span className={`text-2xl font-bold ${getScoreColor(readability.score)}`}>
                    {readability.score}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      readability.score >= 80 ? 'bg-green-500' :
                      readability.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${readability.score}%` }}
                  />
                </div>
                <p className={`text-sm ${getScoreColor(readability.score)}`}>
                  {getScoreLabel(readability.score)}
                </p>

                {readability.issues.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-600 mb-1">발견된 문제:</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      {readability.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-red-400">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* AI Processing Buttons */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">AI 교정</h3>

              <button
                onClick={runAIFormat}
                disabled={isProofreading || isProcessing}
                className="w-full p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">📝</span>
                  <div>
                    <p className="text-sm font-medium text-blue-700">AI 포맷팅</p>
                    <p className="text-xs text-blue-500">줄바꿈, 문단 구분, 목차 감지</p>
                  </div>
                </div>
              </button>

              <button
                onClick={runAIProofread}
                disabled={isProofreading || isProcessing}
                className="w-full p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✨</span>
                  <div>
                    <p className="text-sm font-medium text-purple-700">AI 교정</p>
                    <p className="text-xs text-purple-500">오탈자, 문법, 어색한 표현 수정</p>
                  </div>
                </div>
              </button>

              {isProofreading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 p-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  AI 처리 중...
                </div>
              )}
            </div>

            {/* Basic Options */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">기본 전처리</h3>

              <label className="flex items-start gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={options.detectChapters}
                  onChange={(e) => setOptions({ ...options, detectChapters: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">챕터 감지</p>
                  <p className="text-xs text-gray-500">제1장, Chapter 1 등</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={options.removeExtraSpaces}
                  onChange={(e) => setOptions({ ...options, removeExtraSpaces: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">공백 정리</p>
                  <p className="text-xs text-gray-500">불필요한 공백 제거</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={options.fixPunctuation}
                  onChange={(e) => setOptions({ ...options, fixPunctuation: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">문장부호 정리</p>
                  <p className="text-xs text-gray-500">마침표 뒤 공백 등</p>
                </div>
              </label>
            </div>

            {/* Stats */}
            <div className="mt-auto p-3 bg-blue-50 rounded-lg text-sm">
              <div className="flex justify-between text-gray-600">
                <span>원본:</span>
                <span>{content.length.toLocaleString()} 자</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>처리 후:</span>
                <span>{preview.length.toLocaleString()} 자</span>
              </div>
              {chapters.length > 0 && (
                <div className="flex justify-between text-blue-600 font-medium mt-1">
                  <span>챕터:</span>
                  <span>{chapters.length}개</span>
                </div>
              )}
              {proofreadChanges.length > 0 && (
                <div className="flex justify-between text-purple-600 font-medium">
                  <span>수정사항:</span>
                  <span>{proofreadChanges.length}개</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs */}
            <div className="flex border-b px-4">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                미리보기
              </button>
              <button
                onClick={() => setActiveTab('chapters')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'chapters'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                목차 ({chapters.length})
              </button>
              <button
                onClick={() => setActiveTab('changes')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'changes'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                수정사항 ({proofreadChanges.length})
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {isProcessing ? (
                <div className="h-full flex items-center justify-center">
                  <div className="flex items-center gap-2 text-gray-500">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    처리 중...
                  </div>
                </div>
              ) : activeTab === 'preview' ? (
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap h-full overflow-auto leading-relaxed">
                  {preview || '미리보기가 여기에 표시됩니다...'}
                </div>
              ) : activeTab === 'chapters' ? (
                <div className="space-y-3">
                  {chapters.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      감지된 챕터가 없습니다.
                      <br />
                      <span className="text-sm">AI 포맷팅을 실행하면 챕터를 자동으로 감지합니다.</span>
                    </p>
                  ) : (
                    chapters.map((chapter, index) => (
                      <div key={index} className="p-4 bg-white border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-800">
                            {index + 1}. {chapter.title}
                          </h4>
                          <span className="text-xs text-gray-400">
                            {chapter.wordCount.toLocaleString()} 단어
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2">
                          {chapter.contentPreview}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {proofreadSummary && (
                    <div className="p-3 bg-purple-50 rounded-lg text-sm text-purple-700 mb-4">
                      {proofreadSummary}
                    </div>
                  )}
                  {proofreadChanges.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      수정사항이 없습니다.
                      <br />
                      <span className="text-sm">AI 교정을 실행하면 오탈자와 문법 오류를 찾아냅니다.</span>
                    </p>
                  ) : (
                    proofreadChanges.map((change, index) => (
                      <div key={index} className="p-4 bg-white border rounded-lg">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-red-600 line-through mb-1 break-words">
                              {change.original}
                            </p>
                            <p className="text-sm text-green-600 font-medium break-words">
                              {change.corrected}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 border-t pt-2">
                          {change.reason}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500">
            처리된 콘텐츠를 에디터에 적용합니다
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={isProcessing || isProofreading || !preview}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              적용하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
