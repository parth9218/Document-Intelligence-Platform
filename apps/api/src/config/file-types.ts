export interface FileTypeConfig {
  mimeType: string;
  extension: string;
  category: 'document' | 'image' | 'audio' | 'video' | 'other';
}

// Extensible registry of supported file types
export const SUPPORTED_FILE_TYPES: FileTypeConfig[] = [
  { mimeType: 'application/pdf', extension: '.pdf', category: 'document' },
  { mimeType: 'text/plain', extension: '.txt', category: 'document' },
];

/**
 * Checks if a given MIME type is supported by the application.
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_FILE_TYPES.some((type) => type.mimeType === mimeType);
}

/**
 * Returns all currently supported MIME types.
 */
export function getSupportedMimeTypes(): string[] {
  return SUPPORTED_FILE_TYPES.map((type) => type.mimeType);
}
