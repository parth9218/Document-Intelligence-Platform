import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config';
import { logger } from '../utils/logger';
import { InternalServerError, UnsupportedEmbeddingProviderError } from '../errors/app-error';

export interface IEmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
}

export class BedrockEmbeddingProvider implements IEmbeddingProvider {
  private client: BedrockRuntimeClient;

  constructor() {
    // In EKS production workloads, authentication is handled via IAM Roles for Service Accounts (IRSA).
    // Standard AWS SDK v3 resolution picks up IAM role tokens automatically from the environment.
    this.client = new BedrockRuntimeClient({
      region: config.aws.region,
      ...(config.aws.endpointUrl ? { endpoint: config.aws.endpointUrl } : {}),
    });
  }

  async embedQuery(text: string): Promise<number[]> {
    const modelId = config.embeddings.model;
    const body = JSON.stringify({
      inputText: text,
      dimensions: 1024,
      normalize: true,
    });

    const maxAttempts = 3;
    let delayMs = 1000;
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: Buffer.from(body),
        });

        const response = await this.client.send(command);
        if (!response.body) {
          throw new InternalServerError('Bedrock returned empty response body', 'bedrock_empty_response');
        }

        const decoded = JSON.parse(new TextDecoder().decode(response.body));
        if (!decoded.embedding || !Array.isArray(decoded.embedding)) {
          throw new InternalServerError('Invalid embedding payload from Bedrock', 'bedrock_invalid_payload');
        }

        return decoded.embedding as number[];
      } catch (err: any) {
        if (err instanceof InternalServerError) {
          throw err;
        }

        const errorName = err.name || err.code || '';
        const isTransient = errorName === 'ThrottlingException' || errorName === 'ServiceUnavailableException';

        if (isTransient && attempt < maxAttempts) {
          logger.warn(`[BedrockEmbeddingProvider] Transient error ${errorName} on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= backoffMultiplier;
        } else {
          logger.error(`[BedrockEmbeddingProvider] Failed to generate query embedding: ${err.message || err}`);
          throw new InternalServerError(`Bedrock query embedding failed: ${err.message || 'Unknown error'}`, 'embedding_provider_error');
        }
      }
    }

    throw new InternalServerError('Bedrock embedding retry loop exhausted', 'embedding_retry_exhausted');
  }
}

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private extractor: any = null;

  private async getExtractor() {
    if (!this.extractor) {
      try {
        const { pipeline } = await import('@xenova/transformers');
        const modelName = config.embeddings.model || 'Xenova/e5-large-v2';
        logger.info(`[LocalEmbeddingProvider] Initializing local embedding pipeline (${modelName})...`);
        this.extractor = await pipeline('feature-extraction', modelName);
      } catch (err: any) {
        logger.error(`[LocalEmbeddingProvider] Native feature extraction unavailable (${err.message}). Using deterministic vector generator.`);
        this.extractor = 'fallback';
      }
    }
    return this.extractor;
  }

  async embedQuery(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    if (extractor === 'fallback' || !extractor) {
      return this.generateFallbackVector(text);
    }
    try {
      const formattedInput = `query: ${text}`;
      const output = await extractor(formattedInput, { pooling: 'mean', normalize: true });
      return Array.from(output.data) as number[];
    } catch (err: any) {
      logger.warn(`[LocalEmbeddingProvider] Feature extraction error (${err.message}). Falling back.`);
      return this.generateFallbackVector(text);
    }
  }

  private generateFallbackVector(text: string): number[] {
    const vector: number[] = new Array(1024).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < 1024; i++) {
      vector[i] = Math.sin(hash + i);
    }
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / norm);
  }
}

export function getEmbeddingProvider(overrideProvider?: string): IEmbeddingProvider {
  const provider = overrideProvider || config.embeddings.provider;
  if (provider === 'local') {
    return new LocalEmbeddingProvider();
  }
  if (provider === 'bedrock') {
    return new BedrockEmbeddingProvider();
  }
  throw new UnsupportedEmbeddingProviderError(provider);
}
