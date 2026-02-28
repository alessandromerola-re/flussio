import express from 'express';
import { getClient, query } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';

const router = express.Router();
const rawUpload = express.raw({ type: 'multipart/form-data', limit: '25mb' });
const allowedRoles = new Set(['admin', 'editor', 'super_admin']);

const parseMultipartFile = (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch || !Buffer.isBuffer(req.body)) return null;
  const boundaryValue = boundaryMatch[1].replace(/^"|"$/g, '');
  const boundary = `--${boundaryValue}`;
  const bodyString = req.body.toString('binary');
  const start = bodyString.indexOf('name="file"');
  if (start < 0) return null;
  const headerEnd = bodyString.indexOf('\r\n\r\n', start);
  if (headerEnd < 0) return null;
  const dataStart = headerEnd + 4;
  const nextBoundary = bodyString.indexOf(`\r\n${boundary}`, dataStart);
  if (nextBoundary < 0) return null;
  return req.body.subarray(dataStart, nextBoundary);
};

const slug = (s = '') => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const csvEsc = (v) => {
  const s = v == null ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};
const parseCsvLine = (line, delimiter = ',') => {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted; continue; }
    if (c === delimiter && !quoted) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
};

const ensurePermission = (req, res) => {
  if (!allowedRoles.has(req.companyRole)) {
    sendError(res, 403, 'FORBIDDEN', 'Operation not allowed.');
    return false;
  }
  return true;
};

const exportEntity = async (entity, companyId) => {
  if (entity === 'accounts') {
    const r = await query('SELECT external_id, name, type, opening_balance, is_active FROM accounts WHERE company_id=$1 ORDER BY id', [companyId]);
    return { headers: ['external_id', 'name', 'type', 'opening_balance', 'is_active'], rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.type, Number(x.opening_balance).toFixed(2), x.is_active]) };
  }
  if (entity === 'categories') {
    const r = await query(`SELECT c.external_id,c.name,c.direction,c.color,c.is_active,p.external_id AS parent_external_id,p.name AS parent_name,p.direction AS parent_direction
      FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.company_id=$1 ORDER BY c.id`, [companyId]);
    return { headers: ['external_id', 'name', 'direction', 'color', 'is_active', 'category_parent_external_id'], rows: r.rows.map((x) => [x.external_id || `${slug(x.name)}_${x.direction}`, x.name, x.direction, x.color || '', x.is_active, x.parent_external_id || (x.parent_name ? `${slug(x.parent_name)}_${x.parent_direction}` : '')]) };
  }
  if (entity === 'contacts') {
    const r = await query('SELECT external_id,name,email,phone,is_active FROM contacts WHERE company_id=$1 ORDER BY id', [companyId]);
    return { headers: ['external_id', 'name', 'email', 'phone', 'is_active'], rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.email || '', x.phone || '', x.is_active]) };
  }
  if (entity === 'jobs') {
    const r = await query('SELECT code,title,name,notes,is_active,is_closed,budget,start_date,end_date FROM jobs WHERE company_id=$1 ORDER BY id', [companyId]);
    return { headers: ['code', 'title', 'name', 'notes', 'is_active', 'is_closed', 'budget', 'start_date', 'end_date'], rows: r.rows.map((x) => [x.code || slug(x.title || x.name), x.title || '', x.name || '', x.notes || '', x.is_active, x.is_closed, x.budget != null ? Number(x.budget).toFixed(2) : '', x.start_date || '', x.end_date || '']) };
  }
  if (entity === 'properties') {
    const r = await query(`SELECT p.external_id,p.name,p.notes,p.is_active,c.external_id AS contact_external_id,c.name AS contact_name
      FROM properties p LEFT JOIN contacts c ON c.id=p.contact_id WHERE p.company_id=$1 ORDER BY p.id`, [companyId]);
    return { headers: ['external_id', 'name', 'notes', 'is_active', 'contact_external_id'], rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.notes || '', x.is_active, x.contact_external_id || (x.contact_name ? slug(x.contact_name) : '')]) };
  }
  if (entity === 'recurring_templates') {
    const r = await query('SELECT external_id,title,frequency,interval,start_date,end_date,is_active,amount,movement_type,notes FROM recurring_templates WHERE company_id=$1 ORDER BY id', [companyId]);
    return { headers: ['external_id', 'title', 'frequency', 'interval', 'start_date', 'end_date', 'is_active', 'amount', 'movement_type', 'notes'], rows: r.rows.map((x) => [x.external_id || slug(x.title), x.title, x.frequency, x.interval, x.start_date || '', x.end_date || '', x.is_active, Number(x.amount).toFixed(2), x.movement_type, x.notes || '']) };
  }
  if (entity === 'transactions') {
    const r = await query(`SELECT t.id,t.external_id,t.date,t.type,t.amount_total,t.description,
      c.external_id AS category_external_id,c.name AS category_name,
      ct.external_id AS contact_external_id,ct.name AS contact_name,
      j.code AS job_code,p.external_id AS property_external_id,p.name AS property_name
      FROM transactions t
      LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN contacts ct ON ct.id=t.contact_id
      LEFT JOIN jobs j ON j.id=t.job_id
      LEFT JOIN properties p ON p.id=t.property_id
      WHERE t.company_id=$1 ORDER BY t.id`, [companyId]);
    return { headers: ['external_id', 'date', 'type', 'amount_total', 'description', 'category_external_id', 'contact_external_id', 'job_code', 'property_external_id'],
      rows: r.rows.map((x) => [`tx_${x.id}`, x.date, x.type, Number(Math.abs(x.amount_total)).toFixed(2), x.description || '', x.category_external_id || (x.category_name ? slug(x.category_name) : ''), x.contact_external_id || (x.contact_name ? slug(x.contact_name) : ''), x.job_code || '', x.property_external_id || (x.property_name ? slug(x.property_name) : '')]) };
  }
  return null;
};

