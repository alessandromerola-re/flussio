import express from 'express';
import { assertModuleAccess, assertModuleLinkChanges, assertRecurringActivation, withModuleWrite, sendModuleError } from '../modules/access.js';
import { lockCompanyModules } from '../modules/registry.js';
import { writeAuditLog } from '../services/audit.js';
import { getClient, query } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';
import { canRole } from '../middleware/permissions.js';

const router = express.Router();
const entityCapabilities = { jobs: ['jobs'], properties: ['properties'], recurring_templates: ['recurring'] };
const capabilitiesForEntity = entity => entityCapabilities[entity] || ['finance'];
const rawUpload = express.raw({ type: 'multipart/form-data', limit: '25mb' });

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
const datePart = () => new Date().toISOString().slice(0, 10);
const exportFilenameByEntity = {
  accounts: () => `flussio_accounts_${datePart()}.csv`,
  categories: () => `flussio_categories_${datePart()}.csv`,
  contacts: () => `flussio_contacts_${datePart()}.csv`,
  jobs: () => `flussio_jobs_${datePart()}.csv`,
  properties: () => `flussio_properties_${datePart()}.csv`,
  recurring_templates: () => `flussio_recurring_templates_${datePart()}.csv`,
  transactions: () => `flussio_transactions_${datePart()}.csv`,
};
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

const ensurePermission = (req, res, entity = req.params.entity) => {
  const permission = ['GET', 'HEAD'].includes(req.method)
    ? 'export'
    : entity === 'transactions' ? 'import_movements' : 'import';
  if (!canRole(req.companyRole, permission)) {
    sendError(res, 403, 'FORBIDDEN', 'Operation not allowed.');
    return false;
  }
  return true;
};

