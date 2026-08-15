import request from 'supertest';
import { prisma } from '../db';

describe('Swagger Documentation Endpoint Tests', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    await prisma.$disconnect();
  });

  it('should serve Swagger UI at /api-docs in non-production environments', async () => {
    process.env.NODE_ENV = 'test';
    
    // Import app dynamically after setting the environment
    const app = require('../app').default;

    // swagger-ui-express redirects /api-docs to /api-docs/ or serves HTML directly
    const responseRedirect = await request(app).get('/api-docs');
    expect([200, 301, 302]).toContain(responseRedirect.status);

    const responseHtml = await request(app).get('/api-docs/');
    expect(responseHtml.status).toBe(200);
    expect(responseHtml.text).toContain('<html');
    expect(responseHtml.text).toContain('swagger');
  });

  it('should return 404 Not Found at /api-docs in production environment', async () => {
    process.env.NODE_ENV = 'prod';
    
    // Import app dynamically
    const app = require('../app').default;

    const response = await request(app).get('/api-docs');
    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found');
  });
});
