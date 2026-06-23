import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const prisma = new PrismaClient();

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


