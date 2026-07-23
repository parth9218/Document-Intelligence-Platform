import { Request, Response, NextFunction } from 'express';
import { searchService } from '../services/search.service';
import { UnauthorizedError } from '../errors/app-error';

class QueryController {
  /**
   * Performs a tenancy-scoped pgvector similarity search on the user's query passed in request body.
   * Supports streaming SSE output (event: context, event: token, event: done) as well as standard JSON.
   */
  public async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const { query, stream } = req.body;
      const results = await searchService.searchSimilarChunks(
        req.session.id,
        query
      );

      const isSSE = req.headers.accept === 'text/event-stream' || stream === true || stream === 'true';

      if (isSSE) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // 1. Emit retrieved vector chunks & citation references
        res.write(`event: context\ndata: ${JSON.stringify({ query, results })}\n\n`);

        // 2. Placeholder frame for incremental LLM answer token streaming (Task 302 foundation)
        res.write(`event: token\ndata: ${JSON.stringify({ token: '' })}\n\n`);

        // 3. Emit completion frame
        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
        return;
      }

      res.status(200).json({
        query,
        results,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const queryController = new QueryController();
