import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    if (req.user?.is_super_admin === true) {
      const result = await query('SELECT id, name FROM companies ORDER BY name');
      return res.json(result.rows);
    }

    const result = await query(
      `SELECT c.id, c.name
       FROM user_companies uc
       JOIN companies c ON c.id = uc.company_id
       WHERE uc.user_id = $1
         AND uc.is_active = true
       ORDER BY c.name`,
      [req.user?.user_id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  if (req.user?.is_super_admin !== true) {
    return res.status(403).json({ error_code: 'FORBIDDEN' });
  }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
