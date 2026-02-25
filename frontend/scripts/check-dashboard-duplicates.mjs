import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dashboardPath = resolve(__dirname, '../src/pages/DashboardPage.jsx');
const backendDashboardPath = resolve(__dirname, '../../backend/src/routes/dashboard.js');

const checks = [
  {
    file: dashboardPath,
    patterns: new Map([
      ['const bucketSeries = summary.by_bucket || [];', 1],
      ['const kpiDeltas = useMemo(() => {', 1],
      ['const previous = summary.previous || {};', 1],
    ]),
  },
  ...(existsSync(backendDashboardPath)
    ? [
        {
          file: backendDashboardPath,
          patterns: new Map([
            ['const monthLabel =', 0],
            ['const formatMonthLabel =', 1],
            ['const twoDigits =', 1],
          ]),
        },
      ]
    : []),
];

const errors = [];

for (const { file, patterns } of checks) {
  const content = readFileSync(file, 'utf8');
  for (const [pattern, expected] of patterns.entries()) {
    const found = content.split(pattern).length - 1;
    if (found !== expected) {
      errors.push(`${file}: expected ${expected} occurrences of "${pattern}", found ${found}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Dashboard duplicate declaration guard failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Dashboard duplicate declaration guard passed.');
