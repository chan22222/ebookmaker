import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import type { TOCEntry } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// Constants for chunking
export const CHUNK_SIZE = 8000; // characters per chunk (safe for most models)
export const CHUNK_OVERLAP = 500; // overlap between chunks to maintain context

/**
 * Chunk information with metadata
 */
export interface ContentChunk {
  index: number;
  content: string;
  startLine: number;
  endLine: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Split content into overlapping chunks for processing
 * Tries to split at paragraph boundaries for cleaner chunks
 */
export function splitIntoChunks(content: string): ContentChunk[] {
  const lines = content.split('\n');
  const chunks: ContentChunk[] = [];

  let currentChunk: string[] = [];
  let currentLength = 0;
  let chunkStartLine = 0;
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    // Check if adding this line would exceed chunk size
    if (currentLength + lineLength > CHUNK_SIZE && currentChunk.length > 0) {
      // Try to find a good split point (empty line or heading)
      let splitIndex = currentChunk.length;
      for (let j = currentChunk.length - 1; j >= Math.floor(currentChunk.length * 0.7); j--) {
        if (currentChunk[j].trim() === '' || /^#{1,6}\s/.test(currentChunk[j])) {
          splitIndex = j + 1;
          break;
        }
      }

      // Create chunk
      const chunkContent = currentChunk.slice(0, splitIndex).join('\n');
      chunks.push({
        index: chunkIndex++,
        content: chunkContent,
        startLine: chunkStartLine,
        endLine: chunkStartLine + splitIndex - 1,
        isFirst: chunks.length === 0,
        isLast: false,
      });

      // Keep overlap for context
      const overlapLines = Math.ceil(CHUNK_OVERLAP / 80); // ~80 chars per line estimate
      const keepLines = currentChunk.slice(Math.max(splitIndex - overlapLines, 0));
      currentChunk = [...keepLines, line];
      currentLength = keepLines.join('\n').length + lineLength;
      chunkStartLine = i - keepLines.length + 1;
    } else {
      currentChunk.push(line);
      currentLength += lineLength;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex,
      content: currentChunk.join('\n'),
      startLine: chunkStartLine,
      endLine: lines.length - 1,
      isFirst: chunks.length === 0,
      isLast: true,
    });
  }

  // Mark last chunk
  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
}

/**
 * Check if content needs chunking
 */
export function needsChunking(content: string): boolean {
  return content.length > CHUNK_SIZE;
}

/**
 * Content preprocessing options
 */
export interface PreprocessOptions {
  autoLineBreak: boolean;       // 자동 줄바꿈
  detectChapters: boolean;      // 챕터/목차 감지
  removeExtraSpaces: boolean;   // 불필요한 공백 제거
  fixPunctuation: boolean;      // 문장부호 정리
}

/**
 * Chapter detection patterns for various formats
 */
const CHAPTER_PATTERNS = [
  // Korean patterns
  /^(제\s*\d+\s*장)\s*[.:：]?\s*(.+)?$/,
  /^(제\s*\d+\s*편)\s*[.:：]?\s*(.+)?$/,
  /^(제\s*\d+\s*부)\s*[.:：]?\s*(.+)?$/,
  /^(제\s*\d+\s*절)\s*[.:：]?\s*(.+)?$/,
  /^(\d+장)\s*[.:：]?\s*(.+)?$/,
  /^(프롤로그|에필로그|서문|머리말|맺음말|들어가며|나가며)/i,
  // English patterns
  /^(Chapter\s+\d+)\s*[.:：]?\s*(.+)?$/i,
  /^(Part\s+\d+)\s*[.:：]?\s*(.+)?$/i,
  /^(Section\s+\d+)\s*[.:：]?\s*(.+)?$/i,
  /^(Prologue|Epilogue|Introduction|Conclusion|Preface)/i,
  // Numbered patterns
  /^(\d+)\s*[.．]\s+(.+)$/,
  /^([IVXLCDM]+)\s*[.．]\s+(.+)$/i,
  // Already markdown headings
  /^#{1,3}\s+(.+)$/,
];

/**
 * Detect if a line is a chapter/section heading
 */
