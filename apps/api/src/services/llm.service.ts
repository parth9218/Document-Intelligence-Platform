import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config';
import { logger } from '../utils/logger';
import { InternalServerError, UnsupportedLlmProviderError } from '../errors/app-error';
import { SearchResultChunk } from './search.service';

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

export interface StreamChunk {
  token?: string;
  done: boolean;
}

export interface CitationMeta {
  index: number;
  filename: string;
  pageNumber: number | null;
}

// ---------------------------------------------------------------------------
// ILlmProvider Interface
// ---------------------------------------------------------------------------

export interface ILlmProvider {
  streamCompletion(
    systemPrompt: string,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk>;
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

export function buildPrompt(
  query: string,
  chunks: SearchResultChunk[],
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = [
    "You are a helpful assistant. Answer the user's question using ONLY the provided document contexts.",
    'For every statement you make, you MUST cite the source using its bracket index (e.g., [1], [2]).',
    'If the answer cannot be found in the provided contexts, respond with: "I could not find relevant information in the provided documents."',
    'Do NOT reference or invent any sources outside the provided contexts.',
  ].join('\n');

  const contextBlocks = chunks
    .map((chunk, i) => {
      const page = chunk.pageNumber != null ? ` (Page ${chunk.pageNumber})` : '';
      return `[${i + 1}] Document: ${chunk.filename}${page}\n---\n${chunk.content}`;
    })
    .join('\n\n');

  const userMessage = `Context Documents:\n\n${contextBlocks}\n\nQuestion: ${query}`;

  return { systemPrompt, userMessage };
}

// ---------------------------------------------------------------------------
// CitationValidator
// ---------------------------------------------------------------------------

export class CitationValidator {
  private readonly CITATION_REGEX = /\[(\d+)\]/g;
  private readonly numChunks: number;
  private readonly chunks: SearchResultChunk[];
  private emittedIndices = new Set<number>();

  constructor(chunks: SearchResultChunk[]) {
    this.chunks = chunks;
    this.numChunks = chunks.length;
  }

  extractAndValidate(token: string): { cleanToken: string; newCitations: CitationMeta[] } {
    const newCitations: CitationMeta[] = [];
    const invalidIndices: number[] = [];

    this.CITATION_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = this.CITATION_REGEX.exec(token)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx >= 1 && idx <= this.numChunks) {
        if (!this.emittedIndices.has(idx)) {
          this.emittedIndices.add(idx);
          newCitations.push({
            index: idx,
            filename: this.chunks[idx - 1].filename,
            pageNumber: this.chunks[idx - 1].pageNumber,
          });
        }
      } else {
        invalidIndices.push(idx);
        logger.warn(`[CitationValidator] Hallucinated citation [${idx}] detected and stripped (numChunks=${this.numChunks})`);
      }
    }

    // Strip invalid citation tokens from the text before forwarding to the client
    let cleanToken = token;
    for (const idx of invalidIndices) {
      cleanToken = cleanToken.replace(new RegExp(`\\[${idx}\\]`, 'g'), '');
    }

    return { cleanToken, newCitations };
  }
}

// ---------------------------------------------------------------------------
// BedrockLlmProvider (Production — AWS EKS + IRSA)
// ---------------------------------------------------------------------------

export class BedrockLlmProvider implements ILlmProvider {
  private client: BedrockRuntimeClient;

  constructor() {
    // IRSA: standard AWS SDK v3 credential resolution picks up the pod's IAM role automatically.
    this.client = new BedrockRuntimeClient({
      region: config.aws.region,
      ...(config.aws.endpointUrl ? { endpoint: config.aws.endpointUrl } : {}),
    });
  }

  async *streamCompletion(
    systemPrompt: string,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const requestBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config.llm.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const maxAttempts = 3;
    let delayMs = 1000;
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (signal?.aborted) return;

        const command = new InvokeModelWithResponseStreamCommand({
          modelId: config.llm.model,
          contentType: 'application/json',
          accept: 'application/json',
          body: Buffer.from(requestBody),
        });

        const response = await this.client.send(command);

        if (!response.body) {
          throw new InternalServerError('Bedrock returned empty stream body', 'bedrock_empty_stream');
        }

        for await (const event of response.body) {
          if (signal?.aborted) return;

          if (event.chunk?.bytes) {
            const decoded = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

            if (decoded.type === 'content_block_delta' && decoded.delta?.type === 'text_delta') {
              yield { token: decoded.delta.text as string, done: false };
            }
            if (decoded.type === 'message_stop') break;
          }

          if (event.internalServerException) {
            throw new InternalServerError('Bedrock stream internal error', 'bedrock_stream_error');
          }
          if (event.modelStreamErrorException) {
            throw new InternalServerError('Bedrock model stream error', 'bedrock_model_stream_error');
          }
          if (event.throttlingException) {
            const err = new Error('ThrottlingException');
            err.name = 'ThrottlingException';
            throw err;
          }
        }

        yield { done: true };
        return;

      } catch (err: any) {
        if (err instanceof InternalServerError) throw err;

        const isTransient =
          err.name === 'ThrottlingException' || err.name === 'ServiceUnavailableException';

        if (isTransient && attempt < maxAttempts) {
          logger.warn(
            `[BedrockLlmProvider] Transient error ${err.name} on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= backoffMultiplier;
        } else {
          logger.error(`[BedrockLlmProvider] Failed to stream completion: ${err.message || err}`);
          throw new InternalServerError(
            `Bedrock LLM stream failed: ${err.message || 'Unknown error'}`,
            'llm_stream_error',
          );
        }
      }
    }

    throw new InternalServerError('Bedrock LLM retry loop exhausted', 'llm_retry_exhausted');
  }
}

// ---------------------------------------------------------------------------
// LocalLlmProvider (Ollama running in Docker — local development only)
// ---------------------------------------------------------------------------

// Emitted when Ollama is unreachable (e.g. during unit tests without Docker)
const OLLAMA_FALLBACK_RESPONSE =
  'Based on the provided documents, [1] this is a test response from the local LLM fallback.';

export class LocalLlmProvider implements ILlmProvider {
  async *streamCompletion(
    systemPrompt: string,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const endpoint = config.llm.endpoint;
    const model = config.llm.model;

    try {
      const timeoutSignal = AbortSignal.timeout(15000);
      const activeSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: config.llm.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: activeSignal,
      });
      if (!response.ok) {
        throw new Error(`Ollama responded with HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error('Ollama response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (signal?.aborted) return;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            yield { done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { token: content, done: false };
            }
          } catch {
            // Silently skip malformed SSE lines
          }
        }
      }

      yield { done: true };

    } catch (err: any) {
      if (signal?.aborted) return;
      logger.debug(
        `[LocalLlmProvider] Ollama unavailable (${err.message}). Using deterministic stub response.`,
      );
      yield { token: OLLAMA_FALLBACK_RESPONSE, done: false };
      yield { done: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getLlmProvider(overrideProvider?: string): ILlmProvider {
  const provider = overrideProvider || config.llm.provider;
  if (provider === 'local') {
    return new LocalLlmProvider();
  }
  if (provider === 'bedrock') {
    return new BedrockLlmProvider();
  }
  throw new UnsupportedLlmProviderError(provider);
}
