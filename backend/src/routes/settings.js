import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { requirePermission } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';
import { writeAuditLog } from '../services/audit.js';
import { getClient, query } from '../db/index.js';
import { parseCsvDateToISO } from '../utils/dateParse.js';
import { parseMultipartFile, safeFileName } from '../utils/multipart.js';

const router = express.Router();

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const attachmentMaxMb = Number(process.env.ATTACHMENT_MAX_MB || 20);
const uploadLimitBytes = Math.max(1, attachmentMaxMb) * 1024 * 1024;
const rawUpload = express.raw({ type: 'multipart/form-data', limit: `${uploadLimitBytes}b` });

const allowedLogoMime = new Set(['image/png', 'image/jpeg', 'image/webp']);
const allowedIconMime = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico']);
const metadataFileName = 'branding.json';
const iconVariantNames = ['favicon', 'apple_touch_icon', 'icon_192', 'icon_512'];


const decodeCsvBuffer = (buffer) => {
  const utf8 = buffer.toString('utf8').replace(/^﻿/, '');
  if (utf8.includes('�')) {
    return buffer.toString('latin1').replace(/^﻿/, '');
  }
  return utf8;
};

const parseCsvLine = (line, delimiter = ';') => {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
};

const normalizeMovementType = (value = '') => {
  const v = String(value).trim().toLowerCase();
  if (['income', 'entrata'].includes(v)) return 'income';
  if (['expense', 'uscita'].includes(v)) return 'expense';
  if (['transfer', 'giroconto'].includes(v)) return 'transfer';
  return null;
};

const parseAmount = (value) => {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return NaN;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;

  if (hasComma && hasDot) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

const getDirectionDelta = (direction, amount) => (direction === 'in' ? amount : -amount);

const getBrandingDir = (companyId) => path.join(uploadsRoot, `company_${companyId}`, 'branding');
const getMetadataPath = (companyId) => path.join(getBrandingDir(companyId), metadataFileName);

const normalizeBrandingMeta = (raw) => {
  if (!raw) return { logo: null, icons: null };
  if (raw.logo || raw.icons) {
    return {
      logo: raw.logo || null,
      icons: raw.icons || null,
    };
  }

  // Backward compatibility for legacy flat logo metadata
  if (raw.file_name) {
    return {
      logo: {
        file_name: raw.file_name,
        mime_type: raw.mime_type,
        size: raw.size,
        updated_at: raw.updated_at,
      },
      icons: null,
    };
  }

  return { logo: null, icons: null };
};

const readBrandingMeta = async (companyId) => {
  try {
    const metadataPath = getMetadataPath(companyId);
    const raw = await fs.readFile(metadataPath, 'utf8');
    return normalizeBrandingMeta(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { logo: null, icons: null };
    }
    throw error;
  }
};

const writeBrandingMeta = async (companyId, metadata) => {
  const brandingDir = getBrandingDir(companyId);
  await fs.mkdir(brandingDir, { recursive: true });
  await fs.writeFile(getMetadataPath(companyId), JSON.stringify(metadata, null, 2));
};

const unlinkFileIfExists = async (filePath) => {
  await fs.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

const parsePngDimensions = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const parseIcoLargestDimensions = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return null;
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const imageCount = buffer.readUInt16LE(4);
  if (!imageCount) return null;
  let largest = 0;
  for (let i = 0; i < imageCount; i += 1) {
    const offset = 6 + (16 * i);
    if (offset + 16 > buffer.length) break;
    const width = buffer.readUInt8(offset) || 256;
    const height = buffer.readUInt8(offset + 1) || 256;
    largest = Math.max(largest, width, height);
  }
  return largest ? { width: largest, height: largest } : null;
};

const inferImageDimensions = (parsedFile) => {
  if (parsedFile.mimeType === 'image/png') return parsePngDimensions(parsedFile.buffer);
  if (['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'].includes(parsedFile.mimeType)) return parseIcoLargestDimensions(parsedFile.buffer);
  return null;
};

const generateUploadedName = (parsedFile, defaultBaseName) => {
  const extByMime = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'image/ico': 'ico',
  };
  const extension = extByMime[parsedFile.mimeType] || 'bin';
  const originalBaseName = path.basename(parsedFile.originalName, path.extname(parsedFile.originalName)) || defaultBaseName;
  return `${crypto.randomUUID()}_${safeFileName(originalBaseName)}.${extension}`;
};

