import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getRole } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';

const maxMb = 20;

const SettingsAdminPage = ({ onBrandingChanged }) => {
  const { t } = useTranslation();
  const [hasLogo, setHasLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [csvError, setCsvError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [companySeedDefaults, setCompanySeedDefaults] = useState(true);
  const [companyMessage, setCompanyMessage] = useState('');
  const [companyError, setCompanyError] = useState('');
  const isSuperAdmin = getRole() === 'super_admin';

  const loadBranding = async () => {
    const data = await api.getBranding();
    setHasLogo(Boolean(data?.has_logo));

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
  };

  useEffect(() => {
    loadBranding().catch((loadError) => setError(getErrorMessage(t, loadError)));
    loadCompanies().catch((loadError) => setCompanyError(getErrorMessage(t, loadError)));
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
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

    try {
      await api.uploadBrandLogo(selectedFile);
      await loadBranding();
      setSelectedFile(null);
      setMessage(t('pages.settings.saved'));
      onBrandingChanged?.();
    } catch (uploadError) {
      setError(getErrorMessage(t, uploadError));
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

  const handleDelete = async () => {
    setError('');
    setMessage('');
    try {
      await api.deleteBrandLogo();
      await loadBranding();
      setMessage(t('pages.settings.deleted'));
      onBrandingChanged?.();
    } catch (deleteError) {
      setError(getErrorMessage(t, deleteError));
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
            <input type="file" accept="image/png,image/jpeg,image/webp,image/*" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
          </label>
          <div className="row-actions">
            <button type="submit">{t('pages.settings.uploadLogo')}</button>
            {hasLogo && <button type="button" className="danger" onClick={handleDelete}>{t('pages.settings.removeLogo')}</button>}
          </div>
        </form>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
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
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

export default SettingsAdminPage;
