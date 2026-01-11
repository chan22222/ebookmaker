import { NextRequest, NextResponse } from 'next/server';
import {
  preprocessContent,
  analyzeReadability,
  splitByChapters,
  type PreprocessOptions,
} from '@/lib/analyzer';

export async function POST(request: NextRequest) {
  try {
    const { content, options, analyzeOnly } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    // Analyze readability of original content
    const readability = analyzeReadability(content);

    // If only analyzing, return early
    if (analyzeOnly) {
      return NextResponse.json({
        success: true,
        readability,
      });
    }

    // Default options
    const preprocessOptions: PreprocessOptions = {
      autoLineBreak: options?.autoLineBreak ?? true,
      detectChapters: options?.detectChapters ?? true,
      removeExtraSpaces: options?.removeExtraSpaces ?? true,
      fixPunctuation: options?.fixPunctuation ?? true,
    };

    // Process content
    const processed = preprocessContent(content, preprocessOptions);

    // Get chapters from processed content
    const chaptersRaw = splitByChapters(processed);
    const chapters = chaptersRaw.map((ch) => ({
      title: ch.title,
      contentPreview: ch.content.slice(0, 200) + (ch.content.length > 200 ? '...' : ''),
      wordCount: ch.content.split(/\s+/).filter(Boolean).length,
    }));

    // Analyze readability of processed content
    const processedReadability = analyzeReadability(processed);

    return NextResponse.json({
      success: true,
      processed,
      readability: processedReadability,
      originalReadability: readability,
      chapters,
      stats: {
        originalLength: content.length,
        processedLength: processed.length,
        chapterCount: chapters.length,
        improvement: processedReadability.score - readability.score,
      },
    });
  } catch (error) {
    console.error('Preprocessing error:', error);
    return NextResponse.json(
      { success: false, error: 'Preprocessing failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
