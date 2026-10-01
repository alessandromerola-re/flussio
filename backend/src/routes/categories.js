import express from 'express';
import { query } from '../db/index.js';

import { moduleWriteRoute } from '../modules/access.js';
import { validateCategory, registryId, registryError } from '../services/registryValidation.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { direction } = req.query;
  try {
    const params = [req.companyId];
    let sql =
      'SELECT id, name, direction, parent_id, color, is_active FROM categories WHERE company_id = $1';
    if (direction) {
      params.push(direction);
      sql += ' AND direction = $2';
    }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', moduleWriteRoute(['finance'], async (req, client) => {
  const { name, direction, parent_id = null, color = null, is_active = true } = req.body;
  const link = await validateCategory(client, req.companyId, { name, direction, parent_id, color, is_active });
  const result = await client.query('INSERT INTO categories (company_id, name, direction, parent_id, color, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.companyId, name.trim(), direction, link, color, is_active]);
  return { status: 201, body: result.rows[0] };
}, 'write', true));

router.put('/:id', moduleWriteRoute(['finance'], async (req, client) => {
  const { name, direction, parent_id = null, color = null, is_active = true } = req.body;
  const id = registryId(req.params.id);
  const current = await client.query('SELECT id FROM categories WHERE id=$1 AND company_id=$2', [id, req.companyId]);
  if (!current.rowCount) throw registryError('NOT_FOUND', 404);
  const link = await validateCategory(client, req.companyId, { name, direction, parent_id, color, is_active }, id);
  const result = await client.query('UPDATE categories SET name=$1, direction=$2, parent_id=$3, color=$4, is_active=$5 WHERE id=$6 AND company_id=$7 RETURNING *', [name.trim(), direction, link, color, is_active, id, req.companyId]);
  return { status: 200, body: result.rows[0] };
}, 'write', true));

router.delete('/:id', moduleWriteRoute(['finance'], async (req, client) => {
  const id = registryId(req.params.id);
  const result = await client.query('DELETE FROM categories WHERE id=$1 AND company_id=$2', [id, req.companyId]);
  if (!result.rowCount) throw registryError('NOT_FOUND', 404);
  return { status: 204 };
}, 'delete', true));

export default router;
