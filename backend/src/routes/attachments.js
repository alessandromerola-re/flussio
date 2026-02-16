import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { getClient, query } from '../db/index.js';

const router = express.Router();
const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const rawUpload = express.raw({ type: 'multipart/form-data', limit: '10mb' });

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const parseMultipartFile = (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch || !Buffer.isBuffer(req.body)) {
    return null;
  }

  const boundary = `--${boundaryMatch[1]}`;
  const bodyString = req.body.toString('binary');
  const partName = 'name="file"';
  const partStart = bodyString.indexOf(partName);
  if (partStart === -1) {
    return null;
  }

  const fileNameMatch = bodyString.slice(partStart, partStart + 400).match(/filename="([^"]+)"/);
  if (!fileNameMatch) {
    return null;
  }

  const headersEnd = bodyString.indexOf('\r\n\r\n', partStart);
  if (headersEnd === -1) {
    return null;
  }

  const dataStart = headersEnd + 4;
  const nextBoundary = bodyString.indexOf(`\r\n${boundary}`, dataStart);
  if (nextBoundary === -1) {
    return null;
  }

  const fileBuffer = req.body.subarray(dataStart, nextBoundary);
  return { originalName: fileNameMatch[1]?.trim(), buffer: fileBuffer };
};

const getTransactionForCompany = async (client, transactionId, companyId) => {
  const result = await client.query('SELECT id FROM transactions WHERE id = $1 AND company_id = $2', [
    transactionId,
    companyId,
  ]);
  return result.rows[0] || null;
};

router.get('/file/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `
      SELECT a.id, a.file_name, a.path
      FROM attachments a
      JOIN transactions t ON a.transaction_id = t.id
      WHERE a.id = $1 AND t.company_id = $2
      `,
      [id, req.user.company_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const attachment = result.rows[0];
    const fullPath = path.join(uploadsRoot, attachment.path);
    return res.download(fullPath, attachment.file_name);
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  try {
    const result = await query(
      `
      SELECT a.id, a.transaction_id, a.file_name, a.path, a.created_at
      FROM attachments a
      JOIN transactions t ON a.transaction_id = t.id
      WHERE a.transaction_id = $1 AND t.company_id = $2
      ORDER BY a.created_at DESC
      `,
      [transactionId, req.user.company_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/:transactionId', rawUpload, async (req, res) => {
  const { transactionId } = req.params;
  const parsedFile = parseMultipartFile(req);
  if (!parsedFile || !parsedFile.originalName || parsedFile.buffer.length === 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const transaction = await getTransactionForCompany(client, transactionId, req.user.company_id);
    if (!transaction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const relativeDir = path.join(`company_${req.user.company_id}`, `tx_${transaction.id}`);
    const targetDir = path.join(uploadsRoot, relativeDir);
    await fs.mkdir(targetDir, { recursive: true });

    const generatedName = `${crypto.randomUUID()}_${safeFileName(parsedFile.originalName)}`;
    const relativePath = path.join(relativeDir, generatedName);
    const fullPath = path.join(uploadsRoot, relativePath);

    await fs.writeFile(fullPath, parsedFile.buffer);

    const insertResult = await client.query(
      `
      INSERT INTO attachments (transaction_id, file_name, path)
      VALUES ($1, $2, $3)
      RETURNING id, transaction_id, file_name, path, created_at
      `,
      [transaction.id, parsedFile.originalName, relativePath]
    );

    await client.query('COMMIT');
    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      SELECT a.id, a.path
      FROM attachments a
      JOIN transactions t ON a.transaction_id = t.id
      WHERE a.id = $1 AND t.company_id = $2
      FOR UPDATE
      `,
      [id, req.user.company_id]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const attachment = result.rows[0];
    await client.query('DELETE FROM attachments WHERE id = $1', [id]);
    await client.query('COMMIT');

    const fullPath = path.join(uploadsRoot, attachment.path);
    await fs.unlink(fullPath).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });

    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error_code: 'FILE_TOO_LARGE' });
  }
  return next(error);
});

export default router;
