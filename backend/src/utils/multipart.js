import path from 'path';

const IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
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

  return null;
};

export const inferMimeTypeFromName = (fileName = '', fallback = 'application/octet-stream') => {
  const extension = path.extname(String(fileName).toLowerCase());
  return IMAGE_MIME_BY_EXTENSION[extension] || fallback;
};

export const parseMultipartFile = (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/i);
  if (!boundaryMatch || !Buffer.isBuffer(req.body)) {
    return null;
  }

  const boundaryValue = boundaryMatch[1].replace(/^"|"$/g, '');
  const boundary = `--${boundaryValue}`;
  const bodyString = req.body.toString('latin1');
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
