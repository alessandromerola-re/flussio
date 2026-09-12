const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => typeof value === 'string' && isoDateRegex.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const allowedTypes = new Set(['all', 'income', 'expense', 'transfer']);
const allowedMetrics = new Set(['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count', 'avg_abs_cents']);
const allowedGroupBy = new Set(['day', 'week', 'month', 'quarter', 'year', 'category', 'account', 'contact', 'job', 'property', 'type', 'recurring']);
const defaultMetrics = ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'];

const metricExpressions = {
  income_sum_cents: "COALESCE(SUM(CASE WHEN t.type='income' THEN ROUND(t.amount_total*100)::bigint ELSE 0 END),0)",
  expense_sum_cents: "COALESCE(SUM(CASE WHEN t.type='expense' THEN ABS(ROUND(t.amount_total*100)::bigint) ELSE 0 END),0)",
  net_sum_cents:
    "COALESCE(SUM(CASE WHEN t.type='income' THEN ROUND(t.amount_total*100)::bigint ELSE 0 END),0) - COALESCE(SUM(CASE WHEN t.type='expense' THEN ABS(ROUND(t.amount_total*100)::bigint) ELSE 0 END),0)",
  count: 'COUNT(*)::int',
  avg_abs_cents: 'COALESCE(AVG(ABS(ROUND(t.amount_total*100)::bigint))::bigint,0)',
};

const parseIntegerOrNull = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseBooleanOrNull = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
};

const startOfLast30Days = () => {
  const now = new Date();
  now.setDate(now.getDate() - 30);
  return now.toISOString().slice(0, 10);
};

export const validateAndNormalizeSpec = (specInput, companyId) => {
  const spec = specInput && typeof specInput === 'object' ? specInput : {};
  const filtersInput = spec.filters && typeof spec.filters === 'object' ? spec.filters : {};

  let dateFrom = spec.dateFrom || spec.date_from || filtersInput.dateFrom || filtersInput.date_from || null;
  let dateTo = spec.dateTo || spec.date_to || filtersInput.dateTo || filtersInput.date_to || null;

  if (!dateFrom && !dateTo) {
    dateFrom = startOfLast30Days();
    dateTo = new Date().toISOString().slice(0, 10);
  }

  if (dateFrom && !validDate(dateFrom)) {
    return { error: { code: 'VALIDATION_MISSING_FIELDS', field: 'dateFrom' } };
  }
  if (dateTo && !validDate(dateTo)) {
    return { error: { code: 'VALIDATION_MISSING_FIELDS', field: 'dateTo' } };
  }
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return { error: { code: 'VALIDATION_MISSING_FIELDS', field: 'dateTo' } };
  }

  if (filtersInput.type != null && !allowedTypes.has(filtersInput.type)) return { error: { code: 'VALIDATION_MISSING_FIELDS', field: 'type' } };
  const type = filtersInput.type || 'all';
  for (const key of ['account', 'contact', 'job', 'property', 'category']) {
    const raw = filtersInput[`${key}Id`] ?? filtersInput[`${key}_id`];
    if (raw == null || raw === '') continue;
    const id = parseIntegerOrNull(raw);
    if (!['number', 'string'].includes(typeof raw) || id == null || id <= 0 || id > 2147483647) return { error: { code: 'VALIDATION_MISSING_FIELDS', field: `${key}Id` } };
  }

  const accountId = parseIntegerOrNull(filtersInput.accountId ?? filtersInput.account_id);
  const contactId = parseIntegerOrNull(filtersInput.contactId ?? filtersInput.contact_id);
  const jobId = parseIntegerOrNull(filtersInput.jobId ?? filtersInput.job_id);
  const propertyId = parseIntegerOrNull(filtersInput.propertyId ?? filtersInput.property_id);
  const categoryId = parseIntegerOrNull(filtersInput.categoryId ?? filtersInput.category_id);

  const rawBooleanFilters = {
    includeCategoryChildren: filtersInput.includeCategoryChildren,
    isRecurring: filtersInput.isRecurring,
    hasAttachments: filtersInput.hasAttachments,
  };
  for (const [key, value] of Object.entries(rawBooleanFilters)) {
    if (value != null && value !== '' && parseBooleanOrNull(value) == null) {
      return { error: { code: 'VALIDATION_MISSING_FIELDS', field: key } };
    }
  }

  const includeCategoryChildren =
    categoryId != null ? parseBooleanOrNull(filtersInput.includeCategoryChildren) ?? true : false;

  const metricsInput = Array.isArray(spec.metrics) && spec.metrics.length ? spec.metrics : defaultMetrics;
  const metrics = [...new Set(metricsInput.filter((metric) => allowedMetrics.has(metric)))];
  if (metrics.length === 0) {
    metrics.push(...defaultMetrics);
  }

  const groupByInput = Array.isArray(spec.groupBy) ? spec.groupBy : [];
  const groupBy = [];
  for (const dimension of groupByInput) {
    if (!allowedGroupBy.has(dimension)) continue;
    if (!groupBy.includes(dimension)) groupBy.push(dimension);
    if (groupBy.length === 2) break;
  }

  const limitRaw = Number(spec.limit);
  if (groupBy.filter((dimension) => ['day', 'week', 'month', 'quarter', 'year'].includes(dimension)).length > 1) return { error: { code: 'VALIDATION_MISSING_FIELDS', field: 'groupBy' } };
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

  const sortByRaw = spec.sort?.by;
  const sortDirRaw = String(spec.sort?.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const allowedSort = new Set([...metrics, ...groupBy, 'bucket']);
  const sortBy = allowedSort.has(sortByRaw) ? sortByRaw : (metrics[0] || 'net_sum_cents');

  return {
    companyId,
    dateFrom,
    dateTo,
    filters: {
      type,
      accountId,
      contactId,
      jobId,
      propertyId,
      categoryId,
      includeCategoryChildren,
      text: typeof filtersInput.text === 'string' ? filtersInput.text.trim() : '',
      isRecurring: parseBooleanOrNull(filtersInput.isRecurring),
      hasAttachments: parseBooleanOrNull(filtersInput.hasAttachments),
    },
    groupBy,
    metrics,
    sort: { by: sortBy, dir: sortDirRaw },
    limit,
  };
};

