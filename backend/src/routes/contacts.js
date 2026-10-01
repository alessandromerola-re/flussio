import express from 'express';
import { query } from '../db/index.js';

import { moduleWriteRoute } from '../modules/access.js';
import { validateContact, registryId, registryError } from '../services/registryValidation.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    const params = [req.companyId];
    let sql = `
      SELECT contacts.*, categories.name AS default_category_name, categories.direction AS default_category_direction
      FROM contacts
      LEFT JOIN categories ON contacts.default_category_id = categories.id AND categories.company_id = contacts.company_id
      WHERE contacts.company_id = $1
    `;
    if (search) {
      params.push(`%${search}%`);
      sql += ' AND (contacts.name ILIKE $2 OR contacts.email ILIKE $2)';
    }
    sql += ' ORDER BY contacts.name';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', moduleWriteRoute(['finance'], async (req, client) => {
  const { name, email = null, phone = null, default_category_id = null, is_active = true } = req.body;
  const link = await validateContact(client, req.companyId, { name, email, phone, default_category_id, is_active });
  const result = await client.query('INSERT INTO contacts (company_id, name, email, phone, default_category_id, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.companyId, name.trim(), email, phone, link, is_active]);
  return { status: 201, body: result.rows[0] };
}, 'write', false));

router.put('/:id', moduleWriteRoute(['finance'], async (req, client) => {
  const { name, email = null, phone = null, default_category_id = null, is_active = true } = req.body;
  const id = registryId(req.params.id);
  const current = await client.query('SELECT id FROM contacts WHERE id=$1 AND company_id=$2', [id, req.companyId]);
  if (!current.rowCount) throw registryError('NOT_FOUND', 404);
  const link = await validateContact(client, req.companyId, { name, email, phone, default_category_id, is_active });
  const result = await client.query('UPDATE contacts SET name=$1, email=$2, phone=$3, default_category_id=$4, is_active=$5 WHERE id=$6 AND company_id=$7 RETURNING *', [name.trim(), email, phone, link, is_active, id, req.companyId]);
  return { status: 200, body: result.rows[0] };
}, 'write', false));

router.delete('/:id', moduleWriteRoute(['finance'], async (req, client) => {
  const id = registryId(req.params.id);
  const result = await client.query('DELETE FROM contacts WHERE id=$1 AND company_id=$2', [id, req.companyId]);
  if (!result.rowCount) throw registryError('NOT_FOUND', 404);
  return { status: 204 };
}, 'delete', false));

export default router;
