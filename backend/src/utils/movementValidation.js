// NUMERIC(12,2): validate before PostgreSQL can round each leg independently.
export function moneyCents(value, { signed = false } = {}) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!(signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 999999999999n) return null;
  return Number(negative ? -cents : cents);
}

export function validMovementAllocation(type, total, accounts) {
  const cents = moneyCents(total);
  if (cents == null || cents <= 0 || !Array.isArray(accounts) || !accounts.length) return false;
  let incoming = 0, outgoing = 0;
  const inIds = new Set(), outIds = new Set();
  for (const leg of accounts) {
    if (!leg || !['string', 'number'].includes(typeof leg.account_id)) return false;
    const id = Number(leg.account_id), amount = moneyCents(leg.amount);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647 || amount == null || amount <= 0) return false;
    if (leg.direction === 'in') { incoming += amount; inIds.add(id); }
    else if (leg.direction === 'out') { outgoing += amount; outIds.add(id); }
    else return false;
  }
  if (type === 'income') return incoming === cents && outgoing === 0;
  if (type === 'expense') return outgoing === cents && incoming === 0;
  return type === 'transfer' && incoming === cents && outgoing === cents && ![...inIds].some(id => outIds.has(id));
}
