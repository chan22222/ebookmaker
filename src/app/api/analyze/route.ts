import { NextRequest, NextResponse } from 'next/server';
import { analyzeContent } from '@/lib/gemini';
import { countWords, estimatePages, extractTableOfContents, needsChunking, splitIntoChunks, CHUNK_SIZE } from '@/lib/analyzer';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { projectId, content, model } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    // Update project status
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'analyzing' },
      });
    }

    // Perform AI analysis with selected model
    const aiAnalysis = await analyzeContent(content, model);

    // Supplement with local analysis
    const wordCount = countWords(content);
    const localTOC = extractTableOfContents(content);

    const analysis = {
      ...aiAnalysis,
      wordCount: wordCount || aiAnalysis.wordCount,
      estimatedPages: estimatePages(wordCount),
      tableOfContents: aiAnalysis.tableOfContents.length > 0
        ? aiAnalysis.tableOfContents
        : localTOC,
    };

    // Save analysis to database
    if (projectId) {
      await prisma.analysis.upsert({
        where: { projectId },
        create: {
          projectId,
          wordCount: analysis.wordCount,
          estimatedPages: analysis.estimatedPages,
          contentType: analysis.contentType,
          tableOfContents: JSON.stringify(analysis.tableOfContents),
          imagePoints: JSON.stringify(analysis.imagePoints),
        },
        update: {
          wordCount: analysis.wordCount,
          estimatedPages: analysis.estimatedPages,
          contentType: analysis.contentType,
          tableOfContents: JSON.stringify(analysis.tableOfContents),
          imagePoints: JSON.stringify(analysis.imagePoints),
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'ready' },
      });
    }

    // Include chunking info for UI
    const wasChunked = needsChunking(content);
    const chunkCount = wasChunked ? splitIntoChunks(content).length : 1;

    return NextResponse.json({
      success: true,
      data: analysis,
      meta: {
        wasChunked,
        chunkCount,
        chunkSize: CHUNK_SIZE,
      },
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed' },
      { status: 500 }
    );
  }
}
