/* FILE: packages/frontend/src/components/shared/Dropdown.tsx */
import { useState, isValidElement, cloneElement, type ReactNode } from 'react';
import { useClickOutside } from '#frontend/hooks/useClickOutside.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';

interface DropdownProps {
  id: string;
  trigger: ReactNode;
  children: ReactNode;
  panelClassName?: string;
}

export const Dropdown = ({ id, trigger, children, panelClassName }: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false));

  const handleTriggerClick = () => {
    setIsOpen(prev => !prev);
  };

  const triggerWithHandler = isValidElement(trigger)
    ? cloneElement(trigger, { onClick: handleTriggerClick })
    : trigger;

  return (
    <div id={`${id}-container`} className="relative inline-flex" ref={wrapperRef}>
      {triggerWithHandler}
      <div
        id={`${id}-panel`}
        className={clsx('header-dropdown-panel', isOpen && 'visible', panelClassName)}
        role="menu"
        onClick={() => setIsOpen(false)} // Close when an item is clicked
      >
        {children}
      </div>
    </div>
  );
};