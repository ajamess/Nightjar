import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Thin wrapper that makes a Kanban column sortable via @dnd-kit.
 * Uses render-prop children: children(dragListeners) so the header
 * can be used as the drag handle while the column body remains
 * scrollable for cards.
 */
const SortableKanbanColumn = React.memo(function SortableKanbanColumn({
  column,
  disabled,
  children,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `col-${column.id}`,
    data: { type: 'column', column },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isDragging ? 'kanban-column--dragging' : ''}`}
      style={{
        '--column-color': column.color,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      role="region"
      aria-labelledby={`column-header-${column.id}`}
      data-testid={`kanban-column-${(column.name || '').toLowerCase().replace(/\s+/g, '-')}`}
      {...attributes}
    >
      {typeof children === 'function' ? children(listeners) : children}
    </div>
  );
});

export default SortableKanbanColumn;
