import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getIsSuperAdmin, getRole } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';

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
  const [csvFile, setCsvFile] = useState(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [csvError, setCsvError] = useState('');
  const logoInputRef = useRef(null);
  const iconInputRef = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [companySeedDefaults, setCompanySeedDefaults] = useState(true);
  const [companyMessage, setCompanyMessage] = useState('');
  const [companyError, setCompanyError] = useState('');
  const isSuperAdmin = getRole() === 'super_admin' || getIsSuperAdmin();

  const loadBranding = async () => {
    const data = await api.getBranding();
    setHasLogo(Boolean(data?.has_logo));
    setIconsMeta(data?.icons || null);

    if (data?.has_logo) {
      const blob = await api.downloadBrandLogo();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } else {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    }

    if (data?.icons?.variants?.favicon?.available) {
      const blob = await api.downloadBrandIcon('favicon');
      setFaviconPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } else {
      setFaviconPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    }

    if (data?.icons?.variants?.apple_touch_icon?.available) {
      const blob = await api.downloadBrandIcon('apple-touch-icon');
      setApplePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } else {
      setApplePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    }
  };

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => {
    faviconPreviewRef.current = faviconPreviewUrl;
  }, [faviconPreviewUrl]);
  useEffect(() => {
    applePreviewRef.current = applePreviewUrl;
  }, [applePreviewUrl]);

  useEffect(() => {
    loadBranding().catch((loadError) => setError(getErrorMessage(t, loadError)));
    loadCompanies().catch((loadError) => setCompanyError(getErrorMessage(t, loadError)));
    return () => {
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


  const handleImportCsv = async (event) => {
    event.preventDefault();
    setCsvError('');
    setCsvMessage('');

    if (!csvFile) {
      setCsvError(t('errors.NO_FILE'));
      return;
    }

    if (csvFile.size > maxMb * 1024 * 1024) {
      setCsvError(t('errors.FILE_TOO_LARGE', { maxMb }));
      return;
    }

    try {
      const result = await api.importMovementsCsv(csvFile);
      setCsvFile(null);
      setCsvMessage(t('pages.settings.importResult', { imported: result.imported || 0, skipped: result.skipped || 0 }));
    } catch (importError) {
      setCsvError(getErrorMessage(t, importError));
    }
  };


  const loadCompanies = async () => {
    if (!isSuperAdmin) return;
    const list = await api.getCompanies();
    setCompanies(list || []);
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

    const firstConfirm = window.confirm(t('pages.settings.confirmDeleteCompany1', { name: company.name }));
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(t('pages.settings.confirmDeleteCompany2', { name: company.name }));
    if (!secondConfirm) return;

    try {
      await api.deleteCompany(company.id);
      await loadCompanies();
      setCompanyMessage(t('pages.settings.companyDeleted', { name: company.name }));
    } catch (deleteError) {
      setCompanyError(getErrorMessage(t, deleteError));
    }
  };

  const handleDelete = async () => {
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
    <div className="page">
      <div className="page-header"><h1>{t('pages.settings.title')}</h1></div>
      <div className="card" style={{ maxWidth: 680 }}>
        <h2>{t('pages.settings.branding')}</h2>
        <p className="muted">{t('pages.settings.logoHint')}</p>

        {previewUrl ? (
          <img src={previewUrl} alt="Logo" className="brand-logo-preview" />
        ) : (
          <div className="muted">{t('common.none')}</div>
        )}

        <form onSubmit={handleUpload}>
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
              <button type="button" className="danger" onClick={handleDelete} disabled={brandingLoading}>
                {t('pages.settings.removeLogo')}
              </button>
            )}
          </div>
        </form>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
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
        <div className="muted">
          {t('pages.settings.currentSourceFile')}: <strong>{iconsMeta?.source_file_name || t('pages.settings.noneSourceFile')}</strong>
        </div>
        <ul className="muted">
          <li>favicon: {iconsMeta?.variants?.favicon?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantDefaultFallback')}</li>
          <li>apple-touch-icon: {iconsMeta?.variants?.apple_touch_icon?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantDefaultFallback')}</li>
          <li>192x192: {iconsMeta?.variants?.icon_192?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantLogicalFallback')}</li>
          <li>512x512: {iconsMeta?.variants?.icon_512?.mode === 'file' ? t('pages.settings.variantRealFile') : t('pages.settings.variantLogicalFallback')}</li>
        </ul>
        <form onSubmit={handleIconUpload}>
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
            <button type="button" className={iconsMeta?.has_custom ? 'danger' : ''} onClick={handleIconReset} disabled={iconsLoading || !iconsMeta?.has_custom}>
              {t('pages.settings.restoreDefaultIcons')}
            </button>
          </div>
        </form>
        {iconMessage && <div className="success">{iconMessage}</div>}
        {iconError && <div className="error">{iconError}</div>}
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: '1rem' }}>
        <h2>{t('pages.settings.importMovements')}</h2>
        <p className="muted">{t('pages.settings.importHint')}</p>
        <form onSubmit={handleImportCsv}>
          <label>
            CSV
            <input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} />
          </label>
          <div className="row-actions">
            <button type="submit">{t('pages.settings.importButton')}</button>
          </div>
        </form>
        {csvMessage && <div className="success">{csvMessage}</div>}
        {csvError && <div className="error">{csvError}</div>}
      </div>


      {isSuperAdmin && (
        <div className="card" style={{ maxWidth: 680, marginTop: '1rem' }}>
          <h2>{t('pages.settings.companiesTitle')}</h2>
          <form onSubmit={handleCreateCompany}>
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

          {companyMessage && <div className="success">{companyMessage}</div>}
          {companyError && <div className="error">{companyError}</div>}

          <ul className="list" style={{ marginTop: '0.75rem' }}>
            {companies.map((company) => (
              <li key={company.id} className="list-item-row">
                <div>
                  <strong>{company.name}</strong>
                  <div className="muted">#{company.id}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="danger" onClick={() => handleDeleteCompany(company)}>
                    {t('buttons.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

export default SettingsAdminPage;
