import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const AttachmentPreviewModal = ({ isOpen, onClose, attachment, fetchPreviewBlob, onDownload }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const mimeType = attachment?.mime_type || '';
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const previewAvailable = isImage || isPdf;

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const load = async () => {
      if (!isOpen || !attachment || !previewAvailable) {
        setPreviewUrl('');
        setError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const blob = await fetchPreviewBlob(attachment);
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (previewError) {
        if (!cancelled) {
          setError(t('pages.movements.previewLoadError'));
          setPreviewUrl('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isOpen, attachment?.id]);

  if (!isOpen || !attachment) {
    return null;
  }

  return (
    <div className="modal">
      <div className="modal-content preview-modal-content">
        <h2>{t('pages.movements.attachmentPreview')}</h2>
        <p className="muted">{attachment.original_name || attachment.file_name}</p>

        {loading && <div className="muted">{t('common.loading')}</div>}

        {!loading && error && <div className="error">{error}</div>}

        {!loading && !error && previewAvailable && previewUrl && isImage && (
          <img className="attachment-preview-image" src={previewUrl} alt={attachment.original_name || attachment.file_name} />
        )}

        {!loading && !error && previewAvailable && previewUrl && isPdf && (
          <iframe className="attachment-preview-frame" title="PDF preview" src={previewUrl} />
        )}

        {!loading && !previewAvailable && (
          <div className="muted">{t('pages.movements.previewNotAvailable')}</div>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={() => onDownload(attachment)}>
            {t('buttons.download')}
          </button>
          <button type="button" onClick={onClose}>{t('buttons.close')}</button>
        </div>
      </div>
    </div>
  );
};

export default AttachmentPreviewModal;
