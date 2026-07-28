export const saveMovementWithAttachment = async ({ existingId, saveMovement, uploadAttachment, attachment, onMovementSaved }) => {
  let movementId = existingId || null;
  if (!movementId) {
    const movement = await saveMovement();
    movementId = movement.id;
    onMovementSaved?.(movementId);
  }
  if (attachment) {
    try {
      await uploadAttachment(movementId, attachment);
    } catch (error) {
      error.movementId = movementId;
      throw error;
    }
  }
  return movementId;
};
