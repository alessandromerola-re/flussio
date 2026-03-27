import app from './app.js';
import { runMigrations } from './db/migrate.js';
import { generateDueTemplates } from './services/recurring.js';
import { ensureBootstrapAdmin, ensureDevUser } from './bootstrapAdmin.js';

const port = process.env.PORT || 4000;

const startRecurringScheduler = () => {
  const enabledRaw = process.env.RECURRING_GENERATOR_ENABLED;
  const enabled = enabledRaw == null ? true : String(enabledRaw).toLowerCase() === 'true';
  const intervalMinutes = Number(process.env.RECURRING_GENERATOR_INTERVAL_MIN || 5);

  if (!enabled) {
    console.log('Recurring generator disabled by env');
    return;
  }

  const run = async () => {
    try {
      const result = await generateDueTemplates({ runType: 'auto' });
      if (result.created_count > 0 || result.skipped_count > 0) {
        console.log('Recurring generator run', result);
      }
    } catch (error) {
      console.error('Recurring generator failed', error);
    }
  };

  run();
  setInterval(run, Math.max(intervalMinutes, 1) * 60 * 1000);
};

const bootstrap = async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await ensureDevUser();

  app.listen(port, () => {
    console.log(`Flussio backend running on port ${port}`);
    startRecurringScheduler();
  });
};

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Flussio backend', error);
  process.exit(1);
});
