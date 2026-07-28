export const saveMovementWithAttachment = async ({ existingId, saveMovement, uploadAttachment, attachment }) => {
  let movementId = existingId || null;
  if (!movementId) {
    const movement = await saveMovement();
    movementId = movement.id;
  }
  if (attachment) await uploadAttachment(movementId, attachment);
  return movementId;
};
