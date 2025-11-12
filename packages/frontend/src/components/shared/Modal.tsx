/* FILE: packages/frontend/src/components/shared/Modal.tsx */
import { type ReactNode } from 'react';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

interface ModalProps {
  id: string;
  title: string;
  iconKey: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'lg' | 'xl';
  show: boolean;
}

export const Modal = ({ id, title, iconKey, onClose, children, footer, size, show }: ModalProps) => {
  if (!show) {
    return null;
  }

  const modalContentClass = size ? `modal-content-${size}` : '';

  return (
    <div id={id} className="modal visible" role="dialog" aria-modal="true">
      <div id={`${id}-content`} className={`modal-content ${modalContentClass}`}>
        <div id={`${id}-header`} className="modal-header">
          <span ref={(el) => el && setIcon(el, iconKey)} className="material-icons header-icon"></span>
          <span id={`${id}-title`} className="header-title">{title}</span>
          <button id={`${id}-close-button`} onClick={onClose} className="btn btn-icon header-close-btn" title="Close">
            <span ref={(el) => el && setIcon(el, 'UI_CLOSE')}></span>
          </button>
        </div>
        
        {/* The hardcoded scrollable div has been removed. Children are rendered directly. */}
        {children}

        {footer && (
          <div id={`${id}-footer`} className="modal-actions">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};