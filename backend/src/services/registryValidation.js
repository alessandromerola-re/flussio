export const registryError = (code = 'VALIDATION_MISSING_FIELDS', status = 400) => Object.assign(new Error(code), { code, status });
export const registryId = value => {
  if (value == null || value === '') return null;
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) throw registryError();
  return Number(value);
};
export async function validateCategory(client, companyId, payload, id = null) {
  if (typeof payload.name !== 'string' || !payload.name.trim() || !['income', 'expense'].includes(payload.direction) || typeof payload.is_active !== 'boolean') throw registryError();
  const parentId = registryId(payload.parent_id);
  if (parentId != null) {
    const parent = await client.query('SELECT direction FROM categories WHERE id=$1 AND company_id=$2', [parentId, companyId]);
    if (!parent.rowCount || parent.rows[0].direction !== payload.direction) throw registryError('CATEGORY_INVALID_PARENT');
    // UNION terminates even for corrupt historical cycles. The caller serializes
    // category writers on the company row, including CSV imports.
    const ancestors = await client.query(`WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM categories WHERE id=$1 AND company_id=$2
      UNION SELECT c.id,c.parent_id FROM categories c JOIN ancestors a ON c.id=a.parent_id WHERE c.company_id=$2
    ) SELECT id FROM ancestors`, [parentId, companyId]);
    if (id != null && ancestors.rows.some(row => row.id === Number(id))) throw registryError('CATEGORY_INVALID_PARENT');
  }
  if (id != null) {
    const children = await client.query('SELECT 1 FROM categories WHERE parent_id=$1 AND company_id=$2 AND direction<>$3 LIMIT 1', [id, companyId, payload.direction]);
    if (children.rowCount) throw registryError('CATEGORY_INVALID_PARENT');
  }
  return parentId;
}
export async function validateContact(client, companyId, payload) {
  if (typeof payload.name !== 'string' || !payload.name.trim() || typeof payload.is_active !== 'boolean') throw registryError();
  const categoryId = registryId(payload.default_category_id);
  if (categoryId != null) {
    const category = await client.query('SELECT id FROM categories WHERE id=$1 AND company_id=$2', [categoryId, companyId]);
    if (!category.rowCount) throw registryError();
  }
  return categoryId;
}