const exportEntity = async (entity, companyId, executor = { query }) => {
  if (entity === 'accounts') {
    const r = await executor.query('SELECT external_id, name, type, opening_balance, is_active FROM accounts WHERE company_id=$1 ORDER BY id', [companyId]);
    return { headers: ['external_id', 'name', 'type', 'opening_balance', 'is_active'], rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.type, Number(x.opening_balance).toFixed(2), x.is_active]) };
  }
  if (entity === 'categories') {
    const r = await executor.query(`SELECT c.external_id,c.name,c.direction,c.color,c.is_active,p.external_id AS parent_external_id,p.name AS parent_name,p.direction AS parent_direction
      FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.company_id=$1 ORDER BY c.id`, [companyId]);
    return { headers: ['external_id', 'name', 'direction', 'color', 'is_active', 'category_parent_external_id'], rows: r.rows.map((x) => [x.external_id || `${slug(x.name)}_${x.direction}`, x.name, x.direction, x.color || '', x.is_active, x.parent_external_id || (x.parent_name ? `${slug(x.parent_name)}_${x.parent_direction}` : '')]) };
  }
  if (entity === 'contacts') {
    const r = await executor.query(
      `SELECT c.external_id,c.name,c.email,c.phone,c.is_active,cat.external_id AS default_category_external_id,cat.name AS default_category_name
       FROM contacts c
       LEFT JOIN categories cat ON cat.id = c.default_category_id AND cat.company_id = c.company_id
       WHERE c.company_id=$1
       ORDER BY c.id`,
      [companyId]
    );
    return {
      headers: ['external_id', 'name', 'email', 'phone', 'is_active', 'default_category_external_id', 'default_category_name'],
      rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.email || '', x.phone || '', x.is_active, x.default_category_external_id || '', x.default_category_name || '']),
    };
  }
  if (entity === 'jobs') {
    const r = await executor.query(
      `SELECT j.code,j.title,j.name,j.notes,j.is_active,j.is_closed,j.expected_revenue_cents,j.expected_cost_cents,j.start_date,j.end_date,c.name AS contact_name
       FROM jobs j
       LEFT JOIN contacts c ON c.id = j.contact_id AND c.company_id = j.company_id
       WHERE j.company_id=$1
       ORDER BY j.id`,
      [companyId]
    );
    return {
      headers: ['code', 'title', 'name', 'notes', 'contact_name', 'is_active', 'is_closed', 'expected_revenue_cents', 'expected_cost_cents', 'start_date', 'end_date'],
      rows: r.rows.map((x) => [x.code || slug(x.title || x.name), x.title || '', x.name || '', x.notes || '', x.contact_name || '', x.is_active, x.is_closed, x.expected_revenue_cents ?? '', x.expected_cost_cents ?? '', x.start_date || '', x.end_date || '']),
    };
  }
  if (entity === 'properties') {
    const r = await executor.query(`SELECT p.external_id,p.name,p.address,p.notes,p.is_active,c.external_id AS contact_external_id,c.name AS contact_name
      FROM properties p LEFT JOIN contacts c ON c.id=p.contact_id AND c.company_id=p.company_id WHERE p.company_id=$1 ORDER BY p.id`, [companyId]);
    return {
      headers: ['external_id', 'name', 'notes', 'is_active', 'contact_external_id', 'contact_name', 'address'],
      rows: r.rows.map((x) => [x.external_id || slug(x.name), x.name, x.notes || '', x.is_active, x.contact_external_id || (x.contact_name ? slug(x.contact_name) : ''), x.contact_name || '', x.address || '']),
    };
  }
  if (entity === 'recurring_templates') {
    const r = await executor.query(
      `SELECT rt.external_id,rt.title,rt.frequency,rt.interval,rt.start_date,rt.end_date,
              rt.is_active,rt.amount,rt.movement_type,rt.notes,
              a.external_id AS account_external_id,a.name AS account_name,
              p.external_id AS property_external_id,j.code AS job_code,COALESCE(j.title,j.name) AS job_name
       FROM recurring_templates rt
       LEFT JOIN accounts a ON a.id = rt.account_id AND a.company_id = rt.company_id
       LEFT JOIN properties p ON p.id=rt.property_id AND p.company_id=rt.company_id
       LEFT JOIN jobs j ON j.id=rt.job_id AND j.company_id=rt.company_id
       WHERE rt.company_id=$1
       ORDER BY rt.id`,
      [companyId]
    );
    return {
      headers: ['external_id', 'title', 'frequency', 'interval', 'start_date', 'end_date', 'is_active', 'amount', 'movement_type', 'account_external_id', 'account_name', 'notes', 'property_external_id', 'job_code', 'job_name'],
      rows: r.rows.map((x) => [x.external_id || slug(x.title), x.title, x.frequency, x.interval, x.start_date || '', x.end_date || '', x.is_active, Number(x.amount).toFixed(2), x.movement_type, x.account_external_id || '', x.account_name || '', x.notes || '', x.property_external_id || '', x.job_code || '', x.job_name || '']),
    };
  }
  if (entity === 'transactions') {
    const r = await executor.query(`SELECT t.id,t.external_id,t.date,t.type,t.amount_total,t.description,
      c.external_id AS category_external_id,c.name AS category_name,
      ct.external_id AS contact_external_id,ct.name AS contact_name,
      j.code AS job_code,p.external_id AS property_external_id,p.name AS property_name
      FROM transactions t
      LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN contacts ct ON ct.id=t.contact_id
      LEFT JOIN jobs j ON j.id=t.job_id AND j.company_id=t.company_id
      LEFT JOIN properties p ON p.id=t.property_id AND p.company_id=t.company_id
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
    const payload = await withModuleWrite(req.companyId, capabilitiesForEntity(entity), client => exportEntity(entity, req.companyId, client), { action: 'export', permissionGranted: canRole(req.companyRole, 'export') });
    if (!payload) return sendError(res, 404, 'NOT_FOUND', 'Entity not supported');
    const csv = [payload.headers.join(','), ...payload.rows.map((row) => row.map(csvEsc).join(','))].join('\n');
    const filename = exportFilenameByEntity[entity]?.() || `${entity}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return sendModuleError(res, error);
  }
});

