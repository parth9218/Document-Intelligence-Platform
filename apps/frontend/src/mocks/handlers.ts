import { http, HttpResponse, delay } from 'msw';
import { apiRouting } from '../config/api-routing';

interface MockDoc {
  documentId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  progressPct: number;
  processedChunks: number;
  totalChunks: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const mockDocsStore = new Map<string, MockDoc>();

export const handlers = [
  http.get('/api/session', async () => {
    if (apiRouting.session !== 'mock') return;
    
    await delay(300);
    return HttpResponse.json({
      id: '5e636494-48bf-44d2-90c3-33d9db0a5837',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
  }),
  
  http.post('/api/documents', async ({ request }) => {
    if (apiRouting.documents !== 'mock') return;
    
    const body = (await request.json()) as { 
      documents: Array<{ filename: string; mimeType: string; fileSizeBytes: number }> 
    };
    
    await delay(400);
    
    // Check global concurrency check: max 5 active uploads (simulated here based on store)
    const activeCount = Array.from(mockDocsStore.values()).filter(
      (d) => !['completed', 'failed', 'expired'].includes(d.status)
    ).length;
    
    if (activeCount + body.documents.length > 5) {
      return HttpResponse.json({
        error: 'rate_limit_exceeded',
        message: 'Maximum 5 concurrent processing files exceeded for this session.'
      }, { status: 429 });
    }
    
    // Check total cumulative storage limit check: max 50MB
    const totalBytes = Array.from(mockDocsStore.values()).reduce((acc, d) => acc + d.fileSizeBytes, 0);
    const incomingBytes = body.documents.reduce((acc, d) => acc + d.fileSizeBytes, 0);
    if (totalBytes + incomingBytes > 52428800) {
      return HttpResponse.json({
        error: 'storage_quota_exceeded',
        message: 'Maximum 50MB cumulative storage limit exceeded for this session.'
      }, { status: 400 });
    }

    const results = body.documents.map((doc) => {
      // Validate single file size limit: 5MB
      if (doc.fileSizeBytes > 5242880) {
        return {
          filename: doc.filename,
          status: 'rejected',
          error: 'file_too_large',
          message: 'File size exceeds maximum 5MB limit.',
        };
      }
      
      // Validate supported MIME types
      const allowedTypes = ['application/pdf', 'text/plain'];
      if (!allowedTypes.includes(doc.mimeType)) {
        return {
          filename: doc.filename,
          status: 'rejected',
          error: 'invalid_mime_type',
          message: 'Unsupported file type.',
        };
      }
      
      const docId = crypto.randomUUID();
      const mockDoc: MockDoc = {
        documentId: docId,
        filename: doc.filename,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        status: 'pending_upload',
        progressPct: 0,
        processedChunks: 0,
        totalChunks: Math.ceil(doc.fileSizeBytes / 1024 / 50) || 1, // 50KB chunks
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      };
      
      mockDocsStore.set(docId, mockDoc);
      
      return {
        filename: doc.filename,
        status: 'ready',
        documentId: docId,
        uploadUrl: 'http://localhost:3000/mock-s3-upload',
        uploadFields: {
          key: `sessions/5e636494-48bf-44d2-90c3-33d9db0a5837/documents/${docId}/original`,
          policy: 'mock_policy',
          signature: 'mock_signature',
        },
        s3Key: `sessions/5e636494-48bf-44d2-90c3-33d9db0a5837/documents/${docId}/original`,
      };
    });
    
    return HttpResponse.json({ results });
  }),
  
  // Intercept S3 simulation upload
  http.post('http://localhost:3000/mock-s3-upload', async () => {
    await delay(1200); // Simulate network latency of file upload
    return new HttpResponse(null, { status: 204 });
  }),
  
  http.post('/api/documents/:id/confirm-upload', async ({ params }) => {
    if (apiRouting.documents !== 'mock') return;
    
    const docId = params.id as string;
    const doc = mockDocsStore.get(docId);
    if (!doc) {
      return HttpResponse.json({ error: 'not_found', message: 'Document not found.' }, { status: 404 });
    }
    
    doc.status = 'uploaded';
    mockDocsStore.set(docId, doc);
    
    // Simulate background processing trigger
    triggerMockProcessing(docId);
    
    return HttpResponse.json({ status: 'uploaded' });
  }),
  
  http.get('/api/documents/status', async () => {
    if (apiRouting.documents !== 'mock') return;
    
    await delay(200);
    return HttpResponse.json({
      documents: Array.from(mockDocsStore.values()),
    });
  }),
  
  http.get('/api/documents/progress', () => {
    if (apiRouting.progress !== 'mock') return;
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send snapshot immediately
        const snapshotData = Array.from(mockDocsStore.values());
        controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(snapshotData)}\n\n`));
        
        const interval = setInterval(() => {
          const docs = Array.from(mockDocsStore.values());
          docs.forEach((doc) => {
            if (!['completed', 'failed', 'expired', 'pending_upload'].includes(doc.status)) {
              controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(doc)}\n\n`));
            }
          });
          
          const allTerminal = docs.every((doc) => ['completed', 'failed', 'expired'].includes(doc.status));
          if (allTerminal && docs.length > 0) {
            // Emitted terminal update one last time
            docs.forEach((doc) => {
              controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(doc)}\n\n`));
            });
            clearInterval(interval);
            controller.close();
          }
        }, 1000);
        
        return () => clearInterval(interval);
      }
    });
    
    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }),
  
  http.post('/api/query/search', async ({ request }) => {
    if (apiRouting.query !== 'mock') return;
    
    const body = (await request.json().catch(() => ({}))) as { query?: string; stream?: boolean };
    const queryStr = body.query || 'Default query';

    const mockChunks = [
      {
        id: 'mock-chunk-1',
        documentId: 'doc-1',
        filename: 'architecture_specifications.pdf',
        pageNumber: 3,
        content: 'The platform implements strict session-scoped multi-tenancy and pgvector cosine similarity search with dynamic thresholds.',
        distance: 0.12,
      },
      {
        id: 'mock-chunk-2',
        documentId: 'doc-2',
        filename: 'database_design.pdf',
        pageNumber: 7,
        content: 'PostgreSQL HNSW vector index (document_chunks_embedding_hnsw_idx) enables sub-second vector distance queries.',
        distance: 0.24,
      },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 1. Emit event: context
        controller.enqueue(
          encoder.encode(`event: context\ndata: ${JSON.stringify({ query: queryStr, results: mockChunks })}\n\n`)
        );
        await delay(200);

        // 2. Stream tokens and citations
        const tokens = [
          'Based on ',
          'the provided documents, ',
          '[1] ',
          'the platform enforces strict session-scoped tenancy ',
          'and uses pgvector for similarity queries. ',
          '[2] ',
          'HNSW indexing ensures fast retrieval latencies.',
        ];

        for (const token of tokens) {
          await delay(100);
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${JSON.stringify({ token })}\n\n`)
          );

          if (token.includes('[1]')) {
            controller.enqueue(
              encoder.encode(
                `event: citation\ndata: ${JSON.stringify({ index: 1, filename: 'architecture_specifications.pdf', pageNumber: 3 })}\n\n`
              )
            );
          }
          if (token.includes('[2]')) {
            controller.enqueue(
              encoder.encode(
                `event: citation\ndata: ${JSON.stringify({ index: 2, filename: 'database_design.pdf', pageNumber: 7 })}\n\n`
              )
            );
          }
        }

        // 3. Emit event: done
        await delay(100);
        controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }),
];

function triggerMockProcessing(docId: string) {
  const stages = ['downloading', 'validating', 'extracting', 'chunking', 'embedding'];
  let currentStageIdx = 0;
  
  const interval = setInterval(() => {
    const doc = mockDocsStore.get(docId);
    if (!doc) {
      clearInterval(interval);
      return;
    }
    
    if (currentStageIdx < stages.length) {
      doc.status = stages[currentStageIdx];
      
      if (doc.status === 'embedding') {
        doc.progressPct = Math.min(doc.progressPct + 20, 100);
        doc.processedChunks = Math.ceil((doc.progressPct / 100) * doc.totalChunks);
        
        if (doc.progressPct < 100) {
          mockDocsStore.set(docId, doc);
          return; // Keep looping inside the embedding status until 100%
        }
      }
      
      currentStageIdx++;
      mockDocsStore.set(docId, doc);
    } else {
      doc.status = 'completed';
      doc.progressPct = 100;
      doc.processedChunks = doc.totalChunks;
      mockDocsStore.set(docId, doc);
      clearInterval(interval);
    }
  }, 1000);
}
