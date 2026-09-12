import test from 'node:test';
import assert from 'node:assert/strict';
import { reportBucketRange, reportDrilldownParams } from '../src/utils/reportDrilldown.js';
test('calendar buckets include leap years, quarters and ISO weeks crossing years', () => {
  for (const [dimension,bucket,from,to] of [
    ['day','2026-09-10','2026-09-10','2026-09-10'],
    ['month','2024-02','2024-02-01','2024-02-29'],
    ['quarter','2026-Q4','2026-10-01','2026-12-31'],
    ['year','2024','2024-01-01','2024-12-31'],
    ['week','2020-W53','2020-12-28','2021-01-03'],
    ['week','2026-W01','2025-12-29','2026-01-04'],
  ]) assert.deepEqual(reportBucketRange(dimension,bucket),{from,to});
  assert.throws(() => reportBucketRange('month','invalid'));
  assert.throws(() => reportBucketRange('day','2026-02-30'));
  assert.throws(() => reportBucketRange('week','2021-W53'));
});
test('row dates intersect the applied period and preserve precise filter semantics', () => {
  const params = reportDrilldownParams({dateFrom:'2026-09-10',dateTo:'2026-10-15',groupBy:['month','category'],filters:{type:'all',categoryId:1,includeCategoryChildren:true,text:'rent',hasAttachments:false,isRecurring:false}}, {bucket:'2026-09',category_id:2});
  assert.equal(params.get('date_from'),'2026-09-10'); assert.equal(params.get('date_to'),'2026-09-30');
  assert.equal(params.get('category_id'),'2'); assert.equal(params.has('include_category_children'),false);
  assert.equal(params.get('cashflow_only'),'1'); assert.equal(params.get('description_q'),'rent'); assert.equal(params.has('q'),false);
  assert.equal(params.get('has_attachments'),'0'); assert.equal(params.get('is_recurring'),'0');
});
test('missing dimensions remain explicit and category descendants survive other groupings', () => {
  const params = reportDrilldownParams({groupBy:['contact'],filters:{categoryId:1,includeCategoryChildren:true}}, {contact_id:null});
  assert.equal(params.get('missing_contact'),'1'); assert.equal(params.get('include_category_children'),'1');
  assert.equal(params.has('contact_id'),false);
});
