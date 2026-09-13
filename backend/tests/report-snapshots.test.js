import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportSnapshotStore } from '../src/services/reportSnapshots.js';
const result = () => ({rows:[{name:'A;B',net_sum_cents:'-12345',budget:null}],generated_at:'2026-09-13T10:00:00.000Z',truncated:true});
test('snapshot freezes exact CSV and is isolated by company and user', () => {
  const store=createReportSnapshotStore(), original=result();
  const {id}=store.put(1,2,original);
  original.rows[0].net_sum_cents='999';
  assert.equal(store.get(id,1,2).csv,'name;net_sum_cents;budget\n"A;B";-12345;');
  assert.equal(store.get(id,1,2).truncated,true);
  assert.equal(store.get(id,2,2),null);
  assert.equal(store.get(id,1,3),null);
  assert.equal(store.get('unknown',1,2),null);
});
test('expiry and eviction fail closed and per-user limits preserve other users', () => {
  let clock=0;const store=createReportSnapshotStore({now:()=>clock,ttl:100,maxEntries:3,perOwner:1});
  const a=store.put(1,1,result()),b=store.put(1,2,result());
  store.put(1,1,result());
  assert.equal(store.get(a.id,1,1),null);assert.ok(store.get(b.id,1,2));
  clock=100;assert.equal(store.get(b.id,1,2),null);
});
test('memory cap rejects oversized CSV and evicts oldest snapshots', () => {
  const store=createReportSnapshotStore({maxBytes:65});
  const a=store.put(1,1,result());assert.ok(a);
  const b=store.put(1,2,result());assert.ok(b);assert.equal(store.get(a.id,1,1),null);
  assert.equal(store.put(1,1,{...result(),rows:[{name:'x'.repeat(100)}]}),null);
});
