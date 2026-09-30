import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTemplateNow, generateDueTemplates, recurringGeneratorEnabled } from '../src/services/recurring.js';

test('technical off blocks direct manual and automatic generation before database access', async () => {
  const previous = process.env.RECURRING_GENERATOR_ENABLED;
  try {
    for (const value of ['false', '0', 'invalid', '']) {
      process.env.RECURRING_GENERATOR_ENABLED = value;
      assert.equal(recurringGeneratorEnabled(), false);
      assert.equal((await generateTemplateNow(1, 1)).code, 'RECURRING_GENERATOR_DISABLED');
      for (const runType of ['auto', 'manual']) {
        const result = await generateDueTemplates({ companyId: 1, runType });
        assert.equal(result.created_count, 0); assert.equal(result.generator_enabled, false);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.RECURRING_GENERATOR_ENABLED;
    else process.env.RECURRING_GENERATOR_ENABLED = previous;
  }
});