const deleteCurrentLogo = async (companyId) => {
  const meta = await readBrandingMeta(companyId);
  const brandingDir = getBrandingDir(companyId);
  const current = meta?.logo || null;
  if (!current?.file_name) return null;
  await unlinkFileIfExists(path.join(brandingDir, current.file_name));
  const nextMeta = { ...meta, logo: null };
  if (!nextMeta.icons) {
    await unlinkFileIfExists(getMetadataPath(companyId));
  } else {
    await writeBrandingMeta(companyId, nextMeta);
  }
  return current;
};

const deleteCurrentIcons = async (companyId) => {
  const meta = await readBrandingMeta(companyId);
  const brandingDir = getBrandingDir(companyId);
  const current = meta?.icons || null;
  if (!current?.variants) return null;

  for (const variant of iconVariantNames) {
    const fileName = current.variants[variant]?.file_name;
    if (fileName) {
      // eslint-disable-next-line no-await-in-loop
      await unlinkFileIfExists(path.join(brandingDir, fileName));
    }
  }

  const nextMeta = { ...meta, icons: null };
  if (!nextMeta.logo) {
    await unlinkFileIfExists(getMetadataPath(companyId));
  } else {
    await writeBrandingMeta(companyId, nextMeta);
  }

  return current;
};

const toBrandingSummary = (meta) => {
  const icons = meta?.icons || null;
  return {
    has_logo: Boolean(meta?.logo?.file_name),
    updated_at: meta?.logo?.updated_at || null,
    icons: {
      has_custom: Boolean(icons?.variants?.favicon?.file_name || icons?.variants?.apple_touch_icon?.file_name),
      source_type: icons?.source_type || 'default',
      updated_at: icons?.updated_at || null,
      variants: {
        favicon: {
          available: Boolean(icons?.variants?.favicon?.file_name),
          mime_type: icons?.variants?.favicon?.mime_type || null,
          size: icons?.variants?.favicon?.size || null,
          file_name: icons?.variants?.favicon?.file_name || null,
        },
        apple_touch_icon: {
          available: Boolean(icons?.variants?.apple_touch_icon?.file_name),
          mime_type: icons?.variants?.apple_touch_icon?.mime_type || null,
          size: icons?.variants?.apple_touch_icon?.size || null,
          file_name: icons?.variants?.apple_touch_icon?.file_name || null,
        },
        icon_192: { available: Boolean(icons?.variants?.icon_192?.file_name) },
        icon_512: { available: Boolean(icons?.variants?.icon_512?.file_name) },
      },
    },
  };
};

router.get('/branding', async (req, res) => {
  try {
    const meta = await readBrandingMeta(req.companyId);
    return res.json(toBrandingSummary(meta));
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/branding/logo', async (req, res) => {
  try {
    const meta = await readBrandingMeta(req.companyId);
    if (!meta?.logo?.file_name) {
      return sendError(res, 404, 'NOT_FOUND', 'Logo non trovato.');
    }

    const fullPath = path.join(getBrandingDir(req.companyId), meta.logo.file_name);
    res.setHeader('Content-Type', meta.logo.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(meta.logo.file_name)}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return sendError(res, 404, 'NOT_FOUND', 'Logo non trovato.');
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/branding/logo', requirePermission('users_manage'), rawUpload, async (req, res) => {
  if (!(req.headers['content-type'] || '').includes('multipart/form-data')) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  const parsedFile = parseMultipartFile(req);
  if (!parsedFile || !parsedFile.originalName || parsedFile.size === 0) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  if (parsedFile.size > uploadLimitBytes) {
    return sendError(res, 413, 'FILE_TOO_LARGE', 'File troppo grande.', { details: { max_mb: attachmentMaxMb } });
  }

  if (!allowedLogoMime.has(parsedFile.mimeType)) {
    return sendError(res, 400, 'VALIDATION_INVALID_FILE_TYPE', 'Formato logo non supportato. Usa PNG/JPG/WEBP.');
  }

  try {
    const brandingDir = getBrandingDir(req.companyId);
    await fs.mkdir(brandingDir, { recursive: true });

    const previousMeta = await readBrandingMeta(req.companyId);
    const generatedName = generateUploadedName(parsedFile, 'logo');
    const fullPath = path.join(brandingDir, generatedName);
    const logoMetadata = {
      file_name: generatedName,
      mime_type: parsedFile.mimeType,
      size: parsedFile.size,
      updated_at: new Date().toISOString(),
    };
    const nextMeta = {
      ...previousMeta,
      logo: logoMetadata,
    };

    try {
      await fs.writeFile(fullPath, parsedFile.buffer);
      await writeBrandingMeta(req.companyId, nextMeta);
    } catch (writeError) {
      await unlinkFileIfExists(fullPath);
      throw writeError;
    }

    if (previousMeta?.logo?.file_name && previousMeta.logo.file_name !== generatedName) {
      await unlinkFileIfExists(path.join(brandingDir, previousMeta.logo.file_name));
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'update',
      entityType: 'branding',
      entityId: req.companyId,
      meta: { logo_file_name: generatedName },
    });

    return res.status(201).json({ status: 'saved', updated_at: logoMetadata.updated_at });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'BRANDING_UPLOAD_FAILED', 'Upload logo non riuscito.');
  }
});

