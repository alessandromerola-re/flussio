// Parse logical records, preserving quoted newlines and escaped quotes.
export function parseCsv(text, delimiter = ',') {
  const records = [];
  let values = [], value = '', quoted = false, line = 1, startLine = 1;
  const field = () => { values.push(value.trim()); value = ''; };
  const record = () => {
    field();
    if (values.some(cell => cell !== '')) records.push({ values, line: startLine });
    values = []; startLine = line;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) field();
    else if (char === '\n' || char === '\r') {
      const newline = char === '\r' && text[i + 1] === '\n' ? '\r\n' : char;
      if (newline.length === 2) i++;
      line++;
      if (quoted) value += newline;
      else record();
    } else value += char;
  }
  if (quoted) throw Object.assign(new Error('CSV_INVALID_FORMAT'), { status: 400, code: 'CSV_INVALID_FORMAT' });
  record();
  return records;
}
