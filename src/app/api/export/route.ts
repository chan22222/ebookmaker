import { NextRequest, NextResponse } from 'next/server';
import { generatePDF } from '@/lib/pdf-generator';
import { generateEPUB } from '@/lib/epub-generator';
import { extractTableOfContents } from '@/lib/analyzer';
import type { ExportOptions, EbookMetadata, TOCEntry } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, format, options, metadata } = body as {
      content: string;
      format: 'pdf' | 'epub';
      options: Partial<ExportOptions>;
      metadata: Partial<EbookMetadata>;
    };

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    // Default options
    const defaultOptions: ExportOptions = {
      format: format || 'pdf',
      template: 'classic',
      fontSize: 12,
      fontFamily: 'Noto Sans KR',
      pageSize: 'a4',
      margins: { top: 20, bottom: 20, left: 25, right: 25 },
      includeImages: true,
      tocDepth: 3,
    };

    const finalOptions = { ...defaultOptions, ...options };

    // Default metadata
    const defaultMetadata: EbookMetadata = {
      title: 'Untitled Ebook',
      author: 'Unknown Author',
      description: '',
      keywords: [],
      language: 'ko',
    };

    const finalMetadata = { ...defaultMetadata, ...metadata };

    // Extract TOC
    const tableOfContents: TOCEntry[] = extractTableOfContents(content);

    // Generate based on format
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    console.log('Export request:', { format, contentLength: content.length });

    if (format === 'epub') {
      console.log('Generating EPUB...');
      try {
        buffer = await generateEPUB(content, {
          ...finalOptions,
          metadata: finalMetadata,
          tableOfContents,
        });
      } catch (epubError) {
        console.error('EPUB generation error:', epubError);
        throw epubError;
      }
      contentType = 'application/epub+zip';
      filename = `${finalMetadata.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.epub`;
    } else {
      console.log('Generating PDF...');
      try {
        buffer = await generatePDF(content, {
          ...finalOptions,
          metadata: finalMetadata,
          tableOfContents,
        });
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
        throw pdfError;
      }
      contentType = 'application/pdf';
      filename = `${finalMetadata.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.pdf`;
    }

    console.log('Export successful, buffer size:', buffer.length);

    // Return file as response - convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, error: 'Export failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