const dimensionConfig = {
  day: { select: ["to_char(t.date, 'YYYY-MM-DD') AS bucket"], group: ["to_char(t.date, 'YYYY-MM-DD')"], alias: 'bucket' },
  week: {
    select: ["to_char(date_trunc('week', t.date), 'IYYY-\"W\"IW') AS bucket"],
    group: ["to_char(date_trunc('week', t.date), 'IYYY-\"W\"IW')"],
    alias: 'bucket',
  },
  month: {
    select: ["to_char(date_trunc('month', t.date), 'YYYY-MM') AS bucket"],
    group: ["to_char(date_trunc('month', t.date), 'YYYY-MM')"],
    alias: 'bucket',
  },
  quarter: {
    select: ["to_char(date_trunc('quarter', t.date), 'YYYY-\"Q\"Q') AS bucket"],
    group: ["to_char(date_trunc('quarter', t.date), 'YYYY-\"Q\"Q')"],
    alias: 'bucket',
  },
  year: {
    select: ["to_char(date_trunc('year', t.date), 'YYYY') AS bucket"],
    group: ["to_char(date_trunc('year', t.date), 'YYYY')"],
    alias: 'bucket',
  },
  category: {
    select: ['t.category_id AS category_id', "COALESCE(c.name, 'Senza categoria') AS category_name"],
    group: ['t.category_id', "COALESCE(c.name, 'Senza categoria')"],
    alias: 'category_name',
  },
  account: {
    select: ['a.id AS account_id', "COALESCE(a.name, 'Senza conto') AS account_name"],
    group: ['a.id', "COALESCE(a.name, 'Senza conto')"],
    alias: 'account_name',
  },
  contact: {
    select: ['t.contact_id AS contact_id', "COALESCE(ct.name, 'Senza contatto') AS contact_name"],
    group: ['t.contact_id', "COALESCE(ct.name, 'Senza contatto')"],
    alias: 'contact_name',
  },
  job: {
    select: ['t.job_id AS job_id', "COALESCE(j.title, 'Senza commessa') AS job_title"],
    group: ['t.job_id', "COALESCE(j.title, 'Senza commessa')"],
    alias: 'job_title',
  },
  property: {
    select: ['t.property_id AS property_id', "COALESCE(p.name, 'Senza immobile') AS property_name"],
    group: ['t.property_id', "COALESCE(p.name, 'Senza immobile')"],
    alias: 'property_name',
  },
  type: { select: ['t.type AS type'], group: ['t.type'], alias: 'type' },
  recurring: {
    select: ['(t.recurring_template_id IS NOT NULL) AS recurring'],
    group: ['(t.recurring_template_id IS NOT NULL)'],
    alias: 'recurring',
  },
};

const csvEscape = (value) => {
  const stringValue = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
};