export function isChapterHeading(line: string): { isHeading: boolean; title: string; level: number } {
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) {
    return { isHeading: false, title: '', level: 0 };
  }

  // Check if already a markdown heading
  const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (mdMatch) {
    return { isHeading: true, title: mdMatch[2], level: mdMatch[1].length };
  }

  // Check chapter patterns
  for (const pattern of CHAPTER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const title = match[2] ? `${match[1]} ${match[2]}`.trim() : match[1];
      // Determine level based on pattern type
      let level = 1;
      if (/부|Part/i.test(match[1])) level = 1;
      else if (/편|장|Chapter/i.test(match[1])) level = 2;
      else if (/절|Section/i.test(match[1])) level = 3;
      return { isHeading: true, title, level };
    }
  }

  // Heuristic: Short line (under 50 chars) that looks like a title
  // - All caps or title case
  // - Ends without punctuation (except ? or !)
  // - Surrounded by empty lines (checked by caller)
  if (trimmed.length <= 50 && trimmed.length >= 2) {
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z가-힣]/.test(trimmed);
    const noEndPunct = !/[.。,，;；]$/.test(trimmed);
    const hasLetters = /[a-zA-Z가-힣]/.test(trimmed);

    if (isAllCaps && noEndPunct && hasLetters) {
      return { isHeading: true, title: trimmed, level: 2 };
    }
  }

  return { isHeading: false, title: '', level: 0 };
}

/**
 * Detect sentence boundaries for auto line breaking
 */
