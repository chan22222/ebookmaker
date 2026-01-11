import EPub from 'epub-gen-memory';
import type { ExportOptions, EbookMetadata, TOCEntry } from '@/types';
import { markdownToHtml, splitIntoChapters } from './analyzer';

interface EPUBGeneratorOptions extends ExportOptions {
  metadata: EbookMetadata;
  tableOfContents: TOCEntry[];
}

interface Chapter {
  title: string;
  content: string;
}

/**
 * Generate EPUB from markdown content
 */
export async function generateEPUB(
  markdown: string,
  options: EPUBGeneratorOptions
): Promise<Buffer> {
  let chapters = splitIntoChapters(markdown);

  // If no chapters found, create a single chapter with all content
  if (!chapters || chapters.length === 0) {
    chapters = [{
      title: options.metadata.title || 'Content',
      content: markdown,
      level: 1,
    }];
  }

  // Convert each chapter's markdown to HTML
  const htmlChapters: Chapter[] = await Promise.all(
    chapters.map(async (chapter) => ({
      title: chapter.title,
      content: await markdownToHtml(chapter.content || ''),
    }))
  );

  // Build content array for epub-gen (uses 'content' not 'data')
  const epubContent = htmlChapters.map((chapter) => ({
    title: chapter.title,
    content: wrapChapterHtml(chapter.content, chapter.title, options),
  }));

  // Ensure content array is not empty
  if (epubContent.length === 0) {
    epubContent.push({
      title: 'Content',
      content: await markdownToHtml(markdown),
    });
  }

  // Build EPUB options (without content - it goes as second argument)
  const epubOptions = {
    title: options.metadata.title || 'Untitled',
    author: options.metadata.author || 'Unknown',
    publisher: options.metadata.author || 'Unknown',
    cover: options.metadata.coverImage || undefined,
    lang: options.metadata.language || 'ko',
    tocTitle: '목차',
    appendChapterTitles: false,
    css: getEpubCSS(options),
  };

  console.log('EPUB options:', epubOptions);
  console.log('EPUB chapters:', epubContent);

  // Generate EPUB - content is passed as second argument
  const epub = await EPub(epubOptions, epubContent);
  return Buffer.from(epub);
}

/**
 * Wrap chapter content in proper HTML structure
 */
function wrapChapterHtml(
  content: string,
  title: string,
  options: EPUBGeneratorOptions
): string {
  return `
    <h1>${title}</h1>
    ${content}
  `;
}

/**
 * Get CSS for EPUB styling
 */
function getEpubCSS(options: EPUBGeneratorOptions): string {
  return `
    body {
      font-family: '${options.fontFamily}', serif;
      font-size: ${options.fontSize}pt;
      line-height: 1.8;
      color: #333;
      margin: 0;
      padding: 1em;
    }

    h1 {
      font-size: 1.8em;
      margin: 1em 0 0.5em;
      color: #1a1a1a;
      border-bottom: 1px solid #ccc;
      padding-bottom: 0.3em;
    }

    h2 {
      font-size: 1.4em;
      margin: 1em 0 0.4em;
      color: #333;
    }

    h3 {
      font-size: 1.2em;
      margin: 0.8em 0 0.3em;
      color: #444;
    }

    p {
      margin: 1em 0;
      text-align: justify;
      text-indent: 1em;
      line-height: 1.9;
      word-break: keep-all;
      overflow-wrap: break-word;
    }

    p:first-of-type {
      text-indent: 0;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.5em auto;
      border-radius: 4px;
    }

    figure {
      margin: 1.5em 0;
    }

    figcaption {
      text-align: center;
      font-size: 0.9em;
      color: #666;
      margin-top: 0.5em;
      font-style: italic;
    }

    blockquote {
      border-left: 3px solid #ccc;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
      font-style: italic;
    }

    pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85em;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
    }

    ul, ol {
      margin: 0.8em 0;
      padding-left: 2em;
    }

    li {
      margin: 0.3em 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }

    th {
      background: #f5f5f5;
      font-weight: bold;
    }

    a {
      color: #0066cc;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .image-caption {
      text-align: center;
      font-size: 0.9em;
      color: #666;
      margin-top: 0.5em;
    }
  `;
}

/**
 * Validate EPUB content
 */
export function validateEpubContent(markdown: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!markdown || markdown.trim().length === 0) {
    errors.push('Content is empty');
  }

  if (markdown.length < 100) {
    errors.push('Content is too short for an ebook');
  }

  // Check for at least one heading
  if (!/^#{1,6}\s/m.test(markdown)) {
    errors.push('No headings found. Add at least one heading for chapter structure.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