router.delete('/branding/logo', requirePermission('users_manage'), async (req, res) => {
  try {
    const previous = await deleteCurrentLogo(req.companyId);
    if (!previous) {
      return res.status(204).send();
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'delete',
      entityType: 'branding',
      entityId: req.companyId,
      meta: { file_name: previous.file_name },
    });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/branding/icons/:variant', async (req, res) => {
  try {
    const variantKey = req.params.variant === 'apple-touch-icon' ? 'apple_touch_icon' : req.params.variant;
    if (!iconVariantNames.includes(variantKey)) {
      return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    }

    const meta = await readBrandingMeta(req.companyId);
    const variant = meta?.icons?.variants?.[variantKey];
    if (!variant?.file_name) {
      return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    }

    const fullPath = path.join(getBrandingDir(req.companyId), variant.file_name);
    res.setHeader('Content-Type', variant.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(variant.file_name)}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    }
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/branding/icons', requirePermission('users_manage'), rawUpload, async (req, res) => {
  if (!(req.headers['content-type'] || '').includes('multipart/form-data')) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  const parsedFile = parseMultipartFile(req);
  if (!parsedFile || !parsedFile.originalName || parsedFile.size === 0) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  if (parsedFile.size > uploadLimitBytes) {
    return sendError(res, 413, 'FILE_TOO_LARGE', 'File troppo grande.', { details: { max_mb: attachmentMaxMb } });
  }

  if (!allowedIconMime.has(parsedFile.mimeType)) {
    return sendError(res, 400, 'VALIDATION_INVALID_FILE_TYPE', 'Formato icona non supportato. Usa PNG/ICO.');
  }

  const dimensions = inferImageDimensions(parsedFile);
  if (!dimensions || dimensions.width < 32 || dimensions.height < 32) {
    return sendError(res, 400, 'VALIDATION_INVALID_ICON_DIMENSIONS', 'L’icona deve essere almeno 32x32 pixel.');
  }

  try {
    const brandingDir = getBrandingDir(req.companyId);
    await fs.mkdir(brandingDir, { recursive: true });
    const previousMeta = await readBrandingMeta(req.companyId);
    const generatedName = generateUploadedName(parsedFile, 'favicon');
    const fullPath = path.join(brandingDir, generatedName);
    const updatedAt = new Date().toISOString();
    const canServeAppleTouch = parsedFile.mimeType === 'image/png' && dimensions.width >= 180 && dimensions.height >= 180;

    const faviconVariant = {
      file_name: generatedName,
      mime_type: parsedFile.mimeType,
      size: parsedFile.size,
      updated_at: updatedAt,
    };
    const nextVariants = {
      favicon: faviconVariant,
      apple_touch_icon: canServeAppleTouch ? faviconVariant : null,
      icon_192: parsedFile.mimeType === 'image/png' && dimensions.width >= 192 && dimensions.height >= 192 ? faviconVariant : null,
      icon_512: parsedFile.mimeType === 'image/png' && dimensions.width >= 512 && dimensions.height >= 512 ? faviconVariant : null,
    };

    const nextMeta = {
      ...previousMeta,
      icons: {
        source_type: 'custom',
        updated_at: updatedAt,
        dimensions,
        variants: nextVariants,
      },
    };

    try {
      await fs.writeFile(fullPath, parsedFile.buffer);
      await writeBrandingMeta(req.companyId, nextMeta);
    } catch (writeError) {
      await unlinkFileIfExists(fullPath);
      throw writeError;
    }

    if (previousMeta?.icons?.variants) {
      const previousFileNames = new Set(iconVariantNames.map((name) => previousMeta.icons.variants[name]?.file_name).filter(Boolean));
      if (!previousFileNames.has(generatedName)) {
        for (const fileName of previousFileNames) {
          // eslint-disable-next-line no-await-in-loop
          await unlinkFileIfExists(path.join(brandingDir, fileName));
        }
      }
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'update',
      entityType: 'branding_icons',
      entityId: req.companyId,
      meta: { icon_file_name: generatedName, apple_touch_icon: canServeAppleTouch },
    });

    return res.status(201).json({
      status: 'saved',
      updated_at: updatedAt,
      variants: {
        favicon: true,
        apple_touch_icon: canServeAppleTouch,
        icon_192: Boolean(nextVariants.icon_192),
        icon_512: Boolean(nextVariants.icon_512),
      },
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'BRANDING_UPLOAD_FAILED', 'Upload icona non riuscito.');
  }
});

