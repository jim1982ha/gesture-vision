/* FILE: packages/frontend/src/components/shared/Dropdown.tsx */
import React, { useState } from 'react';
import { useClickOutside } from '#frontend/hooks/useClickOutside.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';

interface DropdownProps {
  id: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  panelClassName?: string;
}

export const Dropdown = ({ id, trigger, children, panelClassName }: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false));

  const handleTriggerClick = () => {
    setIsOpen(prev => !prev);
  };

  // Clone the trigger element to attach the onClick handler
  const triggerWithHandler = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement, { onClick: handleTriggerClick })
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