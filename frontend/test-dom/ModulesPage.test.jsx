import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import ModulesPage from '../src/pages/ModulesPage.jsx';
import {api,getIsSuperAdmin,getRole} from '../src/services/api.js';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key)=>key})}));
vi.mock('../src/services/api.js',()=>({getActiveCompanyId:()=> '1',getIsSuperAdmin:vi.fn(()=>true),getRole:vi.fn(()=> 'super_admin'),api:Object.fromEntries(['getCompanies','getCompanyModules','getCompanyModuleEvents','previewCompanyModules'].map(key=>[key,vi.fn()]))}));
const snapshot=(id=1)=>({company_id:id,version:'3',enforcement_ready:false,modules:[{code:'core',available:true,dependencies:[],state:'enabled'},{code:'jobs',available:true,dependencies:['core'],state:'enabled'},{code:'wealth',available:false,dependencies:['core'],state:'disabled'}]});
beforeEach(()=>{
 vi.clearAllMocks();getIsSuperAdmin.mockReturnValue(true);getRole.mockReturnValue('super_admin');
 api.getCompanies.mockResolvedValue([{id:1,name:'One'},{id:2,name:'Two'}]);
 api.getCompanyModules.mockImplementation(async id=>snapshot(Number(id)));
 api.getCompanyModuleEvents.mockImplementation(async id=>({company_id:Number(id),events:[],next_cursor:null}));
 api.previewCompanyModules.mockResolvedValue({company_id:1,can_apply:false,impact:[{module:'jobs',from:'enabled',to:'read_only',records:'2',linked_movements:'4',active_recurring:'1'}]});
});
it('shows availability and immutable Base while an ordinary admin has no preview controls',async()=>{
 getIsSuperAdmin.mockReturnValue(false);getRole.mockReturnValue('admin');render(<ModulesPage/>);
 await screen.findByText('modules.names.jobs');
 expect(screen.getByText('modules.preparationHint')).toBeTruthy();expect(screen.getByText('modules.alwaysActive')).toBeTruthy();expect(screen.getByText('modules.unavailable')).toBeTruthy();
 expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByText('modules.preview')).toBeNull();expect(api.getCompanies).not.toHaveBeenCalled();
});
it('simulates only changed modules against the captured version and exposes no apply button',async()=>{
 render(<ModulesPage/>);await screen.findByText('modules.names.jobs');
 fireEvent.change(screen.getByLabelText('modules.proposedState modules.names.jobs'),{target:{value:'read_only'}});
 fireEvent.click(screen.getByText('modules.preview'));await screen.findByText('modules.notApplied');
 expect(api.previewCompanyModules).toHaveBeenCalledWith('1',{expected_version:'3',changes:[{module:'jobs',state:'read_only'}]});
 expect(screen.getByText('modules.readOnlyImpact')).toBeTruthy();expect(screen.queryByText('modules.apply')).toBeNull();
 fireEvent.change(screen.getByLabelText('modules.proposedState modules.names.jobs'),{target:{value:'disabled'}});
 expect(screen.queryByText('modules.notApplied')).toBeNull();
});
it('ignores a preview response after a newer draft edit',async()=>{
 let resolve;api.previewCompanyModules.mockReturnValue(new Promise(done=>{resolve=done;}));
 render(<ModulesPage/>);await screen.findByText('modules.names.jobs');
 const select=screen.getByLabelText('modules.proposedState modules.names.jobs');fireEvent.change(select,{target:{value:'read_only'}});fireEvent.click(screen.getByText('modules.preview'));
 fireEvent.change(select,{target:{value:'disabled'}});
 await act(async()=>resolve({company_id:1,impact:[]}));expect(screen.queryByText('modules.notApplied')).toBeNull();
});
it('clears the old company and ignores late responses after switching company',async()=>{
 let resolve;api.getCompanyModules.mockImplementation(id=>id==='1'?new Promise(done=>{resolve=done;}):Promise.resolve(snapshot(2)));
 render(<ModulesPage/>);await screen.findByText('Two');fireEvent.change(screen.getByLabelText('common.company'),{target:{value:'2'}});
 await screen.findByText('modules.names.jobs');await act(async()=>resolve({...snapshot(1),modules:[{code:'real_estate',available:true,dependencies:['core'],state:'enabled'}]}));
 expect(screen.queryByText('modules.names.real_estate')).toBeNull();
});
it('loads history pages once and hides stale company history',async()=>{
 api.getCompanyModuleEvents.mockImplementation(async(id,before)=>({company_id:Number(id),events:Number(id)===1?[{id:before?'2':'3',module_code:'jobs',previous_state:'enabled',new_state:'read_only',created_at:'2026-09-29T10:00:00Z',reason:before?'Earlier':'Recent'}]:[],next_cursor:before?null:'3'}));
 render(<ModulesPage/>);await screen.findByText('Recent');fireEvent.click(screen.getByText('modules.moreHistory'));fireEvent.click(screen.getByText('modules.moreHistory'));
 await screen.findByText('Earlier');expect(api.getCompanyModuleEvents).toHaveBeenCalledWith('1','3');
 expect(api.getCompanyModuleEvents.mock.calls.filter(call=>call[1]==='3').length).toBe(1);
 fireEvent.change(screen.getByLabelText('common.company'),{target:{value:'2'}});await screen.findByText('modules.emptyHistory');expect(screen.queryByText('Recent')).toBeNull();
});
it('shows errors and rejects an API response for the wrong company',async()=>{
 api.getCompanyModules.mockResolvedValue(snapshot(2));render(<ModulesPage/>);
 expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('modules.names.jobs')).toBeNull();
});

it('uses the verified current role for preview after superadmin privileges were revoked',async()=>{
 getIsSuperAdmin.mockReturnValue(true);getRole.mockReturnValue('admin');render(<ModulesPage/>);
 await screen.findByText('modules.names.jobs');
 expect(screen.queryByText('modules.preview')).toBeNull();expect(screen.queryByRole('combobox')).toBeNull();
 expect(api.getCompanies).not.toHaveBeenCalled();expect(api.previewCompanyModules).not.toHaveBeenCalled();
});
