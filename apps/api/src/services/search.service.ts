import { getEmbeddingProvider } from './embedding.service';
import { logger } from '../utils/logger';
import { config } from '../config/index';
import { InternalServerError } from '../errors/app-error';
import { prisma } from '../db';

export interface SearchResultChunk {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  distance: number;
  filename: string;
}

export class SearchService {
  /**
   * Embeds the input text and performs a tenancy-scoped pgvector similarity search.
   */
  async searchSimilarChunks(
    sessionId: string,
    queryText: string,
  ): Promise<SearchResultChunk[]> {
    if (!queryText || !queryText.trim()) {
      return [];
    }

    const provider = getEmbeddingProvider();
    const queryVector = await provider.embedQuery(queryText.trim());

    if (!queryVector || queryVector.length !== 1024) {
      throw new InternalServerError(
        `Embedding provider returned invalid vector length (${queryVector?.length ?? 0}). Expected 1024.`,
        'invalid_vector_dimensions'
      );
    }

    const vectorStr = `[${queryVector.join(',')}]`;

    // Execute pgvector cosine similarity search with strict session tenancy filter
    const rawResults = await prisma.$queryRaw<
      Array<{
        id: string;
        document_id: string;
        content: string;
        page_number: number | null;
        distance: number;
        filename: string;
      }>
    >`
      SELECT 
        c.id,
        c.document_id,
        c.content,
        c.page_number,
        (c.embedding <=> ${vectorStr}::vector) AS distance,
        d.filename
      FROM document_chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.session_id = ${sessionId}::uuid
        AND (c.embedding <=> ${vectorStr}::vector) <= ${config.similarity.distanceThreshold}
      ORDER BY (c.embedding <=> ${vectorStr}::vector) ASC
      LIMIT ${config.similarity.topK};
    `;

    return rawResults.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      content: r.content,
      pageNumber: r.page_number,
      distance: typeof r.distance === 'number' ? r.distance : parseFloat(r.distance as any),
      filename: r.filename,
    }));
  }
}

export const searchService = new SearchService();
