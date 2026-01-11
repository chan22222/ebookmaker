import { NextRequest, NextResponse } from 'next/server';
import { generateImage, refineImagePrompt } from '@/lib/gemini';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { projectId, prompt, imageType, context, imageId, model, imageModel } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Update image status to generating
    if (imageId) {
      await prisma.image.update({
        where: { id: imageId },
        data: { status: 'generating' },
      });
    }

    // Refine prompt if context provided
    let finalPrompt = prompt;
    if (context && imageType) {
      finalPrompt = await refineImagePrompt(prompt, context, imageType, model);
    }

    // Generate image with selected image model
    const imageData = await generateImage(finalPrompt, imageModel);

    if (!imageData) {
      if (imageId) {
        await prisma.image.update({
          where: { id: imageId },
          data: { status: 'failed' },
        });
      }
      return NextResponse.json(
        { success: false, error: 'Image generation failed' },
        { status: 500 }
      );
    }

    // Save to database
    if (imageId) {
      await prisma.image.update({
        where: { id: imageId },
        data: {
          imageData,
          status: 'completed',
          prompt: finalPrompt,
        },
      });
    } else if (projectId) {
      await prisma.image.create({
        data: {
          projectId,
          type: imageType || 'illustration',
          prompt: finalPrompt,
          position: JSON.stringify({ section: 'default', afterParagraph: 0 }),
          imageData,
          status: 'completed',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        imageData,
        prompt: finalPrompt,
      },
    });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Image generation failed' },
      { status: 500 }
    );
  }
}
