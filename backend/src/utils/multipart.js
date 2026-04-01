import path from 'path';

const IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

export const safeFileName = (name = '') => String(name).replace(/[^a-zA-Z0-9._-]/g, '_');

const decodeRfc5987Value = (value = '') => {
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(?:[A-Za-z0-9!#$&+.^_`|~-]+')?(?:[A-Za-z0-9-]*)'(.+)$/);
  const encodedValue = match?.[1] || trimmed;

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return encodedValue;
  }
};

const extractFileNameFromHeaders = (headerChunk = '') => {
  const encodedMatch = headerChunk.match(/filename\*=([^;\r\n]+)/i);
  if (encodedMatch?.[1]) {
    return decodeRfc5987Value(encodedMatch[1].replace(/^"|"$/g, ''));
  }

  const quotedMatch = headerChunk.match(/filename="([^"]*)"/i);
  if (quotedMatch?.[1] != null) {
    return quotedMatch[1].trim();
  }

  const bareMatch = headerChunk.match(/filename=([^;\r\n]+)/i);
  if (bareMatch?.[1]) {
    return bareMatch[1].trim().replace(/^"|"$/g, '');
  }

  return null;
};

const extractBoundary = (contentType = '') => {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return (match?.[1] || match?.[2] || '').trim();
};

export const inferMimeTypeFromName = (fileName = '', fallback = 'application/octet-stream') => {
  const extension = path.extname(String(fileName).toLowerCase());
  return IMAGE_MIME_BY_EXTENSION[extension] || fallback;
};

export const parseMultipartFile = (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryValue = extractBoundary(contentType);
  if (!boundaryValue || !Buffer.isBuffer(req.body)) {
    return null;
  }

  const boundary = `--${boundaryValue}`;
  const bodyString = req.body.toString('latin1');
  const partMatch = bodyString.match(/Content-Disposition:\s*form-data;[^\r\n]*name="file"[^\r\n]*/i);
  if (!partMatch || partMatch.index == null) {
    return null;
  }

  const partStart = bodyString.lastIndexOf(boundary, partMatch.index);
  const headerStart = partStart >= 0 ? partStart + boundary.length + 2 : partMatch.index;
  const headerEnd = bodyString.indexOf('\r\n\r\n', headerStart);
  if (headerEnd === -1) {
    return null;
  }

  const headerChunk = bodyString.slice(headerStart, headerEnd);
  const originalName = extractFileNameFromHeaders(headerChunk);
  if (!originalName) {
    return null;
  }

  const mimeTypeMatch = headerChunk.match(/Content-Type:\s*([^\r\n;]+)/i);
  const dataStart = headerEnd + 4;
  const nextBoundary = bodyString.indexOf(`\r\n${boundary}`, dataStart);
  if (nextBoundary === -1) {
    return null;
  }

  const fileBuffer = req.body.subarray(dataStart, nextBoundary);
  const rawMimeType = mimeTypeMatch?.[1]?.trim()?.toLowerCase() || 'application/octet-stream';
  const mimeType = rawMimeType === 'application/octet-stream'
    ? inferMimeTypeFromName(originalName, rawMimeType)
    : rawMimeType;

  return {
    originalName: path.basename(originalName.trim()),
    mimeType,
    size: fileBuffer.length,
    buffer: fileBuffer,
  };
};
