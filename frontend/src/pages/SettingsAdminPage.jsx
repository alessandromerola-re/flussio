import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getIsSuperAdmin, getRole } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';

const maxMb = 20;
const faviconAcceptedTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml'];

const SettingsAdminPage = ({ onBrandingChanged }) => {
  const { t } = useTranslation();
  const [hasLogo, setHasLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const previewUrlRef = useRef('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [hasFavicon, setHasFavicon] = useState(false);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState('');
  const faviconPreviewUrlRef = useRef('');
  const [selectedFaviconFile, setSelectedFaviconFile] = useState(null);
  const [faviconName, setFaviconName] = useState('');
  const [faviconMessage, setFaviconMessage] = useState('');
  const [faviconError, setFaviconError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [csvError, setCsvError] = useState('');
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [companySeedDefaults, setCompanySeedDefaults] = useState(true);
  const [companyMessage, setCompanyMessage] = useState('');
  const [companyError, setCompanyError] = useState('');
  const isSuperAdmin = getRole() === 'super_admin' || getIsSuperAdmin();

  const loadBranding = async () => {
    const data = await api.getBranding();
    setHasLogo(Boolean(data?.has_logo));
    setHasFavicon(Boolean(data?.has_favicon));
    setFaviconName(data?.favicon_file_name || '');

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

    if (data?.has_favicon) {
      const blob = await api.downloadBrandFavicon();
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
  };

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    faviconPreviewUrlRef.current = faviconPreviewUrl;
  }, [faviconPreviewUrl]);

  useEffect(() => {
    loadBranding().catch((loadError) => setError(getErrorMessage(t, loadError)));
    loadCompanies().catch((loadError) => setCompanyError(getErrorMessage(t, loadError)));
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (faviconPreviewUrlRef.current) URL.revokeObjectURL(faviconPreviewUrlRef.current);
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

  const handleUploadFavicon = async (event) => {
    event.preventDefault();
    setFaviconError('');
    setFaviconMessage('');

    if (!selectedFaviconFile) {
      setFaviconError(t('errors.NO_FILE'));
      return;
    }

    if (selectedFaviconFile.size > maxMb * 1024 * 1024) {
      setFaviconError(t('errors.FILE_TOO_LARGE', { maxMb }));
      return;
    }

    if (!faviconAcceptedTypes.includes(selectedFaviconFile.type)) {
      setFaviconError(t('pages.settings.faviconValidation'));
      return;
    }

    setBrandingLoading(true);
    try {
      await api.uploadBrandFavicon(selectedFaviconFile);
      await loadBranding();
      setSelectedFaviconFile(null);
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
      setFaviconMessage(t('pages.settings.faviconSaved'));
      onBrandingChanged?.();
    } catch (uploadError) {
      setFaviconError(getErrorMessage(t, uploadError));
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleDeleteFavicon = async () => {
    setFaviconError('');
    setFaviconMessage('');
    setBrandingLoading(true);
    try {
      await api.deleteBrandFavicon();
      await loadBranding();
      setSelectedFaviconFile(null);
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
      setFaviconMessage(t('pages.settings.faviconDeleted'));
      onBrandingChanged?.();
    } catch (deleteError) {
      setFaviconError(getErrorMessage(t, deleteError));
    } finally {
      setBrandingLoading(false);
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

  return (
    <div className="page">
      <div className="page-header"><h1>{t('pages.settings.title')}</h1></div>
      <div className="card" style={{ maxWidth: 680 }}>
        <h2>{t('pages.settings.branding')}</h2>
        <p className="muted">{t('pages.settings.logoUsage')}</p>
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

        <hr />
        <h3>{t('pages.settings.faviconTitle')}</h3>
        <p className="muted">{t('pages.settings.faviconUsage')}</p>
        <p className="muted">{t('pages.settings.faviconHint')}</p>

        <div className="favicon-preview-row">
          {faviconPreviewUrl ? (
            <img src={faviconPreviewUrl} alt="Favicon" className="favicon-preview" />
          ) : (
            <img src="/favicon.svg" alt="Favicon di default" className="favicon-preview" />
          )}
          <div className="muted">
            {faviconName || t('pages.settings.faviconDefaultState')}
          </div>
        </div>

        <form onSubmit={handleUploadFavicon}>
          <label>
            Favicon
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico,.png,.svg"
              onChange={(event) => setSelectedFaviconFile(event.target.files?.[0] || null)}
            />
          </label>
          <div className="row-actions">
            <button type="submit" disabled={!selectedFaviconFile || brandingLoading}>
              {brandingLoading ? t('common.loading') : hasFavicon ? t('pages.settings.replaceFavicon') : t('pages.settings.uploadFavicon')}
            </button>
            {hasFavicon && (
              <button type="button" className="danger" onClick={handleDeleteFavicon} disabled={brandingLoading}>
                {t('pages.settings.removeFavicon')}
              </button>
            )}
          </div>
        </form>

        {faviconMessage && <div className="success">{faviconMessage}</div>}
        {faviconError && <div className="error">{faviconError}</div>}
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
