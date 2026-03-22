import test from 'node:test';
import assert from 'node:assert/strict';
import { inferMimeTypeFromName, parseMultipartFile, safeFileName } from '../src/utils/multipart.js';

const buildRequest = ({ headers, body }) => ({ headers, body });

test('safeFileName normalizes unsupported characters', () => {
  assert.equal(safeFileName('flussio logo@2x.png'), 'flussio_logo_2x.png');
});

test('inferMimeTypeFromName falls back from file extension', () => {
  assert.equal(inferMimeTypeFromName('brand-logo.webp'), 'image/webp');
  assert.equal(inferMimeTypeFromName('brand-logo.unknown', 'application/octet-stream'), 'application/octet-stream');
});

test('parseMultipartFile supports filename* uploads and infers mime type when missing', () => {
  const boundary = '----flussioBoundary';
  const payload = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename*=UTF-8''Brand%20Logo.PNG`,
    '',
    'PNGDATA',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const parsed = parseMultipartFile(buildRequest({
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(payload, 'latin1'),
  }));

  assert.ok(parsed);
  assert.equal(parsed.originalName, 'Brand Logo.PNG');
  assert.equal(parsed.mimeType, 'image/png');
  assert.equal(parsed.size, 7);
  assert.equal(parsed.buffer.toString('latin1'), 'PNGDATA');
});