router.post('/:entity', rawUpload, async (req, res) => {
  if (!ensurePermission(req, res)) return;
  const entity = req.params.entity;
  if (entity === 'transactions') {
    return sendError(
      res,
      400,
      'IMPORT_USE_MOVEMENT_WIZARD',
      'Use the dedicated movement import so account legs and balances stay consistent.'
    );
  }
  if (!Object.hasOwn(exportFilenameByEntity, entity)) return sendError(res, 404, 'NOT_FOUND', 'Entity not supported');
  const fileBuffer = parseMultipartFile(req);
  if (!fileBuffer) return sendError(res, 400, 'NO_FILE', 'No file uploaded.');

  let client;
  try {
    const text = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Empty CSV');
    const headers = parseCsvLine(lines[0], ',').map((h) => h.toLowerCase());
    const rows = lines.slice(1).map((l) => parseCsvLine(l, ','));
    client = await getClient();
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
    const current = await lockCompanyModules(client, req.companyId);
    assertModuleAccess(current.states, capabilitiesForEntity(entity), 'write', { permissionGranted: canRole(req.companyRole, 'import') });
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      await client.query('SAVEPOINT csv_row');
      try {
        if (entity === 'accounts') {
          const externalId = row[idx('external_id')] || slug(row[idx('name')]);
          const found = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query(
              `UPDATE accounts
               SET name=$1,
                   type=$2,
                   balance=balance + ($3 - opening_balance),
                   opening_balance=$3,
                   is_active=$4
               WHERE id=$5 AND company_id=$6`,
              [row[idx('name')], row[idx('type')], asNum(row[idx('opening_balance')]), asBool(row[idx('is_active')]), found.rows[0].id, req.companyId]
            );
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
            await client.query('UPDATE jobs SET title=$1,name=$2,notes=$3,is_active=$4,is_closed=$5,expected_revenue_cents=$6,expected_cost_cents=$7,start_date=$8,end_date=$9 WHERE id=$10', [row[idx('title')] || row[idx('name')], row[idx('name')] || row[idx('title')], row[idx('notes')] || null, asBool(row[idx('is_active')]), asBool(row[idx('is_closed')], false), row[idx('expected_revenue_cents')] ? Math.round(asNum(row[idx('expected_revenue_cents')])) : null, row[idx('expected_cost_cents')] ? Math.round(asNum(row[idx('expected_cost_cents')])) : null, row[idx('start_date')] || null, row[idx('end_date')] || null, found.rows[0].id]);
            updated += 1;
          } else {
            await client.query('INSERT INTO jobs (company_id,code,title,name,notes,is_active,is_closed,expected_revenue_cents,expected_cost_cents,start_date,end_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [req.companyId, code, row[idx('title')] || row[idx('name')], row[idx('name')] || row[idx('title')], row[idx('notes')] || null, asBool(row[idx('is_active')]), asBool(row[idx('is_closed')], false), row[idx('expected_revenue_cents')] ? Math.round(asNum(row[idx('expected_revenue_cents')])) : null, row[idx('expected_cost_cents')] ? Math.round(asNum(row[idx('expected_cost_cents')])) : null, row[idx('start_date')] || null, row[idx('end_date')] || null]);
            created += 1;
          }
        } else if (entity === 'properties') {
          const externalId = row[idx('external_id')] || slug(row[idx('name')]);
          const contactExternal = row[idx('contact_external_id')];
          const contactId = contactExternal ? await resolveByExternal('contacts', contactExternal, contactExternal) : null;
          const found = await client.query('SELECT id FROM properties WHERE company_id=$1 AND external_id=$2', [req.companyId, externalId]);
          if (found.rowCount) {
            await client.query('UPDATE properties SET name=$1,notes=$2,contact_id=$3,is_active=$4,address=CASE WHEN $6::boolean THEN $7::text ELSE address END WHERE id=$5', [row[idx('name')], row[idx('notes')] || null, contactId, asBool(row[idx('is_active')]), found.rows[0].id, idx('address') >= 0, row[idx('address')] || null]);
            updated += 1;
          } else {
            await client.query('INSERT INTO properties (company_id,external_id,name,notes,contact_id,is_active,address) VALUES ($1,$2,$3,$4,$5,$6,$7)', [req.companyId, externalId, row[idx('name')], row[idx('notes')] || null, contactId, asBool(row[idx('is_active')]), row[idx('address')] || null]);
            created += 1;
          }
        } else if (entity === 'recurring_templates') {
          const externalId = row[idx('external_id')] || slug(row[idx('title')]);
          const accountExternalId = idx('account_external_id') >= 0 ? row[idx('account_external_id')] : '';
          const accountName = idx('account_name') >= 0 ? row[idx('account_name')] : '';
          const accountId = await resolveByExternal('accounts', accountExternalId, accountName);
          if (!accountId) throw new Error('account not found');
          const found = await client.query('SELECT * FROM recurring_templates WHERE company_id=$1 AND external_id=$2 FOR UPDATE', [req.companyId, externalId]);
          const previous = found.rows[0] || {};
          const links = { job_id: previous.job_id ?? null, property_id: previous.property_id ?? null };
          if (idx('property_external_id') >= 0) {
            const external = row[idx('property_external_id')] || '';
            links.property_id = external ? await resolveByExternal('properties', external, null) : null;
            if (external && !links.property_id) throw Object.assign(new Error('RECURRING_INVALID_REFERENCE'), { code: 'RECURRING_INVALID_REFERENCE' });
          }
          if (idx('job_code') >= 0 || idx('job_name') >= 0) {
            const code = (row[idx('job_code')] || '').trim();
            const name = (row[idx('job_name')] || '').trim();
            const target = code ? await client.query('SELECT id FROM jobs WHERE company_id=$1 AND code=$2', [req.companyId, code])
              : name ? await client.query('SELECT id FROM jobs WHERE company_id=$1 AND (lower(title)=lower($2) OR lower(name)=lower($2))', [req.companyId, name]) : { rows: [] };
            if ((code || name) && target.rows.length !== 1) throw Object.assign(new Error('RECURRING_INVALID_REFERENCE'), { code: 'RECURRING_INVALID_REFERENCE' });
            links.job_id = target.rows[0]?.id ?? null;
          }
          assertModuleLinkChanges(current.states, previous, links, { permissionGranted: canRole(req.companyRole, 'import') });
          const nextActive = idx('is_active') >= 0 ? asBool(row[idx('is_active')]) : previous.is_active ?? true;
          if (nextActive && !previous.is_active) assertRecurringActivation(current.states, links, { permissionGranted: canRole(req.companyRole, 'import') });
          const params = [row[idx('title')], row[idx('frequency')] || 'monthly', Number(row[idx('interval')] || 1), row[idx('start_date')] || null, row[idx('end_date')] || null, nextActive, asNum(row[idx('amount')]), row[idx('movement_type')] || 'expense', accountId, row[idx('notes')] || null];
          if (found.rowCount) {
            await client.query('UPDATE recurring_templates SET title=$1,frequency=$2,interval=$3,start_date=$4,end_date=$5,is_active=$6,amount=$7,movement_type=$8,account_id=$9,notes=$10,property_id=$11,job_id=$12 WHERE id=$13 AND company_id=$14', [...params, links.property_id, links.job_id, found.rows[0].id, req.companyId]);
            updated += 1;
          } else {
            await client.query('INSERT INTO recurring_templates (company_id,external_id,title,frequency,interval,start_date,end_date,is_active,amount,movement_type,account_id,notes,property_id,job_id,next_run_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())', [req.companyId, externalId, ...params, links.property_id, links.job_id]);
            created += 1;
          }
        } else {
          throw new Error('Entity not supported');
        }
        await client.query('RELEASE SAVEPOINT csv_row');
      } catch (rowError) {
        await client.query('ROLLBACK TO SAVEPOINT csv_row');
        await client.query('RELEASE SAVEPOINT csv_row');
        if (rowError.status === 403) throw rowError;
        errors += 1;
        errorRows.push({ line: i + 2, message: rowError.message });
      }
    }
    await writeAuditLog({ client, companyId: req.companyId, userId: req.user.user_id, action: 'import', entityType: entity, meta: { created, updated, errors } });
    await client.query('COMMIT');
    return res.json({ ok: created + updated, created, updated, errors, error_rows: errorRows.slice(0, 50) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return sendModuleError(res, error);
  } finally { client?.release(); }
});

export default router;