function detectSentenceEnd(text: string, pos: number): boolean {
  const char = text[pos];
  const nextChar = text[pos + 1];

  // Common sentence endings
  const endings = ['.', '!', '?', '。', '！', '？'];
  if (!endings.includes(char)) return false;

  // Check if followed by space or end of text
  if (!nextChar || /\s/.test(nextChar)) {
    // Avoid false positives for abbreviations
    const prevWord = text.slice(Math.max(0, pos - 10), pos);
    const abbrevs = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Inc', 'Ltd', 'etc', 'vs'];
    for (const abbr of abbrevs) {
      if (prevWord.endsWith(abbr)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Auto-format content with proper line breaks and structure
 */
export function preprocessContent(content: string, options: PreprocessOptions): string {
  let result = content;

  // Step 1: Normalize line endings
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Step 2: Remove extra spaces if enabled
  if (options.removeExtraSpaces) {
    // Remove multiple spaces (but preserve indentation)
    result = result.replace(/([^\n]) {2,}/g, '$1 ');
    // Remove trailing spaces
    result = result.replace(/ +\n/g, '\n');
    // Collapse multiple blank lines to max 2
    result = result.replace(/\n{4,}/g, '\n\n\n');
  }

  // Step 3: Fix punctuation if enabled
  if (options.fixPunctuation) {
    // Add space after punctuation if missing (for Latin text)
    result = result.replace(/([.!?])([A-Z가-힣])/g, '$1 $2');
    // Fix common issues
    result = result.replace(/\s+([,.])/g, '$1');
    result = result.replace(/([가-힣])\.([가-힣])/g, '$1. $2');
  }

  // Step 4: Auto line break if enabled
  if (options.autoLineBreak) {
    const lines = result.split('\n');
    const processed: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip already short lines or empty lines
      if (trimmed.length <= 80 || !trimmed) {
        processed.push(line);
        continue;
      }

      // Check if this is a heading - don't break headings
      const { isHeading } = isChapterHeading(trimmed);
      if (isHeading) {
        processed.push(line);
        continue;
      }

      // Break long lines at sentence boundaries
      let currentLine = '';
      let lastBreak = 0;

      for (let j = 0; j < trimmed.length; j++) {
        currentLine += trimmed[j];

        if (detectSentenceEnd(trimmed, j)) {
          // Check if line is getting long enough to break
          if (currentLine.length >= 40) {
            processed.push(currentLine.trim());
            currentLine = '';
            lastBreak = j + 1;
          }
        }
      }

      // Add remaining text
      if (currentLine.trim()) {
        processed.push(currentLine.trim());
      }
    }

    result = processed.join('\n');
  }

  // Step 5: Detect and format chapters if enabled
  if (options.detectChapters) {
    const lines = result.split('\n');
    const formatted: string[] = [];
    let prevEmpty = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const nextLine = lines[i + 1];
      const nextEmpty = !nextLine || !nextLine.trim();

      // Check if this looks like a chapter heading
      if (trimmed && prevEmpty) {
        const { isHeading, title, level } = isChapterHeading(trimmed);

        if (isHeading && !trimmed.startsWith('#')) {
          // Convert to markdown heading
          const prefix = '#'.repeat(level);
          formatted.push(''); // Ensure blank line before
          formatted.push(`${prefix} ${title}`);
          formatted.push(''); // Blank line after
          prevEmpty = true;
          continue;
        }
      }

      formatted.push(line);
      prevEmpty = !trimmed;
    }

    result = formatted.join('\n');
  }

  // Clean up: ensure proper spacing around headings
  result = result.replace(/\n*(#{1,6}\s+[^\n]+)\n*/g, '\n\n$1\n\n');
  result = result.replace(/^\n+/, ''); // Remove leading newlines
  result = result.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  return result;
}

/**
 * Split content by detected chapters/sections
 */
export function splitByChapters(content: string): Array<{
  title: string;
  content: string;
  level: number;
  startLine: number;
}> {
  const lines = content.split('\n');
  const chapters: Array<{
    title: string;
    content: string[];
    level: number;
    startLine: number;
  }> = [];

  let currentChapter: typeof chapters[0] | null = null;
  let introContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { isHeading, title, level } = isChapterHeading(line.trim());

    if (isHeading && level <= 2) {
      // Save previous chapter
      if (currentChapter) {
        chapters.push(currentChapter);
      } else if (introContent.length > 0) {
        // Content before first heading becomes intro
        const hasContent = introContent.some(l => l.trim().length > 0);
        if (hasContent) {
          chapters.push({
            title: '서문',
            content: introContent,
            level: 1,
            startLine: 0,
          });
        }
      }

      // Start new chapter
      currentChapter = {
        title: title.replace(/^#+\s*/, ''),
        content: [],
        level,
        startLine: i,
      };
    } else if (currentChapter) {
      currentChapter.content.push(line);
    } else {
      introContent.push(line);
    }
  }

  // Don't forget the last chapter
  if (currentChapter) {
    chapters.push(currentChapter);
  } else if (introContent.length > 0) {
    const hasContent = introContent.some(l => l.trim().length > 0);
    if (hasContent) {
      chapters.push({
        title: '본문',
        content: introContent,
        level: 1,
        startLine: 0,
      });
    }
  }

  return chapters.map(ch => ({
    ...ch,
    content: ch.content.join('\n').trim(),
  }));
}

/**
 * Analyze content readability and suggest improvements
 */
export function analyzeReadability(content: string): {
  issues: string[];
  score: number; // 0-100
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim());

  // Check for very long lines (no line breaks)
  const longLines = nonEmptyLines.filter(l => l.length > 200);
  if (longLines.length > nonEmptyLines.length * 0.3) {
    issues.push(`${longLines.length}개의 매우 긴 줄이 감지됨`);
    suggestions.push('자동 줄바꿈을 활성화하세요');
    score -= 20;
  }

  // Check for lack of headings
  const headings = lines.filter(l => /^#{1,6}\s/.test(l) || isChapterHeading(l).isHeading);
  if (headings.length === 0 && content.length > 3000) {
    issues.push('목차/제목이 감지되지 않음');
    suggestions.push('챕터 감지를 활성화하세요');
    score -= 15;
  }

  // Check for lack of paragraph breaks
  const avgLineLength = nonEmptyLines.reduce((a, b) => a + b.length, 0) / nonEmptyLines.length;
  if (avgLineLength > 150) {
    issues.push('단락 구분이 부족함');
    suggestions.push('자동 줄바꿈으로 가독성을 개선하세요');
    score -= 15;
  }

  // Check for excessive whitespace
  const excessiveSpaces = content.match(/  +/g);
  if (excessiveSpaces && excessiveSpaces.length > 20) {
    issues.push('불필요한 공백이 많음');
    suggestions.push('공백 제거를 활성화하세요');
    score -= 10;
  }

  return {
    issues,
    score: Math.max(0, score),
    suggestions,
  };
}

// Type for remark AST nodes
interface MarkdownNode {
  type: string;
  depth?: number;
  children?: MarkdownNode[];
  value?: string;
  position?: {
    start: { line: number };
    end: { line: number };
  };
}

/**
 * Generate a URL-safe ID from text
 */
function generateHeadingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `heading-${slug || index}`;
}

/**
 * Parse markdown content into HTML with heading IDs for TOC linking
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  let html = String(result);

  // Add IDs to headings for TOC linking
  let headingIndex = 0;
  html = html.replace(/<h([1-6])>([^<]*)<\/h\1>/gi, (match, level, content) => {
    const id = generateHeadingId(content, headingIndex++);
    return `<h${level} id="${id}">${content}</h${level}>`;
  });

  return html;
}

/**
 * Extract table of contents from markdown with consistent IDs
 */
export function extractTableOfContents(markdown: string): TOCEntry[] {
  const toc: TOCEntry[] = [];
  const lines = markdown.split('\n');
  let headingIndex = 0;

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      // Use same ID generation as markdownToHtml for consistency
      const id = generateHeadingId(title, headingIndex++);

      toc.push({
        id,
        title,
        level,
        position: index + 1,
      });
    }
  });

  return toc;
}

