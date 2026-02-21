// Advanced report templates catalog (11 items):
// 1) pnlMonthlyNet
// 2) cashflowNetTrend
// 3) categoryTopExpenses
// 4) jobsActualsNet
// 5) jobsBudgetVsActual
// 6) propertiesTotals
// 7) contactsTotals
// 8) dataQualityMissingLinks
// 9) recurringVsNonRecurring
// 10) yoyMonthlyNet
// 11) momMonthlyExpenses
export const ADV_REPORT_TEMPLATES = [
  {
    key: 'pnlMonthlyNet',
    titleKey: 'reportsTemplates.pnlMonthlyNet.title',
    descriptionKey: 'reportsTemplates.pnlMonthlyNet.desc',
    defaultPreset: 'current_month',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['month'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
    },
    chart: { type: 'line', x: 'month', series: ['net_sum_cents', 'income_sum_cents', 'expense_sum_cents'] },
    tableDefaults: { sortBy: 'net_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'cashflowNetTrend',
    titleKey: 'reportsTemplates.cashflowNetTrend.title',
    descriptionKey: 'reportsTemplates.cashflowNetTrend.desc',
    defaultPreset: 'last_30_days',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['month'],
      metrics: ['net_sum_cents'],
    },
    chart: { type: 'line', x: 'month', series: ['net_sum_cents'] },
    tableDefaults: { sortBy: 'bucket', sortDir: 'asc', limit: 200 },
  },
  {
    key: 'categoryTopExpenses',
    titleKey: 'reportsTemplates.categoryTopExpenses.title',
    descriptionKey: 'reportsTemplates.categoryTopExpenses.desc',
    defaultPreset: 'last_30_days',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'expense', includeCategoryChildren: true },
      groupBy: ['category'],
      metrics: ['expense_sum_cents', 'count', 'avg_abs_cents'],
    },
    chart: { type: 'bar', x: 'category', series: ['expense_sum_cents'], topN: 12 },
    tableDefaults: { sortBy: 'expense_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'jobsActualsNet',
    titleKey: 'reportsTemplates.jobsActualsNet.title',
    descriptionKey: 'reportsTemplates.jobsActualsNet.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['job'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
    },
    chart: { type: 'bar', x: 'job', series: ['net_sum_cents'], topN: 15 },
    tableDefaults: { sortBy: 'net_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'jobsBudgetVsActual',
    titleKey: 'reportsTemplates.jobsBudgetVsActual.title',
    descriptionKey: 'reportsTemplates.jobsBudgetVsActual.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['job'],
      metrics: ['expense_sum_cents', 'income_sum_cents', 'net_sum_cents'],
    },
    chart: { type: 'bar', x: 'job', series: ['expense_sum_cents', 'income_sum_cents'], topN: 15 },
    tableDefaults: { sortBy: 'expense_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'propertiesTotals',
    titleKey: 'reportsTemplates.propertiesTotals.title',
    descriptionKey: 'reportsTemplates.propertiesTotals.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['property'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
    },
    chart: { type: 'bar', x: 'property', series: ['net_sum_cents'], topN: 15 },
    tableDefaults: { sortBy: 'net_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'contactsTotals',
    titleKey: 'reportsTemplates.contactsTotals.title',
    descriptionKey: 'reportsTemplates.contactsTotals.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['contact'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
    },
    chart: { type: 'bar', x: 'contact', series: ['expense_sum_cents', 'income_sum_cents'], topN: 15 },
    tableDefaults: { sortBy: 'expense_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'dataQualityMissingLinks',
    titleKey: 'reportsTemplates.dataQualityMissingLinks.title',
    descriptionKey: 'reportsTemplates.dataQualityMissingLinks.desc',
    defaultPreset: 'last_30_days',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['category'],
      metrics: ['count', 'expense_sum_cents', 'income_sum_cents'],
    },
    chart: { type: 'bar', x: 'category', series: ['count'], topN: 12 },
    tableDefaults: { sortBy: 'count', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'recurringVsNonRecurring',
    titleKey: 'reportsTemplates.recurringVsNonRecurring.title',
    descriptionKey: 'reportsTemplates.recurringVsNonRecurring.desc',
    defaultPreset: 'last_30_days',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['recurring'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'count'],
    },
    chart: { type: 'pie', x: 'recurring', series: ['expense_sum_cents'], topN: 2 },
    tableDefaults: { sortBy: 'expense_sum_cents', sortDir: 'desc', limit: 200 },
  },
  {
    key: 'yoyMonthlyNet',
    titleKey: 'reportsTemplates.yoyMonthlyNet.title',
    descriptionKey: 'reportsTemplates.yoyMonthlyNet.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'all', includeCategoryChildren: true },
      groupBy: ['month'],
      metrics: ['net_sum_cents'],
    },
    chart: { type: 'line', x: 'month', series: ['net_sum_cents'] },
    tableDefaults: { sortBy: 'bucket', sortDir: 'asc', limit: 200 },
  },
  {
    key: 'momMonthlyExpenses',
    titleKey: 'reportsTemplates.momMonthlyExpenses.title',
    descriptionKey: 'reportsTemplates.momMonthlyExpenses.desc',
    defaultPreset: 'ytd',
    spec: {
      dateFrom: '__START__',
      dateTo: '__END__',
      filters: { type: 'expense', includeCategoryChildren: true },
      groupBy: ['month'],
      metrics: ['expense_sum_cents'],
    },
    chart: { type: 'line', x: 'month', series: ['expense_sum_cents'] },
    tableDefaults: { sortBy: 'bucket', sortDir: 'asc', limit: 200 },
  },
];
