/* FILE: packages/frontend/src/components/shared/cards/Card.tsx */
import React, { type ReactNode, type HTMLAttributes, forwardRef } from 'react';
import { clsx, setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import type { GestureCategoryIconType } from '#shared/index.js';

type CardRootProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
} & HTMLAttributes<HTMLDivElement>;

export const CardRoot = forwardRef<HTMLDivElement, CardRootProps>(({ children, className, onClick, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx('card-item', onClick && 'card-item-clickable', className)}
    onClick={onClick}
    {...props}
  >
    {children}
  </div>
));
CardRoot.displayName = 'CardRoot';

export const CardHeader = ({ children, className, id }: { children: ReactNode, className?: string, id: string }) => (
  <div id={id} className={clsx('card-header', className)}>{children}</div>
);

export const CardIcon = ({ iconKey, id }: { iconKey: GestureCategoryIconType | string, id: string }) => (
  <span id={id} ref={el => el && setIcon(el, iconKey)} className="card-icon"></span>
);

export const CardTitle = ({ children, id }: { children: ReactNode, id: string }) => <span id={id} className="card-title">{children}</span>;

export const CardActions = ({ children, id }: { children: ReactNode, id: string }) => <div id={id} className="card-item-actions">{children}</div>;

export const CardDetails = ({ children, id }: { children: ReactNode, id: string }) => <div id={id} className="card-details">{children}</div>;

export const CardDetailLine = ({ iconKey, children, id }: { iconKey?: GestureCategoryIconType | string, children: ReactNode, id: string }) => (
  <div id={id} className="card-detail-line">
    {iconKey && <span ref={el => el && setIcon(el, iconKey)} className="card-detail-icon"></span>}
    <div id={`${id}-value-wrapper`} className="card-detail-value truncate">
        {children}
    </div>
  </div>
);

export const CardFooter = ({ leftContent, rightContent, id }: { leftContent?: ReactNode, rightContent?: ReactNode, id: string }) => (
  <div id={id} className="card-footer">
    <div className="flex items-center gap-1 min-w-0">
      {leftContent}
    </div>
    {rightContent && (
      <div className="footer-pills-wrapper">
        {rightContent}
      </div>
    )}
  </div>
);