/**
 * Count words in content
 */
export function countWords(content: string): number {
  // Remove markdown syntax for accurate count
  const plainText = content
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[.*?\]\(.*?\)/g, (match) => match.replace(/\[|\]|\(.*?\)/g, '')) // Keep link text
    .replace(/[#*_~`>|-]/g, '') // Remove markdown symbols
    .trim();

  return plainText.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Estimate page count based on word count
 */
export function estimatePages(wordCount: number, wordsPerPage: number = 250): number {
  return Math.ceil(wordCount / wordsPerPage);
}

/**
 * Split content into chapters based on headings
 */
export function splitIntoChapters(
  markdown: string
): Array<{ title: string; content: string; level: number }> {
  const chapters: Array<{ title: string; content: string; level: number }> = [];
  const lines = markdown.split('\n');

  let currentChapter: { title: string; content: string[]; level: number } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);

    if (headingMatch && headingMatch[1].length <= 2) {
      // Save previous chapter
      if (currentChapter) {
        chapters.push({
          title: currentChapter.title,
          content: currentChapter.content.join('\n').trim(),
          level: currentChapter.level,
        });
      }

      // Start new chapter
      currentChapter = {
        title: headingMatch[2].trim(),
        content: [],
        level: headingMatch[1].length,
      };
    } else if (currentChapter) {
      currentChapter.content.push(line);
    } else {
      // Content before first heading - create intro chapter
      if (!currentChapter) {
        currentChapter = {
          title: 'Introduction',
          content: [line],
          level: 1,
        };
      }
    }
  }

  // Don't forget the last chapter
  if (currentChapter) {
    chapters.push({
      title: currentChapter.title,
      content: currentChapter.content.join('\n').trim(),
      level: currentChapter.level,
    });
  }

  return chapters.filter((ch) => ch.content.length > 0);
}

/**
 * Insert images into markdown content at specified positions
 */
export function insertImagesIntoMarkdown(
  markdown: string,
  images: Array<{
    lineNumber: number;
    imageUrl: string;
    alt: string;
  }>
): string {
  const lines = markdown.split('\n');
  const sortedImages = [...images].sort((a, b) => b.lineNumber - a.lineNumber);

  for (const image of sortedImages) {
    const imageMarkdown = `\n![${image.alt}](${image.imageUrl})\n`;
    lines.splice(image.lineNumber, 0, imageMarkdown);
  }

  return lines.join('\n');
}

/**
 * Generate slug from title for IDs
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Parse markdown AST
 */
export function parseMarkdownAST(markdown: string): MarkdownNode {
  const processor = unified().use(remarkParse);
  return processor.parse(markdown) as MarkdownNode;
}

/**
 * Find paragraphs suitable for image insertion
 */
export function findImageInsertionPoints(markdown: string): number[] {
  const lines = markdown.split('\n');
  const points: number[] = [];
  let paragraphCount = 0;
  let lastHeadingLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track headings
    if (/^#{1,6}\s/.test(line)) {
      lastHeadingLine = i;
      paragraphCount = 0;
      continue;
    }

    // Track paragraph ends
    if (line.trim() === '' && i > 0 && lines[i - 1].trim() !== '') {
      paragraphCount++;

      // Suggest insertion after every 3-4 paragraphs within a section
      if (paragraphCount >= 3 && paragraphCount % 3 === 0) {
        points.push(i);
      }
    }
  }

  return points;
}
