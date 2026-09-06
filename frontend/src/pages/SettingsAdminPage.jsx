import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, getIsSuperAdmin, getRole } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import Modal from '../components/Modal.jsx';

const maxMb = 20;

const SettingsAdminPage = ({ onBrandingChanged }) => {
  const { t } = useTranslation();
  const [hasLogo, setHasLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const previewUrlRef = useRef('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedIconFile, setSelectedIconFile] = useState(null);
  const [message, setMessage] = useState('');
  const [iconMessage, setIconMessage] = useState('');
  const [error, setError] = useState('');
  const [iconError, setIconError] = useState('');
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [iconsMeta, setIconsMeta] = useState(null);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState('');
  const [applePreviewUrl, setApplePreviewUrl] = useState('');
  const faviconPreviewRef = useRef('');
  const applePreviewRef = useRef('');
  const logoInputRef = useRef(null);
  const iconInputRef = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [companySeedDefaults, setCompanySeedDefaults] = useState(true);
  const [companyMessage, setCompanyMessage] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const actionLock = useRef(false);
  const loadGeneration = useRef(0);
  const lifecycle = useRef(0);
  const mounted = useRef(false);
  const [deletingCompany, setDeletingCompany] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const isSuperAdmin = getRole() === 'super_admin' || getIsSuperAdmin();

  const loadBranding = async () => {
    if (!mounted.current) return;
    const current = ++loadGeneration.current;
    const data = await api.getBranding();
    if (current !== loadGeneration.current) return;
    const [logo, favicon, apple] = await Promise.all([
      data?.has_logo ? api.downloadBrandLogo() : null,
      data?.icons?.variants?.favicon?.available ? api.downloadBrandIcon('favicon') : null,
      data?.icons?.variants?.apple_touch_icon?.available ? api.downloadBrandIcon('apple-touch-icon') : null,
    ]);
    if (current !== loadGeneration.current) return;
    setHasLogo(Boolean(data?.has_logo));
    setIconsMeta(data?.icons || null);
    for (const [blob, ref, setter] of [[logo, previewUrlRef, setPreviewUrl], [favicon, faviconPreviewRef, setFaviconPreviewUrl], [apple, applePreviewRef, setApplePreviewUrl]]) {
      if (ref.current) URL.revokeObjectURL(ref.current);
      ref.current = blob ? URL.createObjectURL(blob) : '';
      setter(ref.current);
    }
  };

  const loadAll = async () => {
    const current = lifecycle.current;
    setLoading(true);
    setError(''); setCompanyError('');
    await Promise.all([
      loadBranding().catch((loadError) => { if (current === lifecycle.current) setError(getErrorMessage(t, loadError)); }),
      loadCompanies().catch((loadError) => { if (current === lifecycle.current) setCompanyError(getErrorMessage(t, loadError)); }),
    ]);
    if (current === lifecycle.current) setLoading(false);
  };

  const runAction = async (action) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { await action(); }
    finally { actionLock.current = false; setBusy(false); }
  };

  useEffect(() => {
    mounted.current = true;
    loadAll();
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      loadGeneration.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (faviconPreviewRef.current) URL.revokeObjectURL(faviconPreviewRef.current);
      if (applePreviewRef.current) URL.revokeObjectURL(applePreviewRef.current);
    };
  }, []);

  const handleUpload = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!selectedFile) {
      setError(t('errors.NO_FILE'));
      return;
    }

    if (selectedFile.size > maxMb * 1024 * 1024) {
      setError(t('errors.FILE_TOO_LARGE', { maxMb }));
      return;
    }

    setBrandingLoading(true);
    try {
      await api.uploadBrandLogo(selectedFile);
      await loadBranding();
      setSelectedFile(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      setMessage(t('pages.settings.saved'));
      onBrandingChanged?.();
    } catch (uploadError) {
      setError(getErrorMessage(t, uploadError));
    } finally {
      setBrandingLoading(false);
    }
  };


  const loadCompanies = async () => {
    if (!mounted.current || !isSuperAdmin) return;
    const current = lifecycle.current;
    const list = await api.getCompanies();
    if (current === lifecycle.current) setCompanies(list || []);
  };

  const handleCreateCompany = async (event) => {
    event.preventDefault();
    setCompanyError('');
    setCompanyMessage('');
    if (!companyName.trim()) {
      setCompanyError(t('errors.VALIDATION_MISSING_FIELDS'));
      return;
    }

    try {
      await api.createCompany({ name: companyName.trim(), seed_defaults: companySeedDefaults });
      setCompanyName('');
      await loadCompanies();
      setCompanyMessage(t('pages.settings.companyCreated')); 
    } catch (createError) {
      setCompanyError(getErrorMessage(t, createError));
    }
  };


  const handleDeleteCompany = async (company) => {
    setCompanyError('');
    setCompanyMessage('');

    if (deleteName !== company.name) return;

    try {
      await api.deleteCompany(company.id);
      setDeletingCompany(null); setDeleteName('');
      await loadCompanies();
      setCompanyMessage(t('pages.settings.companyDeleted', { name: company.name }));
    } catch (deleteError) {
      setCompanyError(getErrorMessage(t, deleteError));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('adminUx.removeLogoConfirm'))) return;
    setError('');
    setMessage('');
    setBrandingLoading(true);
    try {
      await api.deleteBrandLogo();
      await loadBranding();
      setSelectedFile(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      setMessage(t('pages.settings.deleted'));
      onBrandingChanged?.();
    } catch (deleteError) {
      setError(getErrorMessage(t, deleteError));
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleIconUpload = async (event) => {
    event.preventDefault();
    setIconError('');
    setIconMessage('');
    if (!selectedIconFile) {
      setIconError(t('errors.NO_FILE'));
      return;
    }
    if (selectedIconFile.size > maxMb * 1024 * 1024) {
      setIconError(t('errors.FILE_TOO_LARGE', { maxMb }));
      return;
    }

    setIconsLoading(true);
    try {
      await api.uploadBrandIcons(selectedIconFile);
      await loadBranding();
      setSelectedIconFile(null);
      if (iconInputRef.current) iconInputRef.current.value = '';
      setIconMessage(t('pages.settings.iconSaved'));
      onBrandingChanged?.();
    } catch (uploadError) {
      setIconError(getErrorMessage(t, uploadError));
    } finally {
      setIconsLoading(false);
    }
  };

  const handleIconReset = async () => {
    if (!window.confirm(t('adminUx.resetIconsConfirm'))) return;
    setIconError('');
    setIconMessage('');
    setIconsLoading(true);
    try {
      await api.deleteBrandIcons();
      await loadBranding();
      setSelectedIconFile(null);
      if (iconInputRef.current) iconInputRef.current.value = '';
      setIconMessage(t('pages.settings.iconReset'));
      onBrandingChanged?.();
    } catch (deleteError) {
      setIconError(getErrorMessage(t, deleteError));
    } finally {
      setIconsLoading(false);
    }
  };

  return (
    <div className="page settings-page">
      <div className="page-header"><h1>{t('pages.settings.title')}</h1></div>
      {loading && <p role="status">{t('common.loading')}</p>}
      {(error || companyError) && <button type="button" onClick={loadAll} disabled={busy || loading}>{t('buttons.retry')}</button>}
      <fieldset className="admin-fieldset" disabled={busy || loading}>
      <div className="card" style={{ maxWidth: 680 }}>
        <h2>{t('pages.settings.branding')}</h2>
        <p className="muted">{t('pages.settings.logoHint')}</p>

        {previewUrl ? (
          <img src={previewUrl} alt="Logo" className="brand-logo-preview" />
        ) : (
          <div className="muted">{t('common.none')}</div>
        )}

        <form onSubmit={(event) => { event.preventDefault(); runAction(() => handleUpload(event)); }}>
          <label>
            Logo
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>
          <div className="row-actions">
            <button type="submit" disabled={!selectedFile || brandingLoading}>
              {brandingLoading ? t('common.loading') : t('pages.settings.uploadLogo')}
            </button>
            {hasLogo && (
              <button type="button" className="danger" onClick={() => runAction(handleDelete)} disabled={brandingLoading}>
                {t('pages.settings.removeLogo')}
              </button>
            )}
          </div>
        </form>

        {message && <div className="success" role="status">{message}</div>}
        {error && <div className="error" role="alert">{error}</div>}
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: '1rem' }}>
        <h2>{t('pages.settings.faviconSectionTitle')}</h2>
        <p className="muted">{t('pages.settings.faviconHint')}</p>
        <div className="icon-preview-grid">
          <div>
            <div className="muted">{t('pages.settings.browserFavicon')}</div>
            {faviconPreviewUrl ? <img src={faviconPreviewUrl} alt="Favicon" className="icon-preview icon-preview--small" /> : <div className="muted">{t('pages.settings.defaultActive')}</div>}
          </div>
          <div>
            <div className="muted">{t('pages.settings.appleTouchIcon')}</div>
            {applePreviewUrl ? <img src={applePreviewUrl} alt="Apple touch icon" className="icon-preview icon-preview--large" /> : <div className="muted">{t('pages.settings.defaultActive')}</div>}
          </div>
        </div>
        <div className="muted">
          {t('pages.settings.iconStatus', { status: iconsMeta?.has_custom ? t('pages.settings.custom') : t('pages.settings.defaultLabel') })}
        </div>
        <details className="admin-advanced"><summary>{t('adminUx.advanced')}</summary>
        <div className="muted">
          {t('pages.settings.currentSourceFile')}: <strong>{iconsMeta?.source_file_name || t('pages.settings.noneSourceFile')}</strong>
        </div>
        <ul className="muted">
          <li>favicon: {iconsMeta?.variants?.favicon?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantDefaultFallback')}</li>
          <li>apple-touch-icon: {iconsMeta?.variants?.apple_touch_icon?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantDefaultFallback')}</li>
          <li>192x192: {iconsMeta?.variants?.icon_192?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantLogicalFallback')}</li>
          <li>512x512: {iconsMeta?.variants?.icon_512?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantLogicalFallback')}</li>
        </ul>
        </details>
        <form onSubmit={(event) => { event.preventDefault(); runAction(() => handleIconUpload(event)); }}>
          <label>
            {t('pages.settings.iconFile')}
            <input
              ref={iconInputRef}
              type="file"
              accept="image/png,image/x-icon,.png,.ico"
              onChange={(event) => setSelectedIconFile(event.target.files?.[0] || null)}
            />
          </label>
          <div className="row-actions">
            <button type="submit" disabled={!selectedIconFile || iconsLoading}>
              {iconsLoading ? t('common.loading') : iconsMeta?.has_custom ? t('pages.settings.replaceIcons') : t('pages.settings.uploadIcons')}
            </button>
            <button type="button" className={iconsMeta?.has_custom ? 'danger' : ''} onClick={() => runAction(handleIconReset)} disabled={iconsLoading || !iconsMeta?.has_custom}>
              {t('pages.settings.restoreDefaultIcons')}
            </button>
          </div>
        </form>
        {iconMessage && <div className="success" role="status">{iconMessage}</div>}
        {iconError && <div className="error" role="alert">{iconError}</div>}
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: '1rem' }}>
        <h2>{t('pages.settings.importMovements')}</h2>
        <p className="muted">{t('adminUx.importHint')}</p>
        <Link className="button ghost" to="/movements">{t('nav.movements')}</Link>
      </div>


      {isSuperAdmin && (
        <div className="card" style={{ maxWidth: 680, marginTop: '1rem' }}>
          <h2>{t('pages.settings.companiesTitle')}</h2>
          <p className="muted">{t('adminUx.companiesHint')}</p>
          <form onSubmit={(event) => { event.preventDefault(); runAction(() => handleCreateCompany(event)); }}>
            <label>
              {t('pages.settings.companyName')}
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label className="checkbox-row" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={companySeedDefaults}
                onChange={(event) => setCompanySeedDefaults(event.target.checked)}
              />
              {t('pages.settings.seedDefaults')}
            </label>
            <div className="row-actions">
              <button type="submit">{t('pages.settings.createCompany')}</button>
            </div>
          </form>

          {companyMessage && <div className="success" role="status">{companyMessage}</div>}
          {companyError && !deletingCompany && <div className="error" role="alert">{companyError}</div>}

          <ul className="list" style={{ marginTop: '0.75rem' }}>
            {companies.map((company) => (
              <li key={company.id} className="list-item-row">
                <div>
                  <strong>{company.name}</strong>
                  <div className="muted">#{company.id}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="danger" onClick={() => { setCompanyError(''); setDeletingCompany(company); setDeleteName(''); }}>
                    {t('buttons.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      </fieldset>
      <Modal isOpen={Boolean(deletingCompany)} dismissible={!busy} onClose={() => { setDeletingCompany(null); setDeleteName(''); }} title={t('buttons.delete')}>
        {deletingCompany && <form onSubmit={(event) => { event.preventDefault(); runAction(() => handleDeleteCompany(deletingCompany)); }}>
          <h2>{t('buttons.delete')}: {deletingCompany.name}</h2>
          <p className="warning">{t('adminUx.deleteCompanyWarning')}</p>
          <label>{t('adminUx.typeCompanyName')}
            <input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" disabled={busy} />
          </label>
          {companyError && <div className="error" role="alert">{companyError}</div>}
          <div className="modal-actions">
            <button type="submit" className="danger" disabled={busy || deleteName !== deletingCompany.name}>{t('buttons.delete')}</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => { setDeletingCompany(null); setDeleteName(''); }}>{t('buttons.close')}</button>
          </div>
        </form>}
      </Modal>
    </div>
  );
};

export default SettingsAdminPage;
