import { useEffect, useId, useRef } from 'react';

const Modal = ({ isOpen, onClose, children, className = '', title = 'Finestra di dialogo', closeOnOverlay = true, dismissible = true }) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
    requestAnimationFrame(() => (focusable()[0] || dialogRef.current)?.focus());

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        onCloseRef.current();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen, dismissible]);

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={closeOnOverlay && dismissible ? () => onCloseRef.current() : undefined}>
      <div ref={dialogRef} tabIndex={-1} className={`modal-content ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <span id={titleId} className="sr-only">{title}</span>
        {children}
      </div>
    </div>
  );
};

export default Modal;
