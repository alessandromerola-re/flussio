import React from 'react';
import { render as baseRender } from '@testing-library/react';
import { CompanyCapabilitiesContext } from '../../src/modules/CompanyCapabilities.jsx';
import { capabilityView } from '../../src/modules/capabilities.js';
export function moduleProfile({ company=1, jobs='enabled', real_estate='enabled', role='admin', version='0' }={}) {
  const capabilities={};
  const permissions = role === 'viewer' ? ['read'] : role === 'operatore' ? ['read','write'] : role === 'editor' ? ['read','write','delete','export','import'] : ['read','write','delete','export','import','import_movements'];
  for(const [module,caps] of [['core',['finance','general_reports','recurring']],['jobs',['jobs','job_reports','job_links']],['real_estate',['properties','property_reports','property_links']]]){
    const state=module==='core'?'enabled':module==='jobs'?jobs:real_estate;
    for(const cap of caps) capabilities[cap]=Object.fromEntries(['read','write','delete','export','import','import_movements'].map(action=>[action,permissions.includes(action) && (state==='enabled'||(state==='read_only'&&['read','export'].includes(action)))]));
  }
  return {company_id:company,version,role,modules:[{code:'core',state:'enabled'},{code:'jobs',state:jobs},{code:'real_estate',state:real_estate}],capabilities};
}
export function render(ui,{modules={},...options}={}) {
  const value={...capabilityView(moduleProfile(modules)),loading:false,error:null,refresh:()=>{}};
  return baseRender(<CompanyCapabilitiesContext.Provider value={value}>{ui}</CompanyCapabilitiesContext.Provider>,options);
}
