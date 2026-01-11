// Core types for AutoEbook

export interface Project {
  id: string;
  name: string;
  content: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  title?: string;
  subtitle?: string;
  description?: string;
  keywords?: string[];
  author?: string;
}

export type ProjectStatus = 'draft' | 'analyzing' | 'generating' | 'ready';

export interface ContentAnalysis {
  wordCount: number;
  estimatedPages: number;
  contentType: ContentType;
  tableOfContents: TOCEntry[];
  imagePoints: ImageInsertionPoint[];
}

export type ContentType = 'fiction' | 'non-fiction' | 'technical' | 'educational';

export interface TOCEntry {
  id: string;
  title: string;
  level: number; // 1 = h1, 2 = h2, etc.
  position: number; // line number
}

export interface ImageInsertionPoint {
  id: string;
  position: {
    section: string;
    afterParagraph: number;
    lineNumber: number;
  };
  suggestedType: ImageType;
  context: string; // surrounding text for context
  generatedPrompt: string;
  approved: boolean;
}

export type ImageType = 'illustration' | 'diagram' | 'chart' | 'infographic';

export interface GeneratedImage {
  id: string;
  projectId: string;
  type: ImageType;
  prompt: string;
  position: ImageInsertionPoint['position'];
  imageData?: string; // Base64 or URL
  status: ImageStatus;
}

export type ImageStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface GeneratedMetadata {
  titles: TitleOption[];
  description: string;
  keywords: string[];
  salesCopy?: string;
}

export interface TitleOption {
  title: string;
  subtitle?: string;
  style: 'catchy' | 'professional' | 'seo-optimized';
}

export interface ExportOptions {
  format: 'pdf' | 'epub' | 'both';
  template: string;
  fontSize: number;
  fontFamily: string;
  pageSize: PageSize;
  margins: Margins;
  includeImages: boolean;
  tocDepth: number;
}

export type PageSize = 'a4' | 'a5' | 'letter' | '6x9';

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface EbookMetadata {
  title: string;
  subtitle?: string;
  author: string;
  description: string;
  keywords: string[];
  isbn?: string;
  publishDate?: string;
  language?: string;
  coverImage?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProgressUpdate {
  step: string;
  progress: number; // 0-100
  message: string;
}
