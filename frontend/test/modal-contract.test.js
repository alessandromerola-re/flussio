import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modalSource = readFileSync(new URL('../src/components/Modal.jsx', import.meta.url), 'utf8');
const consumers = ['MovementsPage.jsx', 'RegistryPage.jsx', 'UsersAdminPage.jsx']
  .map((name) => readFileSync(new URL(`../src/pages/${name}`, import.meta.url), 'utf8'));

test('shared modal keeps the accessibility and dismissal contract', () => {
  for (const marker of ['role="dialog"', 'aria-modal="true"', 'aria-labelledby', "event.key === 'Escape'", "event.key === 'Tab'", "document.body.style.overflow = 'hidden'", 'previousFocus?.focus']) {
    assert.match(modalSource, new RegExp(marker.replace(/[?.]/g, '\\$&')));
  }
  assert.match(modalSource, /dismissible/);
  assert.match(modalSource, /closeOnOverlay/);
});

test('modal consumers do not nest another modal-content', () => {
  for (const source of consumers) assert.doesNotMatch(source, /className="modal-content/);
});
