/* FILE: packages/frontend/src/components/shared/CardList.tsx */
import React from 'react';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';

interface CardListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  placeholder: React.ReactNode;
  className?: string;
  id?: string;
}

/**
 * A generic, reusable component for rendering a list of cards in a consistent grid layout.
 * It handles the common case of displaying a placeholder when the list is empty.
 */
export function CardList<T>({ items, renderItem, placeholder, className, id }: CardListProps<T>) {
  if (items.length === 0) {
    return <>{placeholder}</>;
  }

  return (
    <div id={id} className={clsx("grid grid-cols-1 gap-3 content-start", className)}>
      {items.map(renderItem)}
    </div>
  );
}