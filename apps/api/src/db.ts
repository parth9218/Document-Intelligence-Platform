import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { config } from './config';
import { getRdsIamAuthToken } from './utils/rds-auth';

if (process.env.NODE_ENV === 'local') {
  dotenv.config();
}

/**
 * Creates and initializes the PostgreSQL connection pool.
 * If RDS IAM Authentication is enabled, dynamic password resolution is used to fetch short-lived tokens.
 */
function createPgPool(): Pool {
  if (config.db.iamAuthEnabled) {
    return new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      ssl: config.db.ssl ? { 
        rejectUnauthorized: true,
        ca: fs.readFileSync(path.join(process.cwd(), 'global-bundle.pem')).toString()
      } : false,
      password: async () => {
        return await getRdsIamAuthToken({
          hostname: config.db.host,
          port: config.db.port,
          username: config.db.user,
          region: config.aws.region,
        });
      },
    });
  }

  return new Pool({
    connectionString: config.db.databaseUrl
  });
}

export const pgPool = createPgPool();

/**
 * Creates and initializes the Prisma ORM Client.
 * When IAM Auth is enabled, Prisma uses `@prisma/adapter-pg` backed by the IAM-authenticated pgPool.
 */
function createPrismaClient(): PrismaClient {
  if (config.db.iamAuthEnabled) {
    const adapter = new PrismaPg(pgPool);
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

export const prisma = createPrismaClient();
