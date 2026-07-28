export const saveMovementWithAttachment = async ({ existingId, saveMovement, uploadAttachment, attachment }) => {
  let movementId = existingId || null;
  if (!movementId) {
    const movement = await saveMovement();
    movementId = movement.id;
  }
  if (attachment) {
    try {
      await uploadAttachment(movementId, attachment);
    } catch (cause) {
      const error = new Error('Movimento creato, ma allegato non caricato.');
      error.code = 'ATTACHMENT_UPLOAD_FAILED';
      error.movementId = movementId;
      error.cause = cause;
      throw error;
    }
  }
  return { movementId, attachmentUploaded: Boolean(attachment) };
};
