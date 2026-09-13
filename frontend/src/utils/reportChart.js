const times = new Set(['day','week','month','quarter','year']);
const additive = new Set(['income_sum_cents','expense_sum_cents','net_sum_cents','count']);
const field = { category:'category_name',account:'account_name',contact:'contact_name',job:'job_title',property:'property_name' };
const key = (row, dim) => times.has(dim) ? row.bucket : dim === 'recurring' ? String(row.recurring) : dim === 'type' ? row.type : row[`${dim}_id`] == null ? 'null' : String(row[`${dim}_id`]);
const value = (raw, money) => raw == null || raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) / (money ? 100 : 1) : null;
const dimensionLabel = (row, dim, t) => times.has(dim) ? row.bucket : dim === 'type' ? t(`pages.movements.${row.type}`) : dim === 'recurring' ? t(row.recurring ? 'pages.reportsAdvanced.recurringYes':'pages.reportsAdvanced.recurringNo') : row[field[dim]] || t(`pages.reportsAdvanced.missing${dim[0].toUpperCase()}${dim.slice(1)}`);

// Chart data always comes from the applied result, never the editable draft.
export const buildReportChart = (result, {metric, type='auto', budgetMeasure='cost'} = {}, t=(key)=>key) => {
  const rows=result?.rows || [], spec=result?.spec || {}, kind=spec.reportKind || 'standard';
  let labels=[], datasets=[], money=true, preferred='bar', canStack=false;
  const metricLabel=(name)=>t(`pages.reportsAdvanced.metrics.${name}`);
  if (kind==='yoy'||kind==='mom') {
    const sorted=[...rows].sort((a,b)=>a.bucket.localeCompare(b.bucket));
    labels=sorted.map(r=>r.bucket); preferred='line';
    datasets=['current','previous'].map(period=>({label:t(`reportChart.${period}`),data:sorted.map(r=>value(r[`${period}_cents`],true))}));
  } else if(kind==='budget') {
    labels=rows.map(r=>`${r.job_title} (#${r.job_id})`);
    const expected=budgetMeasure==='revenue'?'expected_revenue_cents':budgetMeasure==='margin'?'expected_net_cents':'expected_cost_cents';
    const actual=budgetMeasure==='revenue'?'income_sum_cents':budgetMeasure==='margin'?'net_sum_cents':'expense_sum_cents';
    datasets=[{label:t('reportChart.expected'),data:rows.map(r=>value(r[expected],true))},{label:t('reportChart.actual'),data:rows.map(r=>value(r[actual],true))}];
  } else if(kind==='quality') {
    money=false;labels=rows.map(r=>t(`pages.reportsAdvanced.groupOptions.${r.dimension}`));
    datasets=[{label:t('reportComparison.missing_count'),data:rows.map(r=>value(r.missing_count,false))}];
  } else {
    const selected=(spec.metrics || []).includes(metric)?metric:spec.metrics?.[0];
    if(!selected)return {labels:[],datasets:[],reason:'empty'};
    money=selected.includes('cents');
    const dims=spec.groupBy || [], time=dims.find(d=>times.has(d));
    const x=time || dims[0], series=dims.find(d=>d!==x);
    preferred=time?'line':'bar';
    // Pivot only additive metrics. Averages must never be added across groups.
    canStack=Boolean(series && additive.has(selected));
    if(canStack) {
      const xs=new Map(), ys=new Map();
      for(const row of rows){xs.set(key(row,x),dimensionLabel(row,x,t));ys.set(key(row,series),dimensionLabel(row,series,t));}
      const xkeys=[...xs.keys()].sort(), ykeys=[...ys.keys()].sort();
      const name=(map,k)=>[...map.values()].filter(v=>v===map.get(k)).length>1?`${map.get(k)} (#${k})`:map.get(k);
      labels=xkeys.map(k=>name(xs,k));
      const lookup=new Map(rows.map(row=>[JSON.stringify([key(row,x),key(row,series)]),value(row[selected],money)]));
      datasets=ykeys.map(k=>({label:name(ys,k),data:xkeys.map(xk=>lookup.has(JSON.stringify([xk,k])) ? lookup.get(JSON.stringify([xk,k])) : (result.truncated?null:0))}));
      preferred='stacked_bar';
    } else {
      const sorted=time?[...rows].sort((a,b)=>a.bucket.localeCompare(b.bucket)):rows;
      labels=sorted.map(r=>dims.length?dims.map(d=>dimensionLabel(r,d,t)).join(' · '):t('reportChart.total'));
      datasets=[{label:metricLabel(selected),data:sorted.map(r=>value(r[selected],money))}];
    }
  }
  const chosen=type==='auto'?preferred:type;
  if(!rows.length)return {labels,datasets,money,type:chosen,canStack,reason:'empty'};
  if(chosen==='stacked_bar'&&!canStack)return {labels,datasets,money,type:chosen,canStack,reason:'stackUnsupported'};
  // Pies need a nonnegative additive composition, not signed net/averages or overlaps.
  if(chosen==='pie'&&(kind!=='standard'||datasets.length!==1||!additive.has((spec.metrics||[]).includes(metric)?metric:spec.metrics?.[0])))return {labels,datasets,money,type:chosen,canStack,reason:'pieUnsupported'};
  if(chosen==='pie'&&datasets[0].data.some(n=>n==null||n<0))return {labels,datasets,money,type:chosen,canStack,reason:'pieNegative'};
  if(chosen==='pie'&&datasets[0].data.every(n=>n===0))return {labels,datasets,money,type:chosen,canStack,reason:'zero'};
  return {labels,datasets,money,type:chosen,canStack};
};
