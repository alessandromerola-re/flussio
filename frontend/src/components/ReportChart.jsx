import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { buildReportChart } from '../utils/reportChart.js';
import { formatCurrency } from '../utils/currency.js';
ChartJS.register(ArcElement,BarElement,CategoryScale,Legend,LineElement,LinearScale,PointElement,Tooltip);
const colors=['#2563eb','#059669','#d97706','#9333ea','#dc2626','#0891b2','#475569','#be185d'];
export default function ReportChart({result,suggestion}) {
  const {t}=useTranslation();
  const suggested = (!result.spec.reportKind || result.spec.reportKind==='standard') && result.spec.groupBy?.includes(suggestion?.x);
  const [type,setType]=useState(suggested?suggestion.type:'auto'),[metric,setMetric]=useState(suggested?suggestion.series?.[0]||'':''),[budgetMeasure,setBudgetMeasure]=useState('cost');
  const model=useMemo(()=>buildReportChart(result,{type,metric,budgetMeasure},t),[result,type,metric,budgetMeasure,t]);
  const data={labels:model.labels,datasets:model.datasets.map((dataset,i)=>({...dataset,borderColor:colors[i%colors.length],backgroundColor:model.type==='pie'?model.labels.map((_,j)=>colors[j%colors.length]):colors[i%colors.length],borderWidth:2,pointRadius:3,spanGaps:false}))};
  const options={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:(context)=>`${context.dataset.label}: ${model.money?formatCurrency(model.type==='pie'?context.parsed:context.parsed.y):(model.type==='pie'?context.parsed:context.parsed.y)}`}}},...(model.type==='pie'?{}:{scales:{x:{stacked:model.type==='stacked_bar',ticks:{maxRotation:45,autoSkip:true}},y:{stacked:model.type==='stacked_bar',beginAtZero:true,title:{display:true,text:model.money?'EUR':t('pages.reportsAdvanced.metrics.count')}}}})};
  const Chart=model.type==='pie'?Pie:model.type==='line'?Line:Bar;
  const standard=!result.spec.reportKind||result.spec.reportKind==='standard';
  return <section className="report-chart-card" aria-label={t('reportChart.title')}>
    <h3>{t('reportChart.title')}</h3>
    <div className="report-chart-controls">
      <label>{t('reportChart.kind')}<select value={type} onChange={e=>setType(e.target.value)}>{['auto','line','bar','stacked_bar','pie'].map(k=><option key={k} value={k}>{t(`reportChart.kind.${k}`)}</option>)}</select></label>
      {standard&&<label>{t('reportChart.metric')}<select value={(result.spec.metrics||[]).includes(metric)?metric:result.spec.metrics?.[0]||''} onChange={e=>setMetric(e.target.value)}>{result.spec.metrics.map(k=><option key={k} value={k}>{t(`pages.reportsAdvanced.metrics.${k}`)}</option>)}</select></label>}
      {result.spec.reportKind==='budget'&&<label>{t('reportChart.measure')}<select value={budgetMeasure} onChange={e=>setBudgetMeasure(e.target.value)}>{['cost','revenue','margin'].map(k=><option key={k} value={k}>{t(`reportChart.${k}`)}</option>)}</select></label>}
    </div>
    <p className="muted">{t('reportChart.tableHint')}</p>
    {result.truncated&&<p className="warning">{t('reportChart.partial')}</p>}
    {model.reason?<p role="status">{t(`reportChart.${model.reason}`)}</p>:<div className="report-canvas"><Chart data={data} options={options} role="img" aria-label={t('reportChart.title')} /></div>}
  </section>;
}