router.get('/:entity.csv', async (req, res) => {
  if (!ensurePermission(req, res)) return;
  const entity = req.params.entity;
  try {
    const payload = await exportEntity(entity, req.companyId);
    if (!payload) return sendError(res, 404, 'NOT_FOUND', 'Entity not supported');
    const csv = [payload.headers.join(','), ...payload.rows.map((row) => row.map(csvEsc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  }
});

router.post('/:entity', rawUpload, async (req, res) => {
  if (!ensurePermission(req, res)) return;
  const entity = req.params.entity;
  const fileBuffer = parseMultipartFile(req);
  if (!fileBuffer) return sendError(res, 400, 'NO_FILE', 'No file uploaded.');

  try {
    const text = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Empty CSV');
    const headers = parseCsvLine(lines[0], ',').map((h) => h.toLowerCase());
    const rows = lines.slice(1).map((l) => parseCsvLine(l, ','));
    const client = await getClient();
    let created = 0; let updated = 0; let errors = 0; const errorRows = [];

    const idx = (name) => headers.indexOf(name);
    const asBool = (v, def = true) => (String(v ?? '').trim() === '' ? def : ['1', 'true', 'yes'].includes(String(v).trim().toLowerCase()));
    const asNum = (v) => Number(String(v ?? '').replace(',', '.'));

    const resolveByExternal = async (table, externalId, fallbackName) => {
      if (externalId) {
        const a = await client.query(`SELECT id FROM ${table} WHERE company_id=$1 AND external_id=$2`, [req.companyId, externalId]);
        if (a.rowCount) return a.rows[0].id;
      }
      if (fallbackName) {
        const b = await client.query(`SELECT id FROM ${table} WHERE company_id=$1 AND lower(name)=lower($2)`, [req.companyId, fallbackName]);
        if (b.rowCount) return b.rows[0].id;
      }
      return null;
    };

    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        if (entity === 'accounts') {
          const externalId = row[idx('external_id')] || slug(row[idx('name')]);
          const found = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query('UPDATE accounts SET name=$1,type=$2,opening_balance=$3,is_active=$4 WHERE id=$5', [row[idx('name')], row[idx('type')], asNum(row[idx('opening_balance')]), asBool(row[idx('is_active')]), found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO accounts (company_id,external_id,name,type,opening_balance,balance,is_active) VALUES ($1,$2,$3,$4,$5,$5,$6)', [req.companyId, externalId, row[idx('name')], row[idx('type')] || 'cash', asNum(row[idx('opening_balance')]) || 0, asBool(row[idx('is_active')])]);
            created += 1;
          }
        } else if (entity === 'categories') {
          const externalId = row[idx('external_id')] || `${slug(row[idx('name')])}_${row[idx('direction')] || 'expense'}`;
          const parentExternal = row[idx('category_parent_external_id')];
          const parentId = parentExternal ? await resolveByExternal('categories', parentExternal, parentExternal) : null;
          const found = await client.query('SELECT id FROM categories WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query('UPDATE categories SET name=$1,direction=$2,color=$3,parent_id=$4,is_active=$5 WHERE id=$6', [row[idx('name')], row[idx('direction')] || 'expense', row[idx('color')] || null, parentId, asBool(row[idx('is_active')]), found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO categories (company_id,external_id,name,direction,color,parent_id,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.companyId, externalId, row[idx('name')], row[idx('direction')] || 'expense', row[idx('color')] || null, parentId, asBool(row[idx('is_active')])]);
            created += 1;
          }
        } else if (entity === 'contacts') {
          const externalId = row[idx('external_id')] || slug(row[idx('name')]);
          const found = await client.query('SELECT id FROM contacts WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query('UPDATE contacts SET name=$1,email=$2,phone=$3,is_active=$4 WHERE id=$5', [row[idx('name')], row[idx('email')] || null, row[idx('phone')] || null, asBool(row[idx('is_active')]), found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO contacts (company_id,external_id,name,email,phone,is_active) VALUES ($1,$2,$3,$4,$5,$6)', [req.companyId, externalId, row[idx('name')], row[idx('email')] || null, row[idx('phone')] || null, asBool(row[idx('is_active')])]);
            created += 1;
          }
        } else if (entity === 'jobs') {
          const code = row[idx('code')] || slug(row[idx('title')] || row[idx('name')]);
          const found = await client.query('SELECT id FROM jobs WHERE company_id=$1 AND code=$2', [req.companyId, code]);
          if (found.rowCount) {
            await client.query('UPDATE jobs SET title=$1,name=$2,notes=$3,is_active=$4,is_closed=$5,budget=$6,start_date=$7,end_date=$8 WHERE id=$9', [row[idx('title')] || row[idx('name')], row[idx('name')] || row[idx('title')], row[idx('notes')] || null, asBool(row[idx('is_active')]), asBool(row[idx('is_closed')], false), row[idx('budget')] ? asNum(row[idx('budget')]) : null, row[idx('start_date')] || null, row[idx('end_date')] || null, found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO jobs (company_id,code,title,name,notes,is_active,is_closed,budget,start_date,end_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [req.companyId, code, row[idx('title')] || row[idx('name')], row[idx('name')] || row[idx('title')], row[idx('notes')] || null, asBool(row[idx('is_active')]), asBool(row[idx('is_closed')], false), row[idx('budget')] ? asNum(row[idx('budget')]) : null, row[idx('start_date')] || null, row[idx('end_date')] || null]);
            created += 1;
          }
        } else if (entity === 'properties') {
          const externalId = row[idx('external_id')] || slug(row[idx('name')]);
          const contactExternal = row[idx('contact_external_id')];
          const contactId = contactExternal ? await resolveByExternal('contacts', contactExternal, contactExternal) : null;
          const found = await client.query('SELECT id FROM properties WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query('UPDATE properties SET name=$1,notes=$2,contact_id=$3,is_active=$4 WHERE id=$5', [row[idx('name')], row[idx('notes')] || null, contactId, asBool(row[idx('is_active')]), found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO properties (company_id,external_id,name,notes,contact_id,is_active) VALUES ($1,$2,$3,$4,$5,$6)', [req.companyId, externalId, row[idx('name')], row[idx('notes')] || null, contactId, asBool(row[idx('is_active')])]);
            created += 1;
          }
        } else if (entity === 'recurring_templates') {
          const externalId = row[idx('external_id')] || slug(row[idx('title')]);
          const found = await client.query('SELECT id FROM recurring_templates WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          const params = [row[idx('title')], row[idx('frequency')] || 'monthly', Number(row[idx('interval')] || 1), row[idx('start_date')] || null, row[idx('end_date')] || null, asBool(row[idx('is_active')]), asNum(row[idx('amount')]), row[idx('movement_type')] || 'expense', row[idx('notes')] || null];
          if (found.rowCount) {
            await client.query('UPDATE recurring_templates SET title=$1,frequency=$2,interval=$3,start_date=$4,end_date=$5,is_active=$6,amount=$7,movement_type=$8,notes=$9 WHERE id=$10', [...params, found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO recurring_templates (company_id,external_id,title,frequency,interval,start_date,end_date,is_active,amount,movement_type,notes,next_run_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())', [req.companyId, externalId, ...params]);
            created += 1;
          }
        } else if (entity === 'transactions') {
          const externalId = row[idx('external_id')] || `tx_imp_${i + 1}`;
          const categoryId = await resolveByExternal('categories', row[idx('category_external_id')], row[idx('category_external_id')]);
          const contactId = await resolveByExternal('contacts', row[idx('contact_external_id')], row[idx('contact_external_id')]);
          const propertyId = await resolveByExternal('properties', row[idx('property_external_id')], row[idx('property_external_id')]);
          let jobId = null;
          const jobCode = row[idx('job_code')];
          if (jobCode) {
            const j = await client.query('SELECT id FROM jobs WHERE company_id=$1 AND code=$2', [req.companyId, jobCode]);
            if (!j.rowCount) throw new Error(`job_code not found: ${jobCode}`);
            jobId = j.rows[0].id;
          }
          if ((row[idx('category_external_id')] || '') && !categoryId) throw new Error(`category not found`);
          if ((row[idx('contact_external_id')] || '') && !contactId) throw new Error(`contact not found`);
          if ((row[idx('property_external_id')] || '') && !propertyId) throw new Error(`property not found`);
          const found = await client.query('SELECT id FROM transactions WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          const payload = [row[idx('date')], row[idx('type')], asNum(row[idx('amount_total')]), row[idx('description')] || null, categoryId, contactId, propertyId, jobId];
          if (found.rowCount) {
            await client.query('UPDATE transactions SET date=$1,type=$2,amount_total=$3,description=$4,category_id=$5,contact_id=$6,property_id=$7,job_id=$8 WHERE id=$9', [...payload, found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO transactions (company_id,external_id,date,type,amount_total,description,category_id,contact_id,property_id,job_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [req.companyId, externalId, ...payload]);
            created += 1;
          }
        } else {
          throw new Error('Entity not supported');
        }
      } catch (rowError) {
        errors += 1;
        errorRows.push({ line: i + 2, message: rowError.message });
      }
    }
    await client.query('COMMIT');
    client.release();
    return res.json({ ok: created + updated, created, updated, errors, error_rows: errorRows.slice(0, 50) });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  }
});

export default router;
