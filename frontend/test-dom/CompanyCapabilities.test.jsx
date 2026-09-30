import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CompanyCapabilitiesProvider, useCompanyCapabilities } from '../src/modules/CompanyCapabilities.jsx';
import { CapabilityRoute } from '../src/modules/ModuleNotice.jsx';
import { api, setToken, setActiveCompanyId, getRole } from '../src/services/api.js';
import { moduleProfile } from './helpers/moduleRender.jsx';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise,resolve}; };
function Probe() {
  const modules = useCompanyCapabilities();
  return <><output data-testid="context">{modules.ready ? `${modules.scope}/${modules.can('jobs','write')}` : modules.error ? 'failed' : 'pending'}</output><button onClick={modules.refresh}>Retry</button><CapabilityRoute capability="jobs"><span>Job detail</span></CapabilityRoute></>;
}
const setup = () => render(<CompanyCapabilitiesProvider><Probe /></CompanyCapabilitiesProvider>);
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
  setToken('test', 'admin'); setActiveCompanyId(1);
  vi.spyOn(api, 'getCurrentCapabilities').mockResolvedValue(moduleProfile());
});
it('defaults to denied and blocks optional routes before the verified profile arrives', async () => {
  const pending=deferred(); api.getCurrentCapabilities.mockReturnValue(pending.promise); setup();
  expect(screen.queryByText('Job detail')).toBeNull(); expect(screen.getByTestId('context').textContent).toBe('pending');
  await act(async () => pending.resolve(moduleProfile({jobs:'disabled'})));
  expect(screen.getByTestId('context').textContent).toBe('1:0:admin/false');
  expect(screen.queryByText('Job detail')).toBeNull(); expect(screen.getByRole('alert').textContent).toBe('errors.MODULE_DISABLED');
});
it('invalidates the old profile immediately on change and ignores stale A-B-A responses', async () => {
  const a=deferred(), b=deferred(), newA=deferred();
  api.getCurrentCapabilities.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(newA.promise);
  setup(); act(() => setActiveCompanyId(2)); act(() => setActiveCompanyId(1));
  await act(async () => newA.resolve(moduleProfile({jobs:'read_only',version:'9'})));
  expect(screen.getByTestId('context').textContent).toBe('1:9:admin/false'); expect(screen.getByText('Job detail')).toBeTruthy();
  await act(async () => { a.resolve(moduleProfile()); b.resolve(moduleProfile({company:2})); });
  expect(screen.getByTestId('context').textContent).toBe('1:9:admin/false');
});
it('clears capabilities on error and recovers through retry', async () => {
  api.getCurrentCapabilities.mockRejectedValueOnce(new Error('offline')); setup();
  await waitFor(() => expect(screen.getByTestId('context').textContent).toBe('failed'));
  expect(screen.queryByText('Job detail')).toBeNull(); fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(screen.getByTestId('context').textContent).toBe('1:0:admin/true'));
});
it('rejects a foreign or malformed response instead of keeping previous rights', async () => {
  api.getCurrentCapabilities.mockResolvedValueOnce(moduleProfile({company:2})); setup();
  await waitFor(() => expect(screen.getByTestId('context').textContent).toBe('failed'));
  api.getCurrentCapabilities.mockResolvedValueOnce({...moduleProfile(),version:undefined}); fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(api.getCurrentCapabilities).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Job detail')).toBeNull();
});
it('rereads version and server role on focus, including a downgrade in the same company', async () => {
  setup(); await screen.findByText('Job detail');
  api.getCurrentCapabilities.mockResolvedValueOnce(moduleProfile({role:'viewer',version:'5'}));
  fireEvent.focus(window);
  await waitFor(() => expect(screen.getByTestId('context').textContent).toBe('1:5:viewer/false'));
  expect(getRole()).toBe('viewer');
});
it('removes rights when the session changes even with the same company', async () => {
  setup(); await screen.findByText('Job detail'); const pending=deferred(); api.getCurrentCapabilities.mockReturnValue(pending.promise);
  act(() => setToken('new-user', 'viewer'));
  expect(screen.queryByText('Job detail')).toBeNull(); expect(screen.getByTestId('context').textContent).toBe('pending');
  await act(async () => pending.resolve(moduleProfile({role:'viewer'})));
  expect(screen.getByTestId('context').textContent).toBe('1:0:viewer/false');
});

it('refreshes rights after a module refusal from an ordinary API operation', async () => {
  setup(); await screen.findByText('Job detail');
  api.getCurrentCapabilities.mockResolvedValueOnce(moduleProfile({jobs:'disabled',version:'1'}));
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error_code:'MODULE_DISABLED'}),{status:403,headers:{'Content-Type':'application/json'}}));
  await act(async()=>{ await expect(api.exportAdvancedReportCsv({snapshot_id:'old'})).rejects.toMatchObject({code:'MODULE_DISABLED'}); });
  await waitFor(()=>expect(screen.getByTestId('context').textContent).toBe('1:1:admin/false'));
  expect(screen.queryByText('Job detail')).toBeNull();
});
