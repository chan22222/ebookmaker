import { NextRequest, NextResponse } from 'next/server';
import { proofreadContent, formatContentWithAI } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { content, language, model, mode } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    if (mode === 'format') {
      // AI formatting only (structure, paragraphs, headings)
      const formatted = await formatContentWithAI(content, language || 'ko', model);
      return NextResponse.json({
        success: true,
        data: {
          correctedContent: formatted,
          changes: [],
          summary: '포맷팅이 완료되었습니다.',
        },
      });
    }

    // Full proofreading (typos, grammar, formatting)
    const result = await proofreadContent(content, language || 'ko', model);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Proofreading error:', error);
    return NextResponse.json(
      { success: false, error: 'Proofreading failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
