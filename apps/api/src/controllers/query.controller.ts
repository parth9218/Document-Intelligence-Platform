import { Request, Response, NextFunction } from 'express';
import { searchService } from '../services/search.service';
import { getLlmProvider, buildPrompt, CitationValidator } from '../services/llm.service';
import { UnauthorizedError } from '../errors/app-error';
import { logger } from '../utils/logger';

class QueryController {
  /**
   * Performs a tenancy-scoped pgvector similarity search on the user's query passed in request body.
   *
   * Non-streaming (JSON): Returns retrieval results only.
   * Streaming (SSE): Emits context chunks, then streams a grounded LLM answer with
   * validated inline citation frames, and a done signal.
   */
  public async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const { query, stream } = req.body;
      const results = await searchService.searchSimilarChunks(req.session.id, query);

      const isSSE =
        req.headers.accept === 'text/event-stream' || stream === true || stream === 'true';

      if (isSSE) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Abort the upstream LLM stream if the client disconnects
        const abortController = new AbortController();
        req.on('close', () => abortController.abort());

        // 1. Emit retrieved context chunks and citation references
        res.write(`event: context\ndata: ${JSON.stringify({ query, results })}\n\n`);

        // When 0 chunks are retrieved, stream a friendly fallback response informing the user
        if (results.length === 0) {
          const fallbackToken = "I couldn't find any relevant information in your uploaded documents to answer this question. Please ensure your documents are uploaded and processed, or try rephrasing your query.";
          res.write(`event: token\ndata: ${JSON.stringify({ token: fallbackToken })}\n\n`);
          res.write(`event: done\ndata: [DONE]\n\n`);
          res.end();
          return;
        }

        // 2. Stream grounded LLM answer with citation validation
        try {
          const provider = getLlmProvider();
          const { systemPrompt, userMessage } = buildPrompt(query, results);
          const validator = new CitationValidator(results);

          for await (const chunk of provider.streamCompletion(
            systemPrompt,
            userMessage,
            abortController.signal,
          )) {
            if (abortController.signal.aborted) break;
            if (chunk.done) break;

            if (chunk.token) {
              const { cleanToken, newCitations } = validator.extractAndValidate(chunk.token);

              if (cleanToken.trim()) {
                res.write(`event: token\ndata: ${JSON.stringify({ token: cleanToken })}\n\n`);
              }

              for (const citation of newCitations) {
                res.write(`event: citation\ndata: ${JSON.stringify(citation)}\n\n`);
              }
            }
          }
        } catch (err: any) {
          if (!abortController.signal.aborted) {
            logger.error(`[QueryController] LLM stream error: ${err.message}`);
            res.write(
              `event: error\ndata: ${JSON.stringify({
                message: err.message,
                errorCode: err.errorCode || 'llm_stream_error',
              })}\n\n`,
            );
          }
        }

        // 3. Emit stream completion frame
        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
        return;
      }

      // Non-streaming path: return retrieval results only
      res.status(200).json({ query, results });
    } catch (err) {
      next(err);
    }
  }
}

export const queryController = new QueryController();
