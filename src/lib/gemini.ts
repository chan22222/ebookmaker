import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  ContentAnalysis,
  ImageInsertionPoint,
  GeneratedMetadata,
  TitleOption,
  ContentType,
  TOCEntry,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { splitIntoChunks, needsChunking, type ContentChunk } from './analyzer';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Default model
const DEFAULT_MODEL = 'gemini-3-pro-preview';

// Helper to get model instance
function getModel(modelId?: string) {
  return genAI.getGenerativeModel({ model: modelId || DEFAULT_MODEL });
}

/**
 * Helper to clean JSON response from AI
 */
function cleanJsonResponse(response: string): string {
  let jsonStr = response.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  return jsonStr.trim();
}

/**
 * Analyze a single chunk of content
 */
async function analyzeChunk(
  chunk: ContentChunk,
  totalChunks: number,
  model?: string
): Promise<{
  tableOfContents: TOCEntry[];
  imagePoints: ImageInsertionPoint[];
  contentType: ContentType;
}> {
  const textModel = getModel(model);
  const prompt = `
You are an expert content analyzer for ebook creation. Analyze the following content chunk and provide analysis in JSON format.

This is chunk ${chunk.index + 1} of ${totalChunks} (lines ${chunk.startLine + 1} to ${chunk.endLine + 1}).
${chunk.isFirst ? 'This is the FIRST chunk - pay attention to the opening and main themes.' : ''}
${chunk.isLast ? 'This is the LAST chunk - pay attention to conclusions.' : ''}

Content chunk:
"""
${chunk.content}
"""

Provide analysis in the following JSON format (respond ONLY with valid JSON, no markdown):
{
  "contentType": "<fiction|non-fiction|technical|educational>",
  "tableOfContents": [
    {
      "title": "<heading text found in this chunk>",
      "level": <1-6>,
      "position": <line number within this chunk, add ${chunk.startLine} for absolute position>
    }
  ],
  "imagePoints": [
    {
      "section": "<section/chapter name>",
      "afterParagraph": <paragraph number>,
      "lineNumber": <line number within chunk, add ${chunk.startLine} for absolute position>,
      "suggestedType": "<illustration|diagram|chart|infographic>",
      "context": "<2-3 sentences of surrounding context>",
      "generatedPrompt": "<detailed prompt for generating the image>"
    }
  ]
}

Guidelines:
- Only identify headings that actually appear in this chunk
- Suggest 1-3 images per chunk depending on content
- Line numbers should be relative to this chunk (will be adjusted later)
`;

  try {
    const result = await textModel.generateContent(prompt);
    const response = result.response.text();
    const analysis = JSON.parse(cleanJsonResponse(response));

    // Add IDs and adjust line numbers
    const tableOfContents: TOCEntry[] = (analysis.tableOfContents || []).map((entry: Omit<TOCEntry, 'id'>) => ({
      ...entry,
      id: uuidv4(),
      position: (entry.position || 0) + chunk.startLine,
    }));

    const imagePoints: ImageInsertionPoint[] = (analysis.imagePoints || []).map((point: {
      section: string;
      afterParagraph: number;
      lineNumber: number;
      suggestedType: string;
      context: string;
      generatedPrompt: string;
    }) => ({
      id: uuidv4(),
      position: {
        section: point.section,
        afterParagraph: point.afterParagraph,
        lineNumber: (point.lineNumber || 0) + chunk.startLine,
      },
      suggestedType: point.suggestedType as ImageInsertionPoint['suggestedType'],
      context: point.context,
      generatedPrompt: point.generatedPrompt,
      approved: false,
    }));

    return {
      tableOfContents,
      imagePoints,
      contentType: analysis.contentType as ContentType || 'non-fiction',
    };
  } catch (error) {
    console.error(`Error analyzing chunk ${chunk.index}:`, error);
    return {
      tableOfContents: [],
      imagePoints: [],
      contentType: 'non-fiction',
    };
  }
}

/**
 * Merge results from multiple chunk analyses
 */
