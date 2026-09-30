import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import ModulesPage from '../src/pages/ModulesPage.jsx';
import {api,getIsSuperAdmin,getRole} from '../src/services/api.js';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key)=>key})}));
vi.mock('../src/services/api.js',()=>({getActiveCompanyId:()=> '1',getIsSuperAdmin:vi.fn(()=>true),getRole:vi.fn(()=> 'super_admin'),api:Object.fromEntries(['getCompanies','getCompanyModules','getCompanyModuleEvents','previewCompanyModules','applyCompanyModules'].map(key=>[key,vi.fn()]))}));
const refreshCapabilities=vi.hoisted(()=>vi.fn());
vi.mock('../src/modules/CompanyCapabilities.jsx',()=>({useCompanyCapabilities:()=>({refresh:refreshCapabilities})}));
const snapshot=(id=1)=>({company_id:id,version:'3',enforcement_ready:false,modules:[{code:'core',available:true,dependencies:[],state:'enabled'},{code:'jobs',available:true,dependencies:['core'],state:'enabled'},{code:'wealth',available:false,dependencies:['core'],state:'disabled'}]});
beforeEach(()=>{
 vi.clearAllMocks();api.applyCompanyModules.mockReset();getIsSuperAdmin.mockReturnValue(true);getRole.mockReturnValue('super_admin');
 api.getCompanies.mockResolvedValue([{id:1,name:'One'},{id:2,name:'Two'}]);
 api.getCompanyModules.mockImplementation(async id=>snapshot(Number(id)));
 api.getCompanyModuleEvents.mockImplementation(async id=>({company_id:Number(id),events:[],next_cursor:null}));
 api.previewCompanyModules.mockResolvedValue({company_id:1,version:'3',can_apply:false,impact:[{module:'jobs',from:'enabled',to:'read_only',records:'2',linked_movements:'4',active_recurring:'1'}]});
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

const live = id => ({...snapshot(id),enforcement_ready:true});
const operational = () => {
 api.getCompanyModules.mockImplementation(async id=>live(Number(id)));
 api.previewCompanyModules.mockImplementation(async (id,input)=>({company_id:Number(id),version:input.expected_version,can_apply:true,impact:input.changes.map(change=>({module:change.module,from:'enabled',to:change.state,records:'2',linked_movements:'4',active_recurring:'1'}))}));
 api.applyCompanyModules.mockImplementation(async (id,input)=>({...live(Number(id)),version:'4',operation_id:'operation-test',modules:live(Number(id)).modules.map(module=>input.changes.some(change=>change.module===module.code)?{...module,state:input.changes.find(change=>change.module===module.code).state}:module)}));
};
const prepare = async () => {
 const page=render(<ModulesPage/>);await screen.findByText('modules.names.jobs');
 fireEvent.change(screen.getByLabelText('modules.proposedState modules.names.jobs'),{target:{value:'read_only'}});
 fireEvent.click(screen.getByText('modules.preview'));await screen.findByText('modules.notApplied');
 return page;
};
const reason = text => fireEvent.change(screen.getByLabelText('modules.reason'),{target:{value:text}});

it('requires a fresh preview and a nonblank bounded reason before applying',async()=>{
 operational();await prepare();const button=screen.getByText('modules.apply');expect(button.disabled).toBe(true);
 reason('   ');expect(button.disabled).toBe(true);reason('x'.repeat(1001));expect(button.disabled).toBe(true);
 reason('Collaudo dei moduli');expect(button.disabled).toBe(false);expect(api.applyCompanyModules).not.toHaveBeenCalled();
});
it('applies only the previewed states and version, updates history and refreshes the active profile',async()=>{
 operational();await prepare();reason('  Conservazione dei dati  ');fireEvent.click(screen.getByText('modules.apply'));
 await screen.findByText('modules.applied');
 expect(api.applyCompanyModules).toHaveBeenCalledWith('1',{expected_version:'3',changes:[{module:'jobs',state:'read_only'}],reason:'Conservazione dei dati'});
 expect(screen.getByLabelText('modules.proposedState modules.names.jobs').value).toBe('read_only');
 expect(screen.queryByText('modules.apply')).toBeNull();expect(refreshCapabilities).toHaveBeenCalledTimes(1);
 expect(api.getCompanyModuleEvents.mock.calls.filter(([id])=>id==='1')).toHaveLength(2);
});
it('keeps a foreign target separate from the active company capabilities',async()=>{
 operational();render(<ModulesPage/>);await screen.findByText('Two');
 fireEvent.change(screen.getByLabelText('common.company'),{target:{value:'2'}});await screen.findByText('modules.names.jobs');
 fireEvent.change(screen.getByLabelText('modules.proposedState modules.names.jobs'),{target:{value:'read_only'}});
 fireEvent.click(screen.getByText('modules.preview'));await screen.findByText('modules.notApplied');reason('Foreign company');
 fireEvent.click(screen.getByText('modules.apply'));await screen.findByText('modules.applied');
 expect(api.applyCompanyModules.mock.calls[0][0]).toBe('2');expect(refreshCapabilities).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('common.company'),{target:{value:'1'}});
 expect(screen.queryByText('modules.applied')).toBeNull();
});
it('locks duplicate clicks and target edits during application',async()=>{
 operational();let resolve;api.applyCompanyModules.mockReturnValue(new Promise(done=>{resolve=done;}));
 await prepare();reason('Reviewed plan');const button=screen.getByText('modules.apply');fireEvent.click(button);fireEvent.click(button);
 expect(api.applyCompanyModules).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('common.company').disabled).toBe(true);
 expect(screen.getByLabelText('modules.proposedState modules.names.jobs').disabled).toBe(true);expect(screen.getByLabelText('modules.reason').disabled).toBe(true);
 await act(async()=>resolve({...live(1),version:'4',operation_id:'done'}));await screen.findByText('modules.applied');
});
it('invalidates application when the draft changes after preview',async()=>{
 operational();await prepare();reason('Reviewed plan');
 fireEvent.change(screen.getByLabelText('modules.proposedState modules.names.jobs'),{target:{value:'disabled'}});
 expect(screen.queryByText('modules.apply')).toBeNull();expect(api.applyCompanyModules).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('modules.preview'));await screen.findByText('modules.notApplied');
 fireEvent.click(screen.getByText('modules.apply'));await screen.findByText('modules.applied');
 expect(api.applyCompanyModules.mock.calls[0][1].changes).toEqual([{module:'jobs',state:'disabled'}]);
});
it('reloads conflicts without retrying or keeping a stale preview',async()=>{
 operational();await prepare();reason('Reviewed plan');
 api.applyCompanyModules.mockRejectedValueOnce(Object.assign(new Error('stale'),{code:'MODULE_VERSION_CONFLICT'}));
 api.getCompanyModules.mockResolvedValueOnce({...live(1),version:'4'});
 fireEvent.click(screen.getByText('modules.apply'));await screen.findByText('modules.conflictReload');
 await waitFor(()=>expect(api.getCompanyModules).toHaveBeenCalledTimes(2));await screen.findByText('modules.names.jobs');
 expect(screen.queryByText('modules.apply')).toBeNull();expect(api.applyCompanyModules).toHaveBeenCalledTimes(1);
 expect(api.previewCompanyModules).toHaveBeenCalledTimes(1);
});
it('ignores an application response after its company page was unmounted',async()=>{
 operational();let resolve;api.applyCompanyModules.mockReturnValue(new Promise(done=>{resolve=done;}));
 const page=await prepare();reason('Reviewed plan');fireEvent.click(screen.getByText('modules.apply'));page.unmount();
 await act(async()=>resolve({...live(1),version:'4',operation_id:'done'}));
 expect(refreshCapabilities).not.toHaveBeenCalled();expect(api.getCompanyModuleEvents).toHaveBeenCalledTimes(1);
});
