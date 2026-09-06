const normalizeText = (value) => String(value ?? '').trim().toLocaleLowerCase();

export const buildCategoryRows = (categories = []) => {
  const byParent = new Map();
  const byId = new Map(categories.map((category) => [String(category.id), category]));

  categories.forEach((category) => {
    const parentKey = category.parent_id == null ? '' : String(category.parent_id);
    const bucket = byParent.get(parentKey) || [];
    bucket.push(category);
    byParent.set(parentKey, bucket);
  });

  const compareNames = (left, right) => String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
  byParent.forEach((items) => items.sort(compareNames));

  const rows = [];
  const visited = new Set();
  const appendBranch = (category, depth, ancestors) => {
    const id = String(category.id);
    if (visited.has(id) || ancestors.has(id)) return;
    visited.add(id);

    const parent = category.parent_id == null ? null : byId.get(String(category.parent_id));
    const parentRow = parent ? rows.find((row) => String(row.id) === String(parent.id)) : null;
    rows.push({
      ...category,
      depth,
      path: parentRow?.path ? `${parentRow.path} / ${category.name}` : category.name,
    });

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    (byParent.get(id) || []).forEach((child) => appendBranch(child, depth + 1, nextAncestors));
  };

  (byParent.get('') || []).forEach((category) => appendBranch(category, 0, new Set()));
  categories
    .filter((category) => !visited.has(String(category.id)))
    .sort(compareNames)
    .forEach((category) => appendBranch(category, 0, new Set()));

  return rows;
};

export const registryItemName = (tab, item) => {
  if (tab === 'jobs') return item.title || item.name || '';
  if (tab === 'categories') return item.path || item.name || '';
  return item.name || '';
};

export const registrySearchText = (tab, item, categoryById = new Map(), contactById = new Map()) => {
  const base = [
    registryItemName(tab, item),
    item.external_id,
    item.code,
    item.type,
    item.email,
    item.phone,
    item.notes,
    item.contact_name,
    item.default_category_name,
  ];
  if (tab === 'contacts' && item.default_category_id) base.push(categoryById.get(String(item.default_category_id))?.name);
  if ((tab === 'properties' || tab === 'jobs') && item.contact_id) base.push(contactById.get(String(item.contact_id))?.name);
  if (tab === 'categories') base.push(item.path, item.direction);
  return normalizeText(base.filter(Boolean).join(' '));
};

export const filterRegistryItems = ({ items = [], tab, search = '', status = 'all', sort = 'name-asc', categories = [], contacts = [] }) => {
  const needle = normalizeText(search);
  const categoryById = new Map(categories.map((item) => [String(item.id), item]));
  const contactById = new Map(contacts.map((item) => [String(item.id), item]));

  const filtered = items.filter((item) => {
    if (needle && !registrySearchText(tab, item, categoryById, contactById).includes(needle)) return false;
    if (status === 'active' && item.is_active === false) return false;
    if (status === 'inactive' && item.is_active !== false) return false;
    if (status === 'open' && (item.is_closed || item.is_active === false)) return false;
    if (status === 'closed' && (!item.is_closed || item.is_active === false)) return false;
    return true;
  });

  const direction = sort === 'name-desc' ? -1 : 1;
  return filtered.sort((left, right) => {
    if (sort === 'status') {
      const leftInactive = left.is_active === false || (tab === 'jobs' && left.is_closed);
      const rightInactive = right.is_active === false || (tab === 'jobs' && right.is_closed);
      if (leftInactive !== rightInactive) return leftInactive ? 1 : -1;
    }
    return registryItemName(tab, left).localeCompare(registryItemName(tab, right), undefined, { sensitivity: 'base' }) * direction;
  });
};
