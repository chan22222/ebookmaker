import puppeteer from 'puppeteer';
import type { ExportOptions, EbookMetadata, TOCEntry } from '@/types';
import { markdownToHtml } from './analyzer';

interface PDFGeneratorOptions extends ExportOptions {
  metadata: EbookMetadata;
  tableOfContents: TOCEntry[];
}

/**
 * Generate PDF from markdown content
 */
export async function generatePDF(
  markdown: string,
  options: PDFGeneratorOptions
): Promise<Buffer> {
  const html = await markdownToHtml(markdown);
  const fullHtml = buildPDFHtml(html, options);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pageSizeMap: Record<string, { width: string; height: string }> = {
      a4: { width: '210mm', height: '297mm' },
      a5: { width: '148mm', height: '210mm' },
      letter: { width: '8.5in', height: '11in' },
      '6x9': { width: '6in', height: '9in' },
    };

    const pageSize = pageSizeMap[options.pageSize] || pageSizeMap.a4;

    const pdf = await page.pdf({
      width: pageSize.width,
      height: pageSize.height,
      margin: {
        top: `${options.margins.top}mm`,
        bottom: `${options.margins.bottom}mm`,
        left: `${options.margins.left}mm`,
        right: `${options.margins.right}mm`,
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
          ${options.metadata.title}
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Build complete HTML document for PDF generation
 */
function buildPDFHtml(contentHtml: string, options: PDFGeneratorOptions): string {
  const { metadata, tableOfContents, fontFamily, fontSize } = options;

  // TOC uses entry.id directly since it's now generated consistently
  const tocHtml = tableOfContents.length > 0
    ? `
      <div class="toc">
        <h2>목차</h2>
        <ul>
          ${tableOfContents
            .map(
              (entry) => `
            <li class="toc-level-${entry.level}">
              <a href="#${entry.id}">${entry.title}</a>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
      <div class="page-break"></div>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="${metadata.language || 'ko'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: '${fontFamily}', 'Noto Sans KR', sans-serif;
      font-size: ${fontSize}pt;
      line-height: 1.8;
      color: #333;
    }

    .cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 40px;
    }

    .cover h1 {
      font-size: 2.5em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }

    .cover .subtitle {
      font-size: 1.3em;
      color: #666;
      margin-bottom: 2em;
    }

    .cover .author {
      font-size: 1.1em;
      color: #888;
    }

    .page-break {
      page-break-after: always;
    }

    .toc {
      padding: 20px 0;
    }

    .toc h2 {
      font-size: 1.5em;
      margin-bottom: 1em;
      border-bottom: 2px solid #333;
      padding-bottom: 0.5em;
    }

    .toc ul {
      list-style: none;
    }

    .toc li {
      padding: 0.3em 0;
    }

    .toc-level-1 { font-weight: bold; }
    .toc-level-2 { margin-left: 1em; }
    .toc-level-3 { margin-left: 2em; font-size: 0.9em; }

    .toc a {
      color: #333;
      text-decoration: none;
    }

    .toc a:hover {
      text-decoration: underline;
    }

    .content {
      padding: 20px 0;
    }

    .content h1 {
      font-size: 2em;
      margin: 1.5em 0 0.5em;
      page-break-after: avoid;
    }

    .content h2 {
      font-size: 1.5em;
      margin: 1.3em 0 0.4em;
      page-break-after: avoid;
    }

    .content h3 {
      font-size: 1.2em;
      margin: 1em 0 0.3em;
      page-break-after: avoid;
    }

    .content p {
      margin: 1em 0;
      text-align: justify;
      text-indent: 1em;
      line-height: 1.9;
      word-break: keep-all;
      overflow-wrap: break-word;
    }

    .content p:first-of-type {
      text-indent: 0;
    }

    .content img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.5em auto;
      page-break-inside: avoid;
      border-radius: 4px;
    }

    .content figure {
      margin: 1.5em 0;
      page-break-inside: avoid;
    }

    .content figcaption {
      text-align: center;
      font-size: 0.9em;
      color: #666;
      margin-top: 0.5em;
      font-style: italic;
    }

    .content blockquote {
      border-left: 3px solid #ccc;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
      font-style: italic;
    }

    .content pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9em;
      page-break-inside: avoid;
    }

    .content code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
    }

    .content ul, .content ol {
      margin: 0.8em 0;
      padding-left: 2em;
    }

    .content li {
      margin: 0.3em 0;
    }

    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      page-break-inside: avoid;
    }

    .content th, .content td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }

    .content th {
      background: #f5f5f5;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    ${metadata.coverImage ? `<img src="${metadata.coverImage}" alt="Cover" style="max-height: 300px; margin-bottom: 2em;">` : ''}
    <h1>${metadata.title}</h1>
    ${metadata.subtitle ? `<p class="subtitle">${metadata.subtitle}</p>` : ''}
    <p class="author">${metadata.author}</p>
  </div>
  <div class="page-break"></div>

  <!-- Table of Contents -->
  ${tocHtml}

  <!-- Content -->
  <div class="content">
    ${contentHtml}
  </div>
</body>
</html>
  `;
}
