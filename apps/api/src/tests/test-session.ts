import app from '../app';
import { prisma } from '../db';
import { Server } from 'http';

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  let server: Server | null = null;
  
  try {
    // 1. Start the Express server
    console.log(`Starting test server on port ${PORT}...`);
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Step 1: Request with no cookie
    console.log('Sending request with no session cookie...');
    const res1 = await fetch(`${BASE_URL}/api/session`);
    console.log(`Response Status: ${res1.status}`);
    
    const setCookie = res1.headers.get('set-cookie');
    console.log(`Set-Cookie Header: ${setCookie}`);
    
    if (!setCookie || !setCookie.includes('session_token=')) {
      throw new Error('FAIL: Set-Cookie header is missing or does not contain session_token');
    }

    // Extract signed token from the Set-Cookie header
    // Header format: session_token=token.signature; Max-Age=...
    const cookiePart = setCookie.split(';')[0];
    const signedToken = decodeURIComponent(cookiePart.split('=')[1]);
    console.log(`Extracted signed token (decoded): ${signedToken}`);

    // Verify row exists in the sessions table
    console.log('Verifying session row exists in PostgreSQL...');
    const sessionInDb = await prisma.session.findUnique({
      where: { session_token: signedToken },
    });

    if (!sessionInDb) {
      throw new Error(`FAIL: Session row not found in database for token: ${signedToken}`);
    }
    console.log(`✅ Found session in database: ID = ${sessionInDb.id}, ExpiresAt = ${sessionInDb.expires_at}`);

    // 3. Step 2: Request with the valid session cookie
    console.log('Sending request with valid session cookie...');
    const res2 = await fetch(`${BASE_URL}/api/session`, {
      headers: {
        Cookie: `session_token=${signedToken}`,
      },
    });

    console.log(`Response Status: ${res2.status}`);
    const data2 = await res2.json() as any;
    console.log('Response Payload:', data2);

    if (res2.status !== 200 || data2.id !== sessionInDb.id) {
      throw new Error(`FAIL: Expected status 200 and ID ${sessionInDb.id}, got status ${res2.status} and ID ${data2.id}`);
    }
    console.log('✅ Valid session request accepted successfully.');

    // 4. Step 3: Request with tampered session cookie
    console.log('Sending request with modified/tampered cookie signature...');
    const tamperedToken = signedToken + 'a'; // tamper with the signature
    const res3 = await fetch(`${BASE_URL}/api/session`, {
      headers: {
        Cookie: `session_token=${tamperedToken}`,
      },
    });

    console.log(`Response Status: ${res3.status}`);
    const data3 = await res3.json() as any;
    console.log('Response Payload:', data3);

    if (res3.status !== 401) {
      throw new Error(`FAIL: Expected HTTP status 401 for tampered cookie, got ${res3.status}`);
    }
    if (data3.error !== 'Invalid session signature') {
      throw new Error(`FAIL: Expected "Invalid session signature" error message, got "${data3.error}"`);
    }
    console.log('✅ Tampered session signature correctly rejected with 401.');

    // Clean up database session
    console.log('Cleaning up test session from database...');
    await prisma.session.delete({
      where: { id: sessionInDb.id },
    });

    console.log('✅ ALL SESSION MANAGEMENT TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST RUN FAILED:', err);
    process.exit(1);
  } finally {
    if (server) {
      console.log('Shutting down test server...');
      server.close();
    }
    await prisma.$disconnect();
  }
}

main();
