import { execSync } from 'child_process';
import { getRdsIamAuthToken } from '../utils/rds-auth';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  let databaseUrl = process.env.DATABASE_URL;

  if (config.db.iamAuthEnabled) {
    console.log("IAM Auth enabled: Generating temporary RDS token for migration...");
    const token = await getRdsIamAuthToken();
    const encodedToken = encodeURIComponent(token);
    
    // Construct the connection string using the IAM token as the password
    let url = `postgresql://${config.db.user}:${encodedToken}@${config.db.host}:${config.db.port}/${config.db.database}`;
    if (config.db.ssl) {
      const certPath = path.join(process.cwd(), 'global-bundle.pem');
      url += '?sslmode=verify-full&sslrootcert=' + encodeURIComponent(certPath);
    }
    
    databaseUrl = url;
  }

  console.log("Executing 'npx prisma migrate deploy'...");
  
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
  
  console.log("Migration completed successfully.");
}

runMigration().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
