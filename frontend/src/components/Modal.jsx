import { useEffect, useId, useRef } from 'react';

const modalStack = [];
let savedBodyOverflow = '';

const focusableElements = (root) => [...(root?.querySelectorAll(
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
) || [])].filter((element) => !element.closest('[aria-hidden="true"]'));

const Modal = ({ isOpen, onClose, children, className = '', title = 'Finestra di dialogo', closeOnOverlay = true, dismissible = true }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const titleId = useId();
  closeRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!isOpen) return undefined;
    const entry = { dialog: dialogRef, previousFocus: document.activeElement };
    modalStack.push(entry);
    if (modalStack.length === 1) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.slice(0, -1).forEach((item) => item.dialog.current?.setAttribute('aria-hidden', 'true'));
    requestAnimationFrame(() => (focusableElements(dialogRef.current)[0] || dialogRef.current)?.focus());

    const onKeyDown = (event) => {
      if (modalStack.at(-1) !== entry) return;
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableElements(dialogRef.current);
      if (!items.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = modalStack.indexOf(entry);
      if (index >= 0) modalStack.splice(index, 1);
      const top = modalStack.at(-1);
      top?.dialog.current?.removeAttribute('aria-hidden');
      if (!modalStack.length) document.body.style.overflow = savedBodyOverflow;
      entry.previousFocus?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget && closeOnOverlay && dismissible && modalStack.at(-1)?.dialog === dialogRef) onClose?.();
    }}>
      <div ref={dialogRef} tabIndex={-1} className={`modal-content ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span id={titleId} className="sr-only">{title}</span>
        {children}
      </div>
    </div>
  );
};

export default Modal;
