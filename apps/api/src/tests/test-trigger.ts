import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('Connecting to database...');
  await pgClient.connect();

  // Create a session first to obtain the sessionId
  console.log('Creating mock session...');
  const session = await prisma.session.create({
    data: {
      session_token: 'test-signature-hmac-token',
      expires_at: new Date(Date.now() + 3600000), // 1 hour
    },
  });

  const channelName = `progress_${session.id.replace(/-/g, '_')}`;
  
  // Start listening to the session-scoped progress channel
  await pgClient.query(`LISTEN ${channelName}`);
  console.log(`Listening on ${channelName}...`);

  // Set up listener callback
  let triggerFired = false;
  pgClient.on('notification', (msg) => {
    if (msg.channel === channelName) {
      console.log('Received notification payload:', msg.payload);
      triggerFired = true;
    }
  });

  console.log('Creating mock document...');
  const document = await prisma.document.create({
    data: {
      session_id: session.id,
      filename: 'test-document.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1024,
      s3_key: `sessions/${session.id}/documents/test-doc-id/original`,
      status: 'pending_upload',
    },
  });

  console.log('Creating mock processing job...');
  const job = await prisma.processingJob.create({
    data: {
      document_id: document.id,
      session_id: session.id,
      status: 'pending_upload',
      total_chunks: null,
      processed_chunks: 0,
      progress_pct: 0,
      checkpoint_index: -1,
    },
  });

  // Wait a short time before updating to let notifications hook up
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('Updating processing job status to trigger PG NOTIFY...');
  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: 'embedding',
      progress_pct: 50,
      processed_chunks: 5,
      total_chunks: 10,
    },
  });

  // Wait 1 second to capture the notification
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Clean up
  console.log('Cleaning up mock data (Session delete cascades)...');
  await prisma.session.delete({
    where: { id: session.id },
  });

  await pgClient.end();
  await prisma.$disconnect();

  if (triggerFired) {
    console.log('✅ TEST PASSED: Trigger successfully fired and notification payload received.');
    process.exit(0);
  } else {
    console.error('❌ TEST FAILED: No notification received.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
