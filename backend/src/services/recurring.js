import { getClient, query } from '../db/index.js';

const ROME_TIMEZONE = 'Europe/Rome';

const pad2 = (value) => String(value).padStart(2, '0');

const getRomeParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROME_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    isoDow: weekdayMap[map.weekday] || 1,
  }; 
};

const getTimeZoneOffsetMinutes = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ROME_TIMEZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';
  const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
};

const buildRomeDate = (year, month, day, hour = 0, minute = 5) => {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(utcMs);
  let offset = getTimeZoneOffsetMinutes(candidate);
  utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000;
  candidate = new Date(utcMs);
  offset = getTimeZoneOffsetMinutes(candidate);
  utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000;
  return new Date(utcMs);
};

const parseDateString = (value) => {
  if (!value) {
    return null;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const formatDateString = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const addDaysRomeDate = ({ year, month, day }, days) => {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

const addMonths = ({ year, month }, stepMonths) => {
  let y = year;
  let m = month + stepMonths;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
};

const getIsoWeekKey = ({ year, month, day }) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${isoYear}-W${pad2(weekNo)}`;
};

const normalizeRunDateByFrequency = (template, runDate) => {
  if (template.frequency === 'monthly') {
    return { year: runDate.year, month: runDate.month, day: 1 };
  }
  if (template.frequency === 'yearly') {
    const anchorMonth = template.yearly_anchor_mm || runDate.month;
    let anchorDay = template.yearly_anchor_dd || runDate.day;
    const maxDay = lastDayOfMonth(runDate.year, anchorMonth);
    if (anchorMonth === 2 && anchorDay === 29 && maxDay < 29) {
      anchorDay = 28;
    } else if (anchorDay > maxDay) {
      anchorDay = maxDay;
    }
    return { year: runDate.year, month: anchorMonth, day: anchorDay };
  }

  const anchorDow = template.weekly_anchor_dow || 1;
  const currentDow = runDate.isoDow;
  const diff = anchorDow - currentDow;
  return addDaysRomeDate(runDate, diff);
};

const getInitialRunDateForTemplate = (template, nowDate = new Date()) => {
  const now = getRomeParts(nowDate);
  const start = parseDateString(template.start_date);

  if (template.frequency === 'monthly') {
    const base = start || { year: now.year, month: now.month, day: now.day };
    let targetYear = base.year;
    let targetMonth = base.month;

    if (start) {
      if (start.day !== 1) {
        const next = addMonths({ year: start.year, month: start.month }, 1);
        targetYear = next.year;
        targetMonth = next.month;
      }
    } else {
      if (now.day > 1 || (now.day === 1 && (now.hour > 0 || now.minute >= 5))) {
        const next = addMonths({ year: now.year, month: now.month }, 1);
        targetYear = next.year;
        targetMonth = next.month;
      }
    }

    return { year: targetYear, month: targetMonth, day: 1 };
  }

  if (template.frequency === 'weekly') {
    const anchorDow = template.weekly_anchor_dow || start?.isoDow || (start ? getRomeParts(buildRomeDate(start.year, start.month, start.day)).isoDow : 1);
    const base = start || { year: now.year, month: now.month, day: now.day };
    const baseDow = getRomeParts(buildRomeDate(base.year, base.month, base.day)).isoDow;
    let diff = anchorDow - baseDow;
    if (diff < 0) {
      diff += 7;
    }
    return addDaysRomeDate(base, diff);
  }

  const anchorMonth = template.yearly_anchor_mm || start?.month || 1;
  const anchorDayInput = template.yearly_anchor_dd || start?.day || 1;
  const candidateYear = start?.year || now.year;
  let day = anchorDayInput;
  const maxDay = lastDayOfMonth(candidateYear, anchorMonth);
  if (anchorMonth === 2 && anchorDayInput === 29 && maxDay < 29) {
    day = 28;
  } else if (day > maxDay) {
    day = maxDay;
  }
  return { year: candidateYear, month: anchorMonth, day };
};

const computeCycleKey = (template, runDate) => {
  if (template.frequency === 'monthly') {
    return `${runDate.year}-${pad2(runDate.month)}`;
  }
  if (template.frequency === 'weekly') {
    return getIsoWeekKey(runDate);
  }
  return String(runDate.year);
};

const computeNextRunDateFromCurrent = (template, currentRunDate) => {
  const step = Number(template.interval || 1);

  if (template.frequency === 'monthly') {
    const next = addMonths({ year: currentRunDate.year, month: currentRunDate.month }, step);
    return { year: next.year, month: next.month, day: 1 };
  }

  if (template.frequency === 'weekly') {
    return addDaysRomeDate(currentRunDate, 7 * step);
  }

  const year = currentRunDate.year + step;
  const month = template.yearly_anchor_mm || currentRunDate.month;
  let day = template.yearly_anchor_dd || currentRunDate.day;
  const maxDay = lastDayOfMonth(year, month);
  if (month === 2 && day === 29 && maxDay < 29) {
    day = 28;
  } else if (day > maxDay) {
    day = maxDay;
  }

  return { year, month, day };
};

const isRunAllowedByEndDate = (template, runDate) => {
  const end = parseDateString(template.end_date);
  if (!end) {
    return true;
  }
  const runStr = formatDateString(runDate.year, runDate.month, runDate.day);
  const endStr = formatDateString(end.year, end.month, end.day);
  return runStr <= endStr;
};

const toTemplateView = (row) => ({
  ...row,
  amount: Number(row.amount),
});

export const computeNextRunAtForTemplate = (template, now = new Date()) => {
  const initialDate = getInitialRunDateForTemplate(template, now);
  const normalized = normalizeRunDateByFrequency(template, {
    ...initialDate,
    isoDow: getRomeParts(buildRomeDate(initialDate.year, initialDate.month, initialDate.day)).isoDow,
  });
  return buildRomeDate(normalized.year, normalized.month, normalized.day, 0, 5);
};

const generateForTemplate = async (client, template, runType, forcedNow = false) => {
  const now = new Date();
  const nowRome = getRomeParts(now);

  let runDate;
  if (forcedNow) {
    runDate = normalizeRunDateByFrequency(template, nowRome);
  } else {
    const nextRun = new Date(template.next_run_at);
    const p = getRomeParts(nextRun);
    runDate = { year: p.year, month: p.month, day: p.day, isoDow: p.isoDow };
  }

  if (!isRunAllowedByEndDate(template, runDate)) {
    await client.query('UPDATE recurring_templates SET is_active = false, updated_at = NOW() WHERE id = $1', [
      template.id,
    ]);
    return { status: 'skipped', reason: 'beyond_end_date' };
  }

  const cycleKey = computeCycleKey(template, runDate);

  const runInsertResult = await client.query(
    `
    INSERT INTO recurring_runs (template_id, cycle_key, run_at, run_type)
    VALUES ($1, $2, NOW(), $3)
    ON CONFLICT (template_id, cycle_key) DO NOTHING
    RETURNING id
    `,
    [template.id, cycleKey, runType]
  );

  if (runInsertResult.rowCount === 0) {
    return { status: 'skipped', reason: 'already_generated' };
  }

  const runId = runInsertResult.rows[0].id;
  const runAt = buildRomeDate(runDate.year, runDate.month, runDate.day, 0, 5);
  const amountValue = Number(template.amount);
  const normalizedAmount = template.movement_type === 'expense'
    ? -Math.abs(amountValue)
    : Math.abs(amountValue);

  const movementInsertResult = await client.query(
    `
    INSERT INTO transactions (
      company_id,
      date,
      type,
      amount_total,
      description,
      category_id,
      contact_id,
      property_id,
      job_id,
      recurring_template_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
    [
      template.company_id,
      formatDateString(runDate.year, runDate.month, runDate.day),
      template.movement_type,
      normalizedAmount,
      template.notes || template.title,
      template.category_id,
      template.contact_id,
      template.property_id,
      template.job_id,
      template.id,
    ]
  );

  const movementId = movementInsertResult.rows[0].id;

  await client.query('UPDATE recurring_runs SET generated_movement_id = $1 WHERE id = $2', [movementId, runId]);

  const nextRunDate = computeNextRunDateFromCurrent(template, runDate);
  const nextRunAllowed = isRunAllowedByEndDate(template, nextRunDate);
  const nextRunAt = buildRomeDate(nextRunDate.year, nextRunDate.month, nextRunDate.day, 0, 5);

  await client.query(
    `
    UPDATE recurring_templates
    SET last_run_at = NOW(),
        next_run_at = $1,
        is_active = CASE WHEN $2::boolean THEN is_active ELSE false END,
        updated_at = NOW()
    WHERE id = $3
    `,
    [nextRunAt, nextRunAllowed, template.id]
  );

  return { status: 'created', movement_id: movementId, cycle_key: cycleKey, run_at: runAt.toISOString() };
};

export const generateTemplateNow = async (templateId, companyId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const templateResult = await client.query(
      'SELECT * FROM recurring_templates WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [templateId, companyId]
    );
    if (templateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }

    const template = toTemplateView(templateResult.rows[0]);
    if (!template.is_active) {
      await client.query('ROLLBACK');
      return { status: 'skipped', reason: 'inactive' };
    }

    const result = await generateForTemplate(client, template, 'manual', true);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const generateDueTemplates = async ({ companyId = null, runType = 'auto' } = {}) => {
  const client = await getClient();
  const result = {
    created_count: 0,
    skipped_count: 0,
    skipped_details: [],
  };

  try {
    const params = [];
    let whereSql = 'is_active = true AND next_run_at <= NOW()';
    if (companyId != null) {
      params.push(companyId);
      whereSql += ` AND company_id = $${params.length}`;
    }

    const dueResult = await client.query(
      `
      SELECT *
      FROM recurring_templates
      WHERE ${whereSql}
      ORDER BY next_run_at ASC
      `,
      params
    );

    for (const row of dueResult.rows) {
      const template = toTemplateView(row);
      await client.query('BEGIN');
      const lockedResult = await client.query('SELECT * FROM recurring_templates WHERE id = $1 FOR UPDATE', [
        template.id,
      ]);
      if (lockedResult.rowCount === 0) {
        await client.query('ROLLBACK');
        continue;
      }
      const locked = toTemplateView(lockedResult.rows[0]);
      const itemResult = await generateForTemplate(client, locked, runType, false);
      await client.query('COMMIT');

      if (itemResult.status === 'created') {
        result.created_count += 1;
      } else {
        result.skipped_count += 1;
        result.skipped_details.push({
          template_id: locked.id,
          reason: itemResult.reason,
        });
      }
    }

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};

export { computeCycleKey, computeNextRunDateFromCurrent, getInitialRunDateForTemplate };
