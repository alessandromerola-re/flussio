export const pageFromLookahead = (rows, limit) => ({
  items: rows.slice(0, limit),
  hasNext: rows.length > limit,
});

export const previousOffsetForEmptyPage = (offset, limit, itemCount) =>
  itemCount === 0 && offset > 0 ? Math.max(0, offset - limit) : offset;