const buildFilterSql = (spec) => {
  const where = ['t.company_id = $1'];
  const params = [spec.companyId];
  let withRecursive = '';

  if (spec.dateFrom) {
    params.push(spec.dateFrom);
    where.push(`t.date >= $${params.length}`);
  }
  if (spec.dateTo) {
    params.push(spec.dateTo);
    where.push(`t.date <= $${params.length}`);
  }

  if (spec.filters.type === 'all') {
    where.push("t.type IN ('income','expense')");
  } else {
    params.push(spec.filters.type);
    where.push(`t.type = $${params.length}`);
  }

  if (spec.filters.accountId != null) {
    params.push(spec.filters.accountId);
    where.push(`a.id = $${params.length}`);
  }
  if (spec.filters.contactId != null) {
    params.push(spec.filters.contactId);
    where.push(`t.contact_id = $${params.length}`);
  }
  if (spec.filters.jobId != null) {
    params.push(spec.filters.jobId);
    where.push(`t.job_id = $${params.length}`);
  }
  if (spec.filters.propertyId != null) {
    params.push(spec.filters.propertyId);
    where.push(`t.property_id = $${params.length}`);
  }

  if (spec.filters.categoryId != null) {
    if (spec.filters.includeCategoryChildren) {
      params.push(spec.filters.categoryId);
      const categoryParam = params.length;
      withRecursive = `WITH RECURSIVE category_tree AS (
        SELECT id
        FROM categories
        WHERE company_id = $1 AND id = $${categoryParam}
        UNION
        SELECT c2.id
        FROM categories c2
        JOIN category_tree ctg ON ctg.id = c2.parent_id
        WHERE c2.company_id = $1
      )`;
      where.push('t.category_id IN (SELECT id FROM category_tree)');
    } else {
      params.push(spec.filters.categoryId);
      where.push(`t.category_id = $${params.length}`);
    }
  }

  if (spec.filters.text) {
    params.push(`%${spec.filters.text}%`);
    where.push(`COALESCE(t.description,'') ILIKE $${params.length}`);
  }

  if (spec.filters.isRecurring != null) {
    where.push(spec.filters.isRecurring ? 't.recurring_template_id IS NOT NULL' : 't.recurring_template_id IS NULL');
  }

  if (spec.filters.hasAttachments != null) {
    where.push(
      spec.filters.hasAttachments
        ? 'EXISTS (SELECT 1 FROM attachments att WHERE att.transaction_id = t.id)'
        : 'NOT EXISTS (SELECT 1 FROM attachments att WHERE att.transaction_id = t.id)'
    );
  }

  return { where, params, withRecursive };
};

// One row per movement/account, including multiple legs on the same account.
// General totals use movement amounts; account reports use assigned amounts.
const accountJoin = (spec, grouped = false) => (grouped || spec.filters.accountId != null) ? `
    LEFT JOIN LATERAL (
      SELECT acc.id, acc.name, SUM(ta.amount) AS allocated_amount
      FROM transaction_accounts ta
      JOIN accounts acc ON acc.id = ta.account_id AND acc.company_id = t.company_id
      WHERE ta.transaction_id = t.id
      GROUP BY acc.id, acc.name
    ) a ON true` : '';

const expressionFor = (metric, spec, grouped = false) => {
  const expression = metricExpressions[metric];
  return grouped || spec.filters.accountId != null
    ? expression.replaceAll('t.amount_total', 'COALESCE(a.allocated_amount, t.amount_total)')
    : expression;
};

export const buildAdvancedReportQuery = (spec, { sentinel = false } = {}) => {
  const { where, params, withRecursive } = buildFilterSql(spec);

  const dimensions = spec.groupBy.map((dimension) => dimensionConfig[dimension]).filter(Boolean);
  const selectDimensions = dimensions.flatMap((entry) => entry.select);
  const groupDimensions = dimensions.flatMap((entry) => entry.group);

  const groupedAccounts = spec.groupBy.includes('account');
  const metricSelect = spec.metrics.map((metric) => `${expressionFor(metric, spec, groupedAccounts)} AS ${metric}`);

  const orderAlias =
    (spec.groupBy.includes(spec.sort.by) ? dimensionConfig[spec.sort.by].alias : null) ||
    (spec.metrics.includes(spec.sort.by) ? spec.sort.by : dimensions[0]?.alias || spec.metrics[0]);
  const tieBreakers = selectDimensions.map((select) => select.match(/ AS (\w+)$/i)[1]).filter((alias) => alias !== orderAlias);

  const queryText = `${withRecursive ? `${withRecursive}\n` : ''}
    SELECT
      ${[...selectDimensions, ...metricSelect].join(',\n      ')}
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id AND c.company_id = t.company_id
    LEFT JOIN contacts ct ON ct.id = t.contact_id AND ct.company_id = t.company_id
    LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = t.company_id
    LEFT JOIN properties p ON p.id = t.property_id AND p.company_id = t.company_id
    ${accountJoin(spec, groupedAccounts)}
    WHERE ${where.join(' AND ')}
    ${groupDimensions.length ? `GROUP BY ${groupDimensions.join(', ')}` : ''}
    ORDER BY ${orderAlias} ${spec.sort.dir.toUpperCase()}${tieBreakers.length ? `, ${tieBreakers.map((alias) => `${alias} ASC NULLS LAST`).join(', ')}` : ''}
    LIMIT ${Math.min(spec.limit, 500) + (sentinel ? 1 : 0)}
  `;

  return { text: queryText, values: params };
};

export const buildTotalsQuery = (spec) => {
  const { where, params, withRecursive } = buildFilterSql(spec);
  const totalsMetrics = ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count', ...(spec.metrics.includes('avg_abs_cents') ? ['avg_abs_cents'] : [])];
  const queryText = `${withRecursive ? `${withRecursive}\n` : ''}
    SELECT
      ${totalsMetrics.map((metric) => `${expressionFor(metric, spec)} AS ${metric}`).join(',\n      ')}
    FROM transactions t
    ${accountJoin(spec)}
    WHERE ${where.join(' AND ')}
  `;

  return { text: queryText, values: params };
};

export const toCsv = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(';'));
  return `${headers.join(';')}\n${lines.join('\n')}`;
};
