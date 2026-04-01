import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { sendError } from '../utils/httpErrors.js';
import { safeFileName } from '../utils/multipart.js';

const router = express.Router();

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const metadataFileName = 'branding.json';
const iconVariantNames = ['favicon', 'apple_touch_icon', 'icon_192', 'icon_512'];

const getBrandingDir = (companyId) => path.join(uploadsRoot, `company_${companyId}`, 'branding');
const getMetadataPath = (companyId) => path.join(getBrandingDir(companyId), metadataFileName);

const normalizeBrandingMeta = (raw) => {
  if (!raw) return { logo: null, icons: null };
  if (raw.logo || raw.icons) {
    return { logo: raw.logo || null, icons: raw.icons || null };
  }

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
    const raw = await fs.readFile(getMetadataPath(companyId), 'utf8');
    return normalizeBrandingMeta(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') return { logo: null, icons: null };
    throw error;
  }
};

const resolvePublicCompanyId = (req) => {
  const queryId = Number.parseInt(req.query.company_id, 10);
  const configured = Number.parseInt(process.env.PUBLIC_BRANDING_COMPANY_ID || '1', 10);
  const companyId = Number.isInteger(queryId) && queryId > 0 ? queryId : configured;
  return Number.isInteger(companyId) && companyId > 0 ? companyId : 1;
};

const toPublicIconSummary = (icons, companyId) => {
  const updatedAt = icons?.updated_at || null;
  const cacheSuffix = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
  const variants = {
    favicon: icons?.variants?.favicon?.file_name
      ? { mode: 'file', file_name: icons.variants.favicon.file_name, url: `/api/public/branding/icons/favicon?company_id=${companyId}${cacheSuffix ? `&v=${encodeURIComponent(updatedAt)}` : ''}` }
      : { mode: 'default', file_name: null, url: null },
    apple_touch_icon: icons?.variants?.apple_touch_icon?.file_name
      ? { mode: 'file', file_name: icons.variants.apple_touch_icon.file_name, url: `/api/public/branding/icons/apple-touch-icon?company_id=${companyId}${cacheSuffix ? `&v=${encodeURIComponent(updatedAt)}` : ''}` }
      : { mode: 'default', file_name: null, url: null },
    icon_192: icons?.variants?.icon_192?.file_name
      ? { mode: 'file', file_name: icons.variants.icon_192.file_name, url: `/api/public/branding/icons/icon_192?company_id=${companyId}${cacheSuffix ? `&v=${encodeURIComponent(updatedAt)}` : ''}` }
      : { mode: 'fallback', file_name: icons?.variants?.favicon?.file_name || null, url: null },
    icon_512: icons?.variants?.icon_512?.file_name
      ? { mode: 'file', file_name: icons.variants.icon_512.file_name, url: `/api/public/branding/icons/icon_512?company_id=${companyId}${cacheSuffix ? `&v=${encodeURIComponent(updatedAt)}` : ''}` }
      : { mode: 'fallback', file_name: icons?.variants?.favicon?.file_name || null, url: null },
  };

  return {
    has_custom: Boolean(icons?.source?.file_name || icons?.variants?.favicon?.file_name),
    source_file_name: icons?.source?.file_name || icons?.variants?.favicon?.file_name || null,
    source_mime_type: icons?.source?.mime_type || icons?.variants?.favicon?.mime_type || null,
    updated_at: updatedAt,
    variants,
  };
};

router.get('/branding', async (req, res) => {
  try {
    const companyId = resolvePublicCompanyId(req);
    const meta = await readBrandingMeta(companyId);
    const icons = toPublicIconSummary(meta?.icons || null, companyId);
    return res.json({
      company_id: companyId,
      icons,
      manifest_url: `/api/public/branding/manifest.webmanifest?company_id=${companyId}${icons.updated_at ? `&v=${encodeURIComponent(icons.updated_at)}` : ''}`,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/branding/icons/:variant', async (req, res) => {
  try {
    const companyId = resolvePublicCompanyId(req);
    const variantKey = req.params.variant === 'apple-touch-icon' ? 'apple_touch_icon' : req.params.variant;
    if (!iconVariantNames.includes(variantKey)) {
      return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    }

    const meta = await readBrandingMeta(companyId);
    const variant = meta?.icons?.variants?.[variantKey];
    if (!variant?.file_name) {
      return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    }

    const fullPath = path.join(getBrandingDir(companyId), variant.file_name);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', variant.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(variant.file_name)}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    console.error(error);
    if (error.code === 'ENOENT') return sendError(res, 404, 'NOT_FOUND', 'Icona non trovata.');
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/branding/manifest.webmanifest', async (req, res) => {
  try {
    const companyId = resolvePublicCompanyId(req);
    const meta = await readBrandingMeta(companyId);
    const icons = toPublicIconSummary(meta?.icons || null, companyId);
    const manifestIcons = [
      icons.variants.icon_192.url ? { src: icons.variants.icon_192.url, sizes: '192x192', type: 'image/png', purpose: 'any' } : null,
      icons.variants.icon_512.url ? { src: icons.variants.icon_512.url, sizes: '512x512', type: 'image/png', purpose: 'any' } : null,
    ].filter(Boolean);

    return res.json({
      name: 'Flussio',
      short_name: 'Flussio',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#2563eb',
      icons: manifestIcons,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

export default router;
