import test from 'node:test';
import assert from 'node:assert/strict';
import { pageFromLookahead, previousOffsetForEmptyPage } from '../src/utils/pagination.js';

for (const [count, shown, hasNext] of [[0, 0, false], [12, 12, false], [30, 30, false], [31, 30, true]]) {
  test(`lookahead paginates ${count} rows`, () => {
    const page = pageFromLookahead(Array.from({ length: count }), 30);
    assert.equal(page.items.length, shown);
    assert.equal(page.hasNext, hasNext);
  });
}

test('exactly 60 rows exposes next only from the first page', () => {
  assert.equal(pageFromLookahead(Array.from({ length: 31 }), 30).hasNext, true);
  assert.equal(pageFromLookahead(Array.from({ length: 30 }), 30).hasNext, false);
});

test('an empty last page after deletion moves to the previous offset', () => {
  assert.equal(previousOffsetForEmptyPage(30, 30, 0), 0);
  assert.equal(previousOffsetForEmptyPage(30, 30, 1), 30);
});
