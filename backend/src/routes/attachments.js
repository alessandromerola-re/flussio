import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  try {
    const result = await query(
      'SELECT id, transaction_id, file_name, path, created_at FROM attachments WHERE transaction_id = $1 ORDER BY created_at DESC',
      [transactionId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
