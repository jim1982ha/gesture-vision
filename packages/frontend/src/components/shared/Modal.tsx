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

  // Explicit mapping of size to Tailwind classes to ensure they are captured during the build
  const sizeClasses = {
    lg: 'w-full !max-w-4xl h-[90vh]',
    xl: 'w-full !max-w-6xl h-[95vh]',
  };
  
  // Default size if none specified
  const modalContentClass = size ? sizeClasses[size] : 'w-full max-w-lg max-h-[90vh]';

  return (
    <div id={id} className="modal visible" role="dialog" aria-modal="true">
      <div id={`${id}-content`} className={`modal-content ${modalContentClass}`}>
        <div id={`${id}-header`} className="modal-header">
          <span ref={(el) => el && setIcon(el, iconKey)} className="header-icon"></span>
          <span id={`${id}-title`} className="header-title">{title}</span>
          <button id={`${id}-close-button`} onClick={onClose} className="btn btn-icon header-close-btn" title="Close">
            <span ref={(el) => el && setIcon(el, 'UI_CLOSE')}></span>
          </button>
        </div>
        {/* Children are rendered directly in the flex column structure. */}
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