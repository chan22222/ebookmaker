import { NextRequest, NextResponse } from 'next/server';
import { generateMetadata } from '@/lib/gemini';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { projectId, content, language, model } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    // Generate metadata using AI with selected model
    const metadata = await generateMetadata(content, language || 'ko', model);

    // Save to project if projectId provided
    if (projectId && metadata.titles.length > 0) {
      const primaryTitle = metadata.titles[0];
      await prisma.project.update({
        where: { id: projectId },
        data: {
          title: primaryTitle.title,
          subtitle: primaryTitle.subtitle,
          description: metadata.description,
          keywords: JSON.stringify(metadata.keywords),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    console.error('Metadata generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Metadata generation failed' },
      { status: 500 }
    );
  }
}
