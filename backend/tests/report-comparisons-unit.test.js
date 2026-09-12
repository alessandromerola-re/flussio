import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonWindows,changePercent } from '../src/services/reportComparisons.js';
import { validateAndNormalizeSpec } from '../src/services/advancedReports.js';
test('calendar comparisons handle full/partial months and leap-year boundaries',()=>{
 const windows=comparisonWindows({reportKind:'mom',dateFrom:'2024-03-15',dateTo:'2024-04-10'});
 assert.deepEqual(windows.map(w=>[w.current_from,w.current_to,w.previous_from,w.previous_to]),[['2024-03-15','2024-03-31','2024-02-15','2024-02-29'],['2024-04-01','2024-04-10','2024-03-01','2024-03-10']]);
 assert.equal(comparisonWindows({reportKind:'yoy',dateFrom:'2024-02-29',dateTo:'2024-02-29'})[0].previous_from,'2023-02-28');
 assert.equal(comparisonWindows({reportKind:'mom',dateFrom:'2026-01-01',dateTo:'2026-01-31'})[0].previous_from,'2025-12-01');
});
test('percentages handle zero, negative bases and exact large cents',()=>{
 assert.equal(changePercent('10','0'),null);assert.equal(changePercent('0','0'),null);
 assert.equal(changePercent('50','-100'),'150.00');assert.equal(changePercent('100','300'),'-66.66');
 assert.equal(changePercent('18014398509481986','9007199254740993'),'100.00');
});
test('special reports validate shape, filters and bounded ranges',()=>{
 const base={dateFrom:'2026-01-01',dateTo:'2026-09-12',reportKind:'budget',groupBy:['job'],filters:{type:'all'}};
 assert.equal(validateAndNormalizeSpec(base,1).reportKind,'budget');
 assert.ok(validateAndNormalizeSpec({...base,filters:{accountId:1}},1).error);
 assert.ok(validateAndNormalizeSpec({...base,reportKind:'yoy',groupBy:['month'],dateFrom:'2000-01-01'},1).error);
 assert.ok(validateAndNormalizeSpec({...base,reportKind:'quality',groupBy:[],qualityDimensions:['sql']},1).error);
 assert.ok(validateAndNormalizeSpec({...base,reportKind:'mom',groupBy:['month']},1).error);
});
