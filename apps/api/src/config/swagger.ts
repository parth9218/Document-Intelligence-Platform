import { config as appConfig } from './index';
import fs from 'fs';
import path from 'path';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AI Document Intelligence Platform - API Specification',
    version: '1.0.0',
    description: `API contract for the Retrieval-Augmented Generation (RAG) Document Intelligence Platform.

### Authentication & Session Management
All protected endpoints verify session tenancy via a signed cookie named \`session_token\`.
- If a client makes a request to \`/api/documents\` or any sub-route without a valid \`session_token\` cookie, the backend automatically generates a new cryptographically signed session, creates a record in the \`sessions\` table, and returns the cookie.
- Subsequent requests will slide the session expiration by 24 hours.
- If a request is made to \`/api/session\` without a cookie, the server automatically initializes a new cryptographically signed session, registers it, and returns the newly created session. A \`401 Unauthorized\` is only returned if a session cookie is present but carries an invalid or tampered signature.

### Ingestion Progress Stream (SSE)
The \`/api/documents/progress\` endpoint utilizes Server-Sent Events (SSE) to deliver real-time progress updates for document processing.

The stream uses two typed events (via the standard SSE \`event:\` field):
1. **\`snapshot\`**: Emitted once on connection with an array of all active documents.
2. **\`update\`**: Emitted on database updates (via PG NOTIFY) with a single enriched status object.`,
  },

  components: {
    securitySchemes: {
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: appConfig.cookies.name,
        description: 'Signed session token cookie.',
      },
    },
    schemas: {
      DocumentStatusObject: {
        type: 'object',
        required: [
          'documentId',
          'filename',
          'mimeType',
          'fileSizeBytes',
          'status',
          'progressPct',
          'processedChunks',
          'totalChunks',
          'errorCode',
          'errorMessage',
          'createdAt',
        ],
        properties: {
          documentId: {
            type: 'string',
            format: 'uuid',
            example: '6c8cf7ee-1250-48c6-a67b-234b68e0d6dc',
          },
          filename: {
            type: 'string',
            example: 'invoice.pdf',
          },
          mimeType: {
            type: 'string',
            example: 'application/pdf',
          },
          fileSizeBytes: {
            type: 'integer',
            example: 1048576,
          },
          status: {
            type: 'string',
            example: 'chunking',
          },
          progressPct: {
            type: 'integer',
            example: 50,
          },
          processedChunks: {
            type: 'integer',
            example: 5,
          },
          totalChunks: {
            type: 'integer',
            nullable: true,
            example: 10,
          },
          errorCode: {
            type: 'string',
            nullable: true,
            example: null,
          },
          errorMessage: {
            type: 'string',
            nullable: true,
            example: null,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-06-24T13:16:09.000Z',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            example: 'unauthorized',
          },
          message: {
            type: 'string',
            example: 'Unauthorized access',
          },
        },
      },
    },
  },
};

let spec;
const swaggerJsonPath = path.resolve(process.cwd(), 'swagger.json');

if (fs.existsSync(swaggerJsonPath)) {
  spec = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));
} else {
  const swaggerJSDoc = require('swagger-jsdoc');
  const options = {
    swaggerDefinition,
    apis: [
      './src/routes/*.ts',
      './src/app.ts',
      './src/config/swagger.ts',
    ],
  };
  spec = swaggerJSDoc(options);
}

export const swaggerSpec = spec;
