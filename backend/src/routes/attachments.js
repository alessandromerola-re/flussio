import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

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

export default router;
