import test from 'node:test';
import assert from 'node:assert/strict';
import { saveMovementWithAttachment } from '../src/utils/saveMovement.js';

test('retry uploads against the created movement without creating a duplicate', async () => {
  let creates = 0; let uploads = 0;
  const saveMovement = async () => { creates += 1; return { id: 42 }; };
  const uploadAttachment = async () => { uploads += 1; if (uploads === 1) throw new Error('upload failed'); };
  let retainedId;
  let failure;
  try {
    await saveMovementWithAttachment({ saveMovement, uploadAttachment, attachment: {}, onMovementSaved: (id) => { retainedId = id; } });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure);
  assert.equal(failure.movementId, 42);
  await saveMovementWithAttachment({ existingId: retainedId, saveMovement, uploadAttachment, attachment: {} });
  assert.equal(creates, 1);
  assert.equal(uploads, 2);
});

test('concurrent UI guard can retain the id as soon as movement creation completes', async () => {
  const events = [];
  await saveMovementWithAttachment({
    saveMovement: async () => ({ id: 7 }),
    uploadAttachment: async (id) => events.push(`upload:${id}`),
    attachment: {},
    onMovementSaved: (id) => events.push(`saved:${id}`),
  });
  assert.deepEqual(events, ['saved:7', 'upload:7']);
});
