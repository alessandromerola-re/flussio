import test from 'node:test';
import assert from 'node:assert/strict';
import { close, query, resetDb } from './_db.js';
import { generateDueTemplates, generateTemplateNow } from '../src/services/recurring.js';

let companyId;
let accountId;

const createTemplate = async ({
  title,
  amount = 25,
  movementType = 'expense',
  selectedAccountId = accountId,
  nextRunAt = new Date(Date.now() - 60_000),
}) => {
  const result = await query(
    `INSERT INTO recurring_templates (
       company_id, title, frequency, interval, next_run_at, is_active,
       amount, movement_type, account_id
     )
     VALUES ($1, $2, 'monthly', 1, $3, true, $4, $5, $6)
     RETURNING id`,
    [companyId, title, nextRunAt, amount, movementType, selectedAccountId]
  );
  return result.rows[0].id;
};

test.beforeEach(async () => {
  await resetDb();
  const company = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Recurring Co']);
  companyId = company.rows[0].id;
  const account = await query(
    `INSERT INTO accounts (company_id, name, type, opening_balance, balance)
     VALUES ($1, 'Banca', 'bank', 100, 100)
     RETURNING id`,
    [companyId]
  );
  accountId = account.rows[0].id;
});

test.after(async () => {
  await close();
});

test('recurring generation atomically creates account leg and updates balance once', async () => {
  const templateId = await createTemplate({ title: 'Canone software' });

  const firstRun = await generateTemplateNow(templateId, companyId);
  assert.equal(firstRun.status, 'created');

  const movement = await query(
    `SELECT t.amount_total, t.recurring_template_id, ta.account_id, ta.direction, ta.amount
     FROM transactions t
     JOIN transaction_accounts ta ON ta.transaction_id = t.id
     WHERE t.id = $1`,
    [firstRun.movement_id]
  );
  assert.equal(Number(movement.rows[0].amount_total), -25);
  assert.equal(movement.rows[0].recurring_template_id, templateId);
  assert.equal(movement.rows[0].account_id, accountId);
  assert.equal(movement.rows[0].direction, 'out');
  assert.equal(Number(movement.rows[0].amount), 25);

  const balanceAfterFirstRun = await query('SELECT balance FROM accounts WHERE id = $1', [accountId]);
  assert.equal(Number(balanceAfterFirstRun.rows[0].balance), 75);

  const secondRun = await generateTemplateNow(templateId, companyId);
  assert.equal(secondRun.status, 'skipped');
  assert.equal(secondRun.reason, 'already_generated');

  const balanceAfterSecondRun = await query('SELECT balance FROM accounts WHERE id = $1', [accountId]);
  assert.equal(Number(balanceAfterSecondRun.rows[0].balance), 75);
  const countResult = await query('SELECT COUNT(*)::int AS count FROM transactions WHERE recurring_template_id = $1', [templateId]);
  assert.equal(countResult.rows[0].count, 1);
});

test('template without account is disabled without creating partial data', async () => {
  const templateId = await createTemplate({ title: 'Template storico', selectedAccountId: null });

  const result = await generateTemplateNow(templateId, companyId);
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'missing_account');

  const template = await query('SELECT is_active FROM recurring_templates WHERE id = $1', [templateId]);
  assert.equal(template.rows[0].is_active, false);
  const runCount = await query('SELECT COUNT(*)::int AS count FROM recurring_runs WHERE template_id = $1', [templateId]);
  const movementCount = await query('SELECT COUNT(*)::int AS count FROM transactions WHERE recurring_template_id = $1', [templateId]);
  assert.equal(runCount.rows[0].count, 0);
  assert.equal(movementCount.rows[0].count, 0);
});

test('concurrent due generators create a single movement', async () => {
  const templateId = await createTemplate({ title: 'Ricorrenza concorrente', amount: 10 });

  const results = await Promise.all([
    generateDueTemplates({ companyId, runType: 'auto' }),
    generateDueTemplates({ companyId, runType: 'auto' }),
  ]);

  assert.equal(results.reduce((sum, result) => sum + result.created_count, 0), 1);
  const movementCount = await query('SELECT COUNT(*)::int AS count FROM transactions WHERE recurring_template_id = $1', [templateId]);
  const balance = await query('SELECT balance FROM accounts WHERE id = $1', [accountId]);
  assert.equal(movementCount.rows[0].count, 1);
  assert.equal(Number(balance.rows[0].balance), 90);
});
