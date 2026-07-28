import test from 'node:test';
import assert from 'node:assert/strict';
import { saveMovementWithAttachment } from '../src/utils/saveMovement.js';

test('retry uploads against the created movement without creating a duplicate', async () => {
  let creates = 0; let uploads = 0;
  const saveMovement = async () => { creates += 1; return { id: 42 }; };
  const uploadAttachment = async () => { uploads += 1; if (uploads === 1) throw new Error('upload failed'); };
  const firstError = await saveMovementWithAttachment({ saveMovement, uploadAttachment, attachment: {} }).catch((error) => error);
  assert.equal(firstError.code, 'ATTACHMENT_UPLOAD_FAILED');
  assert.equal(firstError.movementId, 42);
  const result = await saveMovementWithAttachment({ existingId: firstError.movementId, saveMovement, uploadAttachment, attachment: {} });
  assert.deepEqual(result, { movementId: 42, attachmentUploaded: true });
  assert.equal(creates, 1);
  assert.equal(uploads, 2);
});