router.delete('/branding/icons', requirePermission('users_manage'), async (req, res) => {
  try {
    const previous = await deleteCurrentIcons(req.companyId);
    if (!previous) {
      return res.status(204).send();
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'delete',
      entityType: 'branding_icons',
      entityId: req.companyId,
      meta: { restored_default: true },
    });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});


router.post('/movements/import-csv', requirePermission('users_manage'), rawUpload, async (req, res) => {
  if (!(req.headers['content-type'] || '').includes('multipart/form-data')) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  const parsedFile = parseMultipartFile(req);
  if (!parsedFile || !parsedFile.originalName || parsedFile.size === 0) {
    return sendError(res, 400, 'NO_FILE', 'Nessun file selezionato.');
  }

  const text = decodeCsvBuffer(parsedFile.buffer);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'CSV vuoto o non valido.');
  }

  const semicolonHeaders = parseCsvLine(lines[0], ';');
  const commaHeaders = parseCsvLine(lines[0], ',');
  const delimiter = semicolonHeaders.length >= commaHeaders.length ? ';' : ',';
  const headers = (delimiter === ';' ? semicolonHeaders : commaHeaders).map((h) => h.toLowerCase());

  const idx = {
    date: headers.indexOf('date'),
    type: headers.indexOf('type'),
    amount: headers.indexOf('amount_total'),
    accountNames: headers.indexOf('account_names'),
    category: headers.indexOf('category'),
    contact: headers.indexOf('contact'),
    job: headers.indexOf('commessa') >= 0 ? headers.indexOf('commessa') : headers.indexOf('job'),
    description: headers.indexOf('description'),
  };

  if (idx.date < 0 || idx.type < 0 || idx.amount < 0 || idx.accountNames < 0) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Header CSV non valido.');
  }

  const [accountsResult, categoriesResult, contactsResult, jobsResult] = await Promise.all([
    query('SELECT id, name FROM accounts WHERE company_id = $1', [req.companyId]),
    query('SELECT id, name FROM categories WHERE company_id = $1', [req.companyId]),
    query('SELECT id, name FROM contacts WHERE company_id = $1', [req.companyId]),
    query('SELECT id, name, title FROM jobs WHERE company_id = $1', [req.companyId]),
  ]);

  const accountByName = new Map(accountsResult.rows.map((r) => [String(r.name || '').trim().toLowerCase(), r.id]));
  const categoryByName = new Map(categoriesResult.rows.map((r) => [String(r.name || '').trim().toLowerCase(), r.id]));
  const contactByName = new Map(contactsResult.rows.map((r) => [String(r.name || '').trim().toLowerCase(), r.id]));
  const jobByName = new Map(jobsResult.rows.map((r) => [String((r.name || r.title || '')).trim().toLowerCase(), r.id]));

  let imported = 0;
  let skipped = 0;
  const errors = [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex], delimiter);
      let date;
      const type = normalizeMovementType(row[idx.type]);
      const amountAbs = Math.abs(parseAmount(row[idx.amount]));
      const accountRaw = String(row[idx.accountNames] || '');

      try {
        date = parseCsvDateToISO(row[idx.date]);
      } catch {
        skipped += 1;
        errors.push({ line: lineIndex + 1, message: 'Data non valida (formati supportati: YYYY-MM-DD, DD/MM/YYYY, formato legacy export)' });
        continue;
      }

      if (!date || !type || !Number.isFinite(amountAbs) || amountAbs <= 0 || !accountRaw) {
        skipped += 1;
        errors.push({ line: lineIndex + 1, message: 'Campi obbligatori mancanti o non validi' });
        continue;
      }

      const accountParts = accountRaw.split('→').map((v) => v.trim()).filter(Boolean);
      let accountEntries = [];

      if (type === 'transfer') {
        if (accountParts.length < 2) {
          skipped += 1;
          errors.push({ line: lineIndex + 1, message: 'Transfer richiede due conti' });
          continue;
        }

        const outId = accountByName.get(accountParts[0].toLowerCase());
        const inId = accountByName.get(accountParts[1].toLowerCase());
        if (!outId || !inId) {
          skipped += 1;
          errors.push({ line: lineIndex + 1, message: 'Conti non trovati' });
          continue;
        }

        accountEntries = [
          { account_id: outId, direction: 'out', amount: amountAbs },
          { account_id: inId, direction: 'in', amount: amountAbs },
        ];
      } else {
        const accountId = accountByName.get(accountParts[0].toLowerCase());
        if (!accountId) {
          skipped += 1;
          errors.push({ line: lineIndex + 1, message: 'Conto non trovato' });
          continue;
        }

        accountEntries = [
          { account_id: accountId, direction: type === 'income' ? 'in' : 'out', amount: amountAbs },
        ];
      }

      const categoryId = idx.category >= 0 ? (categoryByName.get(String(row[idx.category] || '').trim().toLowerCase()) || null) : null;
      const contactId = idx.contact >= 0 ? (contactByName.get(String(row[idx.contact] || '').trim().toLowerCase()) || null) : null;
      const jobId = idx.job >= 0 ? (jobByName.get(String(row[idx.job] || '').trim().toLowerCase()) || null) : null;
      const description = idx.description >= 0 ? String(row[idx.description] || '').trim() : '';
      const signedAmount = type === 'expense' ? -amountAbs : amountAbs;

      const tx = await client.query(
        `INSERT INTO transactions (company_id, date, type, amount_total, description, category_id, contact_id, property_id, job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [req.companyId, date, type, signedAmount, description || null, categoryId, contactId, null, jobId]
      );

      for (const entry of accountEntries) {
        await client.query(
          'INSERT INTO transaction_accounts (transaction_id, account_id, direction, amount) VALUES ($1, $2, $3, $4)',
          [tx.rows[0].id, entry.account_id, entry.direction, entry.amount]
        );
        await client.query(
          'UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND company_id = $3',
          [getDirectionDelta(entry.direction, entry.amount), entry.account_id, req.companyId]
        );
      }

      imported += 1;
    }

    await client.query('COMMIT');
    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'import',
      entityType: 'movements',
      entityId: null,
      meta: { imported, skipped },
    });

    return res.status(201).json({ imported, skipped, errors: errors.slice(0, 20) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return sendError(res, 500, 'MOVEMENTS_IMPORT_FAILED', 'Import CSV movimenti non riuscito.', { details: { message: error.message } });
  } finally {
    client.release();
  }
});

router.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return sendError(res, 413, 'FILE_TOO_LARGE', 'File troppo grande.', { details: { max_mb: attachmentMaxMb } });
  }
  console.error(error);
  return sendError(res, 500, 'BRANDING_UPLOAD_FAILED', 'Upload logo non riuscito.');
});

export default router;
