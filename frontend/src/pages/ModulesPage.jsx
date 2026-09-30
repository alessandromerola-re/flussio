import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {api,getActiveCompanyId,getRole} from '../services/api.js';
import {getErrorMessage} from '../utils/errorMessages.js';

export default function ModulesPage() {
  const {t}=useTranslation();
  const initialCompany=String(getActiveCompanyId() || '');
  const superadmin=getRole()==='super_admin';
  const [company,setCompany]=useState(initialCompany),[companies,setCompanies]=useState([]);
  const [snapshot,setSnapshot]=useState(null),[events,setEvents]=useState([]),[cursor,setCursor]=useState(null);
  const [draft,setDraft]=useState({}),[preview,setPreview]=useState(null);
  const [error,setError]=useState(''),[historyError,setHistoryError]=useState('');
  const [loading,setLoading]=useState(true),[historyBusy,setHistoryBusy]=useState(false),[previewBusy,setPreviewBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const generation=useRef(0),previewGeneration=useRef(0),historyLock=useRef(false),previewLock=useRef(false);
  const moduleName=code=>t(`modules.names.${code}`);
  const stateName=state=>state == null ? t('modules.notConfigured') : t(`modules.states.${state}`);
  const formatDate=date=>new Date(date).toLocaleString(undefined,{timeZone:'Europe/Rome'});

  useEffect(()=>{
    let active=true;
    if (superadmin) api.getCompanies().then(list=>{if(active)setCompanies(list);}).catch(err=>{if(active)setError(getErrorMessage(t,err));});
    return ()=>{active=false;};
  },[superadmin]);
  useEffect(()=>{
    const current=++generation.current;
    ++previewGeneration.current;
    historyLock.current=false;previewLock.current=false;
    setSnapshot(null);setEvents([]);setCursor(null);setDraft({});setPreview(null);
    setError('');setHistoryError('');setLoading(true);setHistoryBusy(false);setPreviewBusy(false);
    if(!company){setLoading(false);return;}
    const load=async()=>{
      const results=await Promise.allSettled([api.getCompanyModules(company),api.getCompanyModuleEvents(company)]);
      if(current!==generation.current)return;
      if(results[0].status==='fulfilled'){
        const data=results[0].value;
        if(String(data.company_id)!==company){setError(t('errors.SERVER_ERROR'));setLoading(false);return;}
        setSnapshot(data);setDraft(Object.fromEntries(data.modules.map(module=>[module.code,module.state])));
      } else setError(getErrorMessage(t,results[0].reason));
      if(results[1].status==='fulfilled'){
        if(String(results[1].value.company_id)===company){setEvents(results[1].value.events);setCursor(results[1].value.next_cursor);}
        else setHistoryError(t('errors.SERVER_ERROR'));
      } else setHistoryError(getErrorMessage(t,results[1].reason));
      setLoading(false);
    };
    load();
    return ()=>{if(generation.current===current)++generation.current;++previewGeneration.current;};
  },[company,refresh]);

  const edit=(code,state)=>{
    ++previewGeneration.current;
    setDraft(previous=>({...previous,[code]:state}));setPreview(null);
  };
  const simulate=async()=>{
    if(!snapshot||previewLock.current)return;
    const changes=snapshot.modules.filter(module=>module.code!=='core'&&draft[module.code]!==module.state).map(module=>({module:module.code,state:draft[module.code]}));
    if(!changes.length)return;
    const context=generation.current,current=++previewGeneration.current;
    previewLock.current=true;setPreviewBusy(true);setPreview(null);setError('');
    try {
      const result=await api.previewCompanyModules(company,{expected_version:snapshot.version,changes});
      if(context===generation.current&&current===previewGeneration.current&&String(result.company_id)===company)setPreview(result);
    } catch(err) {if(context===generation.current&&current===previewGeneration.current)setError(getErrorMessage(t,err));}
    finally {if(context===generation.current){previewLock.current=false;setPreviewBusy(false);}}
  };
  const loadMore=async()=>{
    if(!cursor||historyLock.current)return;
    const current=generation.current;
    historyLock.current=true;setHistoryBusy(true);setHistoryError('');
    try {
      const result=await api.getCompanyModuleEvents(company,cursor);
      if(current!==generation.current)return;
      if(String(result.company_id)!==company)throw new Error(t('errors.SERVER_ERROR'));
      setEvents(previous=>[...previous,...result.events.filter(event=>!previous.some(old=>old.id===event.id))]);setCursor(result.next_cursor);
    } catch(err) {if(current===generation.current)setHistoryError(getErrorMessage(t,err));}
    finally {if(current===generation.current){historyLock.current=false;setHistoryBusy(false);}}
  };
  const changed=Boolean(snapshot?.modules.some(module=>draft[module.code]!==module.state));
  return <div className="page modules-page">
    <div className="page-header"><h1>{t('modules.title')}</h1><button type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>{t('modules.refresh')}</button></div>
    {superadmin&&<label>{t('common.company')}<select value={company} onChange={event=>setCompany(event.target.value)}>
      {!company&&<option value="">{t('modules.chooseCompany')}</option>}
      {company&&!companies.some(item=>String(item.id)===company)&&<option value={company}>{t('modules.currentCompany')}</option>}
      {companies.map(item=><option key={item.id} value={String(item.id)}>{item.name}</option>)}
    </select></label>}
    {error&&<p role="alert">{error}</p>}
    {loading&&<p role="status">{t('modules.loading')}</p>}
    {snapshot&&String(snapshot.company_id)===company&&<>
      <p className="modules-notice">{snapshot.enforcement_ready?t('modules.liveHint'):t('modules.preparationHint')}</p>
      <div className="modules-grid">{snapshot.modules.map(module=><section className="card module-card" key={module.code}>
        <h2>{moduleName(module.code)}</h2><p>{t(`modules.description.${module.code}`)}</p>
        <p><strong>{!module.available?t('modules.unavailable'):module.code==='core'?t('modules.alwaysActive'):stateName(module.state)}</strong></p>
        {module.dependencies.length>0&&<p className="muted">{t('modules.dependencies')}: {module.dependencies.map(moduleName).join(', ')}</p>}
        {superadmin&&module.available&&module.code!=='core'&&<label>{t('modules.proposedState')}<select aria-label={`${t('modules.proposedState')} ${moduleName(module.code)}`} value={draft[module.code]||module.state} onChange={event=>edit(module.code,event.target.value)}>
          {['enabled','read_only','disabled'].map(state=><option key={state} value={state}>{stateName(state)}</option>)}
        </select></label>}
      </section>)}</div>
      {superadmin&&<section className="card"><h2>{t('modules.previewTitle')}</h2><p>{t('modules.previewHint')}</p>
        <button type="button" disabled={!changed||previewBusy} onClick={simulate}>{t('modules.preview')}</button>
        {previewBusy&&<p role="status">{t('modules.loading')}</p>}
        {preview&&<div className="module-preview" role="status"><p>{t('modules.notApplied')}</p>
          {preview.impact.map(item=><div key={item.module}><h3>{moduleName(item.module)}</h3>
            <p>{stateName(item.from)} → {stateName(item.to)}</p>
            <dl><div><dt>{t('modules.records')}</dt><dd>{item.records}</dd></div><div><dt>{t('modules.movements')}</dt><dd>{item.linked_movements}</dd></div><div><dt>{t('modules.recurring')}</dt><dd>{item.active_recurring}</dd></div></dl>
            {item.to==='disabled'&&<p>{t('modules.disabledImpact')}</p>}
            {item.to==='read_only'&&<p>{t('modules.readOnlyImpact')}</p>}
          </div>)}
        </div>}
      </section>}
      <section className="card"><h2>{t('modules.history')}</h2>
        {historyError&&<p role="alert">{historyError}</p>}
        {!historyError&&!events.length&&<p>{t('modules.emptyHistory')}</p>}
        <ul className="module-history">{events.map(event=><li key={event.id}>
          <strong>{moduleName(event.module_code)}</strong><span>{stateName(event.previous_state)} → {stateName(event.new_state)}</span>
          <time dateTime={event.created_at}>{formatDate(event.created_at)}</time>
          <p>{event.reason==='legacy_compatibility'?t('modules.legacyReason'):event.reason}</p>
          <small>{event.actor_user_id==null?t('modules.systemActor'):t('modules.actor',{id:event.actor_user_id})}</small>
        </li>)}</ul>
        {cursor&&<button type="button" disabled={historyBusy} onClick={loadMore}>{t('modules.moreHistory')}</button>}
      </section>
    </>}
  </div>;
}
