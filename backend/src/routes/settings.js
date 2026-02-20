import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { requirePermission } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';
import { writeAuditLog } from '../services/audit.js';

const router = express.Router();

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const attachmentMaxMb = Number(process.env.ATTACHMENT_MAX_MB || 20);
const uploadLimitBytes = Math.max(1, attachmentMaxMb) * 1024 * 1024;
const rawUpload = express.raw({ type: 'multipart/form-data', limit: `${uploadLimitBytes}b` });

const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);
const metadataFileName = 'branding.json';

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const parseMultipartFile = (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch || !Buffer.isBuffer(req.body)) {
    return null;
  }

  const boundaryValue = boundaryMatch[1].replace(/^"|"$/g, '');
  const boundary = `--${boundaryValue}`;
  const bodyString = req.body.toString('binary');
  const partName = 'name="file"';
  const partStart = bodyString.indexOf(partName);
  if (partStart === -1) {
    return null;
  }

  const headerEnd = bodyString.indexOf('\r\n\r\n', partStart);
  if (headerEnd === -1) {
    return null;
  }

  const headerChunk = bodyString.slice(partStart, headerEnd);
  const fileNameMatch = headerChunk.match(/filename="([^"]+)"/i);
  if (!fileNameMatch) {
    return null;
  }

  const mimeTypeMatch = headerChunk.match(/Content-Type:\s*([^\r\n]+)/i);
  const dataStart = headerEnd + 4;
  const nextBoundary = bodyString.indexOf(`\r\n${boundary}`, dataStart);
  if (nextBoundary === -1) {
    return null;
  }

  const fileBuffer = req.body.subarray(dataStart, nextBoundary);
  return {
    originalName: fileNameMatch[1]?.trim(),
    mimeType: mimeTypeMatch?.[1]?.trim()?.toLowerCase() || 'application/octet-stream',
    size: fileBuffer.length,
    buffer: fileBuffer,
  };
};

const getBrandingDir = (companyId) => path.join(uploadsRoot, `company_${companyId}`, 'branding');
const getMetadataPath = (companyId) => path.join(getBrandingDir(companyId), metadataFileName);

const readBrandingMeta = async (companyId) => {
  try {
    const metadataPath = getMetadataPath(companyId);
    const raw = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const deleteCurrentLogo = async (companyId) => {
  const meta = await readBrandingMeta(companyId);
  if (!meta) {
    return null;
  }

  const brandingDir = getBrandingDir(companyId);
  if (meta.file_name) {
    await fs.unlink(path.join(brandingDir, meta.file_name)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  await fs.unlink(getMetadataPath(companyId)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });

  return meta;
};

router.get('/branding', async (req, res) => {
  try {
    const meta = await readBrandingMeta(req.user.company_id);
    return res.json({ has_logo: Boolean(meta?.file_name), updated_at: meta?.updated_at || null });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/branding/logo', async (req, res) => {
  try {
    const meta = await readBrandingMeta(req.user.company_id);
    if (!meta?.file_name) {
      return sendError(res, 404, 'NOT_FOUND', 'Logo non trovato.');
    }

    const fullPath = path.join(getBrandingDir(req.user.company_id), meta.file_name);
    res.setHeader('Content-Type', meta.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(meta.file_name)}"`);
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

  if (!allowedMime.has(parsedFile.mimeType)) {
    return sendError(res, 400, 'VALIDATION_INVALID_FILE_TYPE', 'Formato logo non supportato. Usa PNG/JPG/WEBP.');
  }

  try {
    const brandingDir = getBrandingDir(req.user.company_id);
    await fs.mkdir(brandingDir, { recursive: true });

    await deleteCurrentLogo(req.user.company_id);

    const extension = parsedFile.mimeType === 'image/png' ? 'png' : parsedFile.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const generatedName = `${crypto.randomUUID()}_${safeFileName(parsedFile.originalName)}.${extension}`;
    const fullPath = path.join(brandingDir, generatedName);

    await fs.writeFile(fullPath, parsedFile.buffer);

    const metadata = {
      file_name: generatedName,
      mime_type: parsedFile.mimeType,
      size: parsedFile.size,
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(getMetadataPath(req.user.company_id), JSON.stringify(metadata, null, 2));

    await writeAuditLog({
      companyId: req.user.company_id,
      userId: req.user.user_id,
      action: 'update',
      entityType: 'branding',
      entityId: req.user.company_id,
      meta: { file_name: generatedName },
    });

    return res.status(201).json({ status: 'saved', updated_at: metadata.updated_at });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'BRANDING_UPLOAD_FAILED', 'Upload logo non riuscito.');
  }
});

router.delete('/branding/logo', requirePermission('users_manage'), async (req, res) => {
  try {
    const previous = await deleteCurrentLogo(req.user.company_id);
    if (!previous) {
      return res.status(204).send();
    }

    await writeAuditLog({
      companyId: req.user.company_id,
      userId: req.user.user_id,
      action: 'delete',
      entityType: 'branding',
      entityId: req.user.company_id,
      meta: { file_name: previous.file_name },
    });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
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