function mergeChunkResults(
  results: Array<{
    tableOfContents: TOCEntry[];
    imagePoints: ImageInsertionPoint[];
    contentType: ContentType;
  }>,
  totalWordCount: number
): ContentAnalysis {
  // Merge all TOC entries and sort by position
  const allToc = results.flatMap(r => r.tableOfContents);
  allToc.sort((a, b) => a.position - b.position);

  // Merge all image points and sort by line number
  const allImagePoints = results.flatMap(r => r.imagePoints);
  allImagePoints.sort((a, b) => a.position.lineNumber - b.position.lineNumber);

  // Determine overall content type by majority vote
  const contentTypeCounts: Record<string, number> = {};
  for (const r of results) {
    contentTypeCounts[r.contentType] = (contentTypeCounts[r.contentType] || 0) + 1;
  }
  const contentType = Object.entries(contentTypeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as ContentType || 'non-fiction';

  return {
    wordCount: totalWordCount,
    estimatedPages: Math.ceil(totalWordCount / 250),
    contentType,
    tableOfContents: allToc,
    imagePoints: allImagePoints,
  };
}

/**
 * Analyze content and identify optimal image insertion points
 * Automatically chunks long content for better processing
 */
export async function analyzeContent(
  content: string,
  model?: string,
  onProgress?: (current: number, total: number) => void
): Promise<ContentAnalysis> {
  const totalWordCount = content.split(/\s+/).filter(w => w.length > 0).length;

  // Check if we need chunking
  if (!needsChunking(content)) {
    // Process as single chunk for short content
    const textModel = getModel(model);
    const prompt = `
You are an expert content analyzer for ebook creation. Analyze the following content and provide a detailed analysis in JSON format.

Content to analyze:
"""
${content}
"""

Provide analysis in the following JSON format (respond ONLY with valid JSON, no markdown):
{
  "wordCount": <number>,
  "estimatedPages": <number based on ~250 words per page>,
  "contentType": "<fiction|non-fiction|technical|educational>",
  "tableOfContents": [
    {
      "title": "<heading text>",
      "level": <1-6>,
      "position": <approximate line number>
    }
  ],
  "imagePoints": [
    {
      "section": "<section/chapter name>",
      "afterParagraph": <paragraph number in that section>,
      "lineNumber": <approximate line number>,
      "suggestedType": "<illustration|diagram|chart|infographic>",
      "context": "<2-3 sentences of surrounding context>",
      "generatedPrompt": "<detailed prompt for generating the image>"
    }
  ]
}

Guidelines for image insertion points:
- Suggest 3-8 images depending on content length
- Place images after key concepts, not in the middle of explanations
- For fiction: suggest illustrations for key scenes
- For technical: suggest diagrams for processes, charts for data
- For educational: suggest infographics and explanatory diagrams
- Each prompt should be detailed enough to generate a relevant image
`;

    try {
      const result = await textModel.generateContent(prompt);
      const response = result.response.text();
      const analysis = JSON.parse(cleanJsonResponse(response));

      // Add IDs to entries
      const tableOfContents: TOCEntry[] = (analysis.tableOfContents || []).map((entry: Omit<TOCEntry, 'id'>) => ({
        ...entry,
        id: uuidv4(),
      }));

      const imagePoints: ImageInsertionPoint[] = (analysis.imagePoints || []).map((point: {
        section: string;
        afterParagraph: number;
        lineNumber: number;
        suggestedType: string;
        context: string;
        generatedPrompt: string;
      }) => ({
        id: uuidv4(),
        position: {
          section: point.section,
          afterParagraph: point.afterParagraph,
          lineNumber: point.lineNumber,
        },
        suggestedType: point.suggestedType as ImageInsertionPoint['suggestedType'],
        context: point.context,
        generatedPrompt: point.generatedPrompt,
        approved: false,
      }));

      return {
        wordCount: analysis.wordCount || totalWordCount,
        estimatedPages: analysis.estimatedPages || Math.ceil(totalWordCount / 250),
        contentType: analysis.contentType as ContentType || 'non-fiction',
        tableOfContents,
        imagePoints,
      };
    } catch (error) {
      console.error('Error analyzing content:', error);
      return {
        wordCount: totalWordCount,
        estimatedPages: Math.ceil(totalWordCount / 250),
        contentType: 'non-fiction',
        tableOfContents: [],
        imagePoints: [],
      };
    }
  }

  // Chunk the content for long documents
  console.log('Content is long, using chunked analysis...');
  const chunks = splitIntoChunks(content);
  console.log(`Split into ${chunks.length} chunks`);

  const results: Array<{
    tableOfContents: TOCEntry[];
    imagePoints: ImageInsertionPoint[];
    contentType: ContentType;
  }> = [];

  // Process chunks sequentially to avoid rate limiting
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Analyzing chunk ${i + 1}/${chunks.length}...`);
    onProgress?.(i + 1, chunks.length);

    const result = await analyzeChunk(chunks[i], chunks.length, model);
    results.push(result);

    // Small delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return mergeChunkResults(results, totalWordCount);
}

// Default image model
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';

/**
 * Generate image using Gemini's image generation capability
 */
export async function generateImage(prompt: string, imageModel?: string): Promise<string | null> {
  try {
    // Use selected image model or default
    const imageGenModel = genAI.getGenerativeModel({ model: imageModel || DEFAULT_IMAGE_MODEL });

    const enhancedPrompt = `Create a high-quality illustration for an ebook: ${prompt}.
Style: Clean, professional, suitable for publishing. No text or watermarks.`;

    const result = await imageGenModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      } as never, // Type workaround for new API
    });

    const response = result.response;

    // Extract image from response
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if ('inlineData' in part && part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error generating image:', error);
    return null;
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

/**
 * Generate metadata (titles, description, keywords) for the ebook
 */
export async function generateMetadata(content: string, language: string = 'ko', model?: string): Promise<GeneratedMetadata> {
  const textModel = getModel(model);
  const langName = LANGUAGE_NAMES[language] || 'Korean';

  const prompt = `
You are a marketing expert for ebooks. Generate compelling metadata for the following content.
IMPORTANT: Generate ALL metadata in ${langName} language.

Content:
"""
${content.slice(0, 10000)}
"""

Provide metadata in the following JSON format (respond ONLY with valid JSON, no markdown).
All text must be in ${langName}:
{
  "titles": [
    {
      "title": "<catchy main title in ${langName}>",
      "subtitle": "<supporting subtitle in ${langName}>",
      "style": "catchy"
    },
    {
      "title": "<professional title in ${langName}>",
      "subtitle": "<professional subtitle in ${langName}>",
      "style": "professional"
    },
    {
      "title": "<SEO-optimized title in ${langName}>",
      "subtitle": "<SEO subtitle with keywords in ${langName}>",
      "style": "seo-optimized"
    }
  ],
  "description": "<compelling 150-200 word book description in ${langName} that hooks readers>",
  "keywords": ["<keyword1 in ${langName}>", "<keyword2 in ${langName}>", ... <10-15 relevant keywords>],
  "salesCopy": "<short 2-3 sentence sales pitch in ${langName}>"
}

Guidelines:
- Titles should be attention-grabbing and relevant
- Description should follow best practices for book marketing
- Keywords should include relevant search terms
- Sales copy should create urgency or curiosity
`;

  try {
    const result = await textModel.generateContent(prompt);
    const response = result.response.text();

    // Clean up response
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const metadata = JSON.parse(jsonStr.trim());

    return {
      titles: metadata.titles as TitleOption[],
      description: metadata.description,
      keywords: metadata.keywords,
      salesCopy: metadata.salesCopy,
    };
  } catch (error) {
    console.error('Error generating metadata:', error);

    return {
      titles: [
        { title: 'Untitled Ebook', style: 'catchy' as const },
      ],
      description: 'An engaging ebook.',
      keywords: [],
    };
  }
}

/**
 * Proofread and correct content using AI
 * - Fix typos and spelling errors
 * - Correct awkward phrasing
 * - Add proper paragraph breaks
 * - Improve readability
 */
export async function proofreadContent(
  content: string,
  language: string = 'ko',
  model?: string
): Promise<{
  correctedContent: string;
  changes: Array<{ original: string; corrected: string; reason: string }>;
  summary: string;
}> {
  const textModel = getModel(model);
  const langName = LANGUAGE_NAMES[language] || 'Korean';

  // Process in chunks if content is too long
  const maxChunkSize = 6000;

  if (content.length > maxChunkSize) {
    // Split and process chunks
    const chunks = splitIntoChunks(content);
    let allCorrected = '';
    const allChanges: Array<{ original: string; corrected: string; reason: string }> = [];

    for (const chunk of chunks) {
      const result = await proofreadChunk(chunk.content, langName, textModel);
      allCorrected += result.correctedContent + '\n\n';
      allChanges.push(...result.changes);
    }

    return {
      correctedContent: allCorrected.trim(),
      changes: allChanges.slice(0, 20), // Limit to 20 changes for display
      summary: `${allChanges.length}개의 수정사항이 발견되었습니다.`,
    };
  }

  return proofreadChunk(content, langName, textModel);
}

async function proofreadChunk(
  content: string,
  langName: string,
  textModel: ReturnType<typeof getModel>
): Promise<{
  correctedContent: string;
  changes: Array<{ original: string; corrected: string; reason: string }>;
  summary: string;
}> {
  const prompt = `
You are a professional ${langName} editor and proofreader. Review and correct the following text.

Your tasks:
1. Fix all spelling and typo errors
2. Correct grammatical mistakes
3. Fix awkward or unnatural phrasing
4. Add proper paragraph breaks for readability (add blank lines between paragraphs)
5. Ensure proper punctuation and spacing
6. Do NOT change the meaning or style of the content
7. Do NOT add any new content or remove existing content

Text to proofread:
"""
${content}
"""

Respond in JSON format (respond ONLY with valid JSON, no markdown):
{
  "correctedContent": "<the fully corrected text with proper paragraph breaks>",
  "changes": [
    {
      "original": "<original text snippet>",
      "corrected": "<corrected text snippet>",
      "reason": "<brief reason for the change in ${langName}>"
    }
  ],
  "summary": "<brief summary of corrections made in ${langName}>"
}

IMPORTANT:
- The correctedContent must include the COMPLETE corrected text
- Add blank lines (\\n\\n) between paragraphs for readability
- List only the most significant changes (max 10)
- Keep the original formatting style (headings, lists, etc.)
`;

  try {
    const result = await textModel.generateContent(prompt);
    const response = result.response.text();
    const parsed = JSON.parse(cleanJsonResponse(response));

    return {
      correctedContent: parsed.correctedContent || content,
      changes: parsed.changes || [],
      summary: parsed.summary || '교정이 완료되었습니다.',
    };
  } catch (error) {
    console.error('Proofreading error:', error);
    return {
      correctedContent: content,
      changes: [],
      summary: '교정 중 오류가 발생했습니다.',
    };
  }
}

/**
 * Format content with proper structure using AI
 * - Add chapter headings
 * - Create proper paragraphs
 * - Improve overall structure
 */
export async function formatContentWithAI(
  content: string,
  language: string = 'ko',
  model?: string
): Promise<string> {
  const textModel = getModel(model);
  const langName = LANGUAGE_NAMES[language] || 'Korean';

  // Process in chunks for long content
  if (content.length > 8000) {
    const chunks = splitIntoChunks(content);
    let formatted = '';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isFirst = i === 0;
      const result = await formatChunkWithAI(chunk.content, langName, textModel, isFirst);
      formatted += result + '\n\n';
    }

    return formatted.trim();
  }

  return formatChunkWithAI(content, langName, textModel, true);
}

async function formatChunkWithAI(
  content: string,
  langName: string,
  textModel: ReturnType<typeof getModel>,
  detectHeadings: boolean
): Promise<string> {
  const prompt = `
You are a professional ${langName} book formatter. Format the following raw text into proper book format.

Your tasks:
1. Add proper paragraph breaks (blank lines between paragraphs)
2. ${detectHeadings ? 'Detect and format chapter/section headings with Markdown (## for chapters, ### for sections)' : 'Preserve existing headings'}
3. Ensure sentences are properly separated
4. Fix any line break issues (merge incorrectly split sentences)
5. Maintain proper spacing after punctuation
6. Do NOT change the actual content or meaning
7. Do NOT add any new text

Raw text:
"""
${content}
"""

Respond with ONLY the formatted text (no JSON, no explanation). The formatted text should:
- Have clear paragraph separation with blank lines
- Have proper Markdown headings if chapter titles are detected
- Be easy to read with proper line breaks
`;

  try {
    const result = await textModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Formatting error:', error);
    return content;
  }
}

/**
 * Generate a refined image prompt based on context
 */
export async function refineImagePrompt(
  originalPrompt: string,
  context: string,
  imageType: string,
  model?: string
): Promise<string> {
  const textModel = getModel(model);
  const prompt = `
Refine this image generation prompt to be more specific and visually detailed.

Original prompt: "${originalPrompt}"
Context: "${context}"
Image type: ${imageType}

Provide a refined prompt that:
1. Is more visually specific
2. Includes style guidance (e.g., "digital illustration", "clean diagram")
3. Specifies composition if relevant
4. Is suitable for ebook publication

Respond with ONLY the refined prompt, no explanation.
`;

  try {
    const result = await textModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error refining prompt:', error);
    return originalPrompt;
  }
}
