import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import AppIcon from './AppIcon.jsx';
import Modal from './Modal.jsx';
import AttachmentPreviewModal from './AttachmentPreviewModal.jsx';

export default function MovementAttachmentsButton({ movement }) {
  const { t } = useTranslation();
  const count = Number(movement.attachment_count || movement.attachments_count || 0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [preview, setPreview] = useState(null);
  const requestId = useRef(0);
  const trigger = useRef(null);
  useEffect(() => () => { requestId.current += 1; }, []);

  const close = () => {
    requestId.current += 1;
    setOpen(false);
    setPreview(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const load = async () => {
    const current = ++requestId.current;
    setOpen(true);
    setLoading(true);
    setFiles([]);
    setError('');
    setDownloadError('');
    setPreview(null);
    try {
      const attachments = await api.getAttachments(movement.id);
      if (current !== requestId.current) return;
      setFiles(attachments);
      if (attachments.length === 1) setPreview(attachments[0]);
    } catch {
      if (current === requestId.current) setError(t('pages.movements.attachmentsLoadError'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  };

  const download = async attachment => {
    const current = requestId.current;
    setDownloadError('');
    try {
      const blob = await api.downloadAttachment(attachment.id);
      if (current !== requestId.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = attachment.original_name || attachment.file_name;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      if (current === requestId.current) setDownloadError(t('pages.movements.attachmentDownloadError'));
    }
  };

  if (count <= 0) return null;
  const label = t('pages.movements.openAttachments', { count });
  return <>
    <button ref={trigger} type="button" className="attachment-indicator" title={label}
      aria-label={`${label}: ${movement.description || t(`pages.movements.${movement.type}`)}`}
      onClick={event => { event.stopPropagation(); load(); }}>
      <AppIcon name="attachment" size={18} /><span>{count}</span>
    </button>
    <Modal isOpen={open} onClose={close} title={t('pages.movements.attachments')} className="movement-attachments-modal">
      <h2>{t('pages.movements.attachments')}</h2>
      <p className="muted">{movement.description || t(`pages.movements.${movement.type}`)}</p>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <div role="alert" className="error">{error} <button type="button" className="ghost" onClick={load}>{t('pages.movements.retryAttachments')}</button></div>}
      {!loading && !error && files.length === 0 && <p>{t('pages.movements.noAttachments')}</p>}
      {!loading && !error && <ul className="movement-attachments-list">
        {files.map(file => <li key={file.id}>
          <button type="button" className="ghost attachment-file-button" onClick={() => { setDownloadError(''); setPreview(file); }}>
            <AppIcon name="attachment" /><span>{file.original_name || file.file_name}</span>
          </button>
        </li>)}
      </ul>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={close}>{t('buttons.close')}</button></div>
    </Modal>
    <AttachmentPreviewModal isOpen={Boolean(preview)} attachment={preview}
      fetchPreviewBlob={attachment => api.downloadAttachment(attachment.id)} onDownload={download} downloadError={downloadError}
      onClose={() => { if (files.length === 1) close(); else setPreview(null); }} />
  </>;
}
