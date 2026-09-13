import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReportChart} from '../src/utils/reportChart.js';
const result=(groupBy,rows,metrics=['net_sum_cents'])=>({spec:{groupBy,metrics},rows});
test('time charts preserve chronology, currency units and negative values',()=>{
 const model=buildReportChart(result(['month'],[{bucket:'2026-02',net_sum_cents:1000},{bucket:'2026-01',net_sum_cents:-2000}]));
 assert.deepEqual(model.labels,['2026-01','2026-02']);assert.deepEqual(model.datasets[0].data,[-20,10]);assert.equal(model.type,'line');
});
test('stacked charts pivot the second grouping and do not fabricate zeros for truncated results',()=>{
 const input=result(['month','category'],[{bucket:'2026-01',category_id:1,category_name:'A',net_sum_cents:100},{bucket:'2026-02',category_id:2,category_name:'B',net_sum_cents:-300}]);
 const model=buildReportChart(input);assert.equal(model.type,'stacked_bar');assert.deepEqual(model.datasets.map(d=>d.data),[[1,0],[0,-3]]);
 const partial=buildReportChart({...input,truncated:true});assert.deepEqual(partial.datasets[0].data,[1,null]);
 const average=buildReportChart({...input,spec:{...input.spec,metrics:['avg_abs_cents']}},{type:'stacked_bar'});assert.equal(average.reason,'stackUnsupported');
});
test('pies reject negative, zero-only, missing and non-additive values',()=>{
 const input=value=>result(['category'],[{category_id:1,category_name:'A',net_sum_cents:value}]);
 assert.equal(buildReportChart(input(-100),{type:'pie'}).reason,'pieNegative');
 assert.equal(buildReportChart(input(null),{type:'pie'}).reason,'pieNegative');
 assert.equal(buildReportChart(input(0),{type:'pie'}).reason,'zero');
 assert.equal(buildReportChart(input(100),{type:'pie'}).type,'pie');
 assert.equal(buildReportChart(result(['category'],[{category_id:1,avg_abs_cents:300}],['avg_abs_cents']),{type:'pie'}).reason,'pieUnsupported');
});
test('budget charts preserve missing budgets and compare the chosen measure',()=>{
 const input={spec:{reportKind:'budget'},rows:[{job_id:1,job_title:'Job',expected_cost_cents:null,expense_sum_cents:300,expected_net_cents:0,net_sum_cents:-100}]};
 assert.deepEqual(buildReportChart(input).datasets.map(d=>d.data),[[null],[3]]);
 assert.deepEqual(buildReportChart(input,{budgetMeasure:'margin'}).datasets.map(d=>d.data),[[0],[-1]]);
});
test('comparison charts contain two chronological series, quality uses counts',()=>{
 const comparison=buildReportChart({spec:{reportKind:'yoy'},rows:[{bucket:'2026-02',current_cents:500,previous_cents:200}]});
 assert.deepEqual(comparison.datasets.map(d=>d.data),[[5],[2]]);
 const quality=buildReportChart({spec:{reportKind:'quality'},rows:[{dimension:'account',missing_count:3}]});assert.equal(quality.money,false);assert.deepEqual(quality.datasets[0].data,[3]);
});
