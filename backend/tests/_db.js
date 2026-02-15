import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const schemaPath = path.resolve(process.cwd(), '../database/init/001_schema.sql');

export const query = async (text, params = []) => pool.query(text, params);

export const resetDb = async () => {
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query(schemaSql);
  } finally {
    client.release();
  }
};

export const close = async () => {
  await pool.end();
};
