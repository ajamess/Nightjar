import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Thin wrapper that makes a Kanban card sortable via @dnd-kit.
 * Renders the card with transform/transition from useSortable
 * and applies drag listeners (disabled when editing).
 */
const SortableKanbanCard = React.memo(function SortableKanbanCard({
  card,
  columnId,
  disabled,
  onKeyDown,
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
    id: card.id,
    data: { type: 'card', card, columnId },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(card.color ? { borderLeftColor: card.color } : {}),
      }}
      tabIndex={0}
      role="listitem"
      aria-label={`Card: ${card.title}${card.description ? '. ' + card.description.substring(0, 50) : ''}`}
      onKeyDown={onKeyDown}
      {...attributes}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  );
});

export default SortableKanbanCard;
