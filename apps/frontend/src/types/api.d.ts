export interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

export interface DocumentStatusObject {
  documentId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  progressPct: number;
  processedChunks: number;
  totalChunks: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface SessionResponse {
  id: string;
  expires_at: string;
  created_at: string;
}

export interface BatchUploadInitRequest {
  documents: {
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
  }[];
}

export interface BatchUploadInitResultReady {
  filename: string;
  status: 'ready';
  documentId: string;
  uploadUrl: string;
  uploadFields: Record<string, string>;
  s3Key: string;
}

export interface BatchUploadInitResultRejected {
  filename: string;
  status: 'rejected';
  error: 'invalid_mime_type' | 'file_too_large';
  message: string;
}

export type BatchUploadInitResult = BatchUploadInitResultReady | BatchUploadInitResultRejected;

export interface BatchUploadInitResponse {
  results: BatchUploadInitResult[];
}

export interface ConfirmUploadResponse {
  status: 'uploaded';
}

// ---------------------------------------------------------------------------
// Query Engine & Chat Interfaces
// ---------------------------------------------------------------------------

export interface SearchResultChunk {
  id: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  content: string;
  distance: number;
}

export interface CitationMeta {
  index: number;
  filename: string;
  pageNumber: number | null;
}

export interface QuerySearchRequest {
  query: string;
  stream?: boolean;
}

export interface QuerySearchResponse {
  query: string;
  results: SearchResultChunk[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  error?: string;
  contextChunks?: SearchResultChunk[];
  citations?: CitationMeta[];
  createdAt: string;
}
