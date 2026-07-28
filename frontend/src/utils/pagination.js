export const splitPage = (rows, pageSize) => ({
  rows: rows.slice(0, pageSize),
  hasNext: rows.length > pageSize,
});

export const previousPageAfterDelete = ({ offset, pageSize, remainingRows }) =>
  remainingRows === 0 && offset > 0 ? Math.max(0, offset - pageSize) : offset;
