import { memo, useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { colorValue } from '@/features/pickers/colors';
import type { Note } from '@/domain/types';
import { t } from '@/i18n';
import type { LayoutNode } from './layout';

export interface CanvasNodeProps {
  node: LayoutNode;
  note: Note;
  selected: boolean;
  /** Roving tabindex: só o nó de foco entra na ordem de tabulação. */
  tabStop: boolean;
  renaming: boolean;
  /** Zoom baixo: rótulo/badge ocultos (tooltip mostra o resto). */
  simplified: boolean;
  touchDragging: boolean;
  touchDropTarget: boolean;
  onSelect: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, title: string) => void;
  onCancelRename: () => void;
  /** Enter no rename. */
  onRenameConfirm: (id: string, title: string) => void;
  /** Tab no rename: confirma e cria filho. */
  onRenameConfirmCreateChild: (id: string, title: string) => void;
  onCreateChild: (id: string) => void;
  onContextMenu: (id: string, event: React.MouseEvent) => void;
  onDropOnNode: (sourceId: string, targetId: string, position: 'inside' | 'before' | 'after') => void;
}

function hasContent(note: Note): boolean {
  return note.contentText.trim().length > 0;
}

/**
 * Nó da árvore: posicionado por transform (world), estados completos da §5.3,
 * ARIA `treeitem` e renomear inline (Enter/Esc/Tab).
 */
export const CanvasNode = memo(function CanvasNode({
  node,
  note,
  selected,
  tabStop,
  renaming,
  simplified,
  touchDragging,
  touchDropTarget,
  onSelect,
  onOpen,
  onToggle,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRenameConfirm,
  onRenameConfirmCreateChild,
  onCreateChild,
  onContextMenu,
  onDropOnNode,
}: CanvasNodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = note.title.trim().length > 0 ? note.title : t('common.semTitulo');
  const emptyTitle = note.title.trim().length === 0;
  const accent = colorValue(note.color);
  const committed = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);

  useEffect(() => {
    if (renaming) {
      committed.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  function commit(value: string) {
    if (committed.current) return;
    committed.current = true;
    onCommitRename(node.id, value);
  }

  return (
    <div
      role="treeitem"
      data-node-id={node.id}
      aria-level={node.depth + 1}
      aria-setsize={node.setsize}
      aria-posinset={node.posinset}
      aria-selected={selected}
      aria-expanded={node.hasChildren ? node.expanded : undefined}
      aria-label={label}
      tabIndex={tabStop && !renaming ? 0 : -1}
      title={label}
      className={`group absolute flex cursor-grab items-center gap-2 rounded-[var(--radius-lg)] border pr-3.5 shadow-[var(--shadow-sm)] backdrop-blur-xl transition-[transform,border-color,background-color,box-shadow] duration-[var(--dur)] ease-[var(--ease)] select-none hover:-translate-y-0.5 hover:shadow-[var(--shadow)] active:scale-[0.99] ${
        node.hasChildren ? 'border-border' : 'border-dashed border-border'
      } ${
        selected
          ? 'z-10 border-accent bg-material-strong text-text shadow-[var(--glow-shadow)]'
          : 'bg-material-strong text-text hover:border-border-strong'
      } ${renaming ? 'z-20 cursor-default' : ''} ${dragging || touchDragging ? 'cursor-grabbing opacity-60' : ''} ${dropTarget || touchDropTarget ? 'border-dashed border-accent ring-2 ring-accent/30' : ''}`}
      draggable={!renaming}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: node.width,
        height: node.height,
        ...(accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined),
      }}
      onClick={(event) => {
        if (renaming) return;
        event.stopPropagation();
        onSelect(node.id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onOpen(node.id);
      }}
      onDoubleClick={(event) => {
        if (renaming) return;
        event.stopPropagation();
        onStartRename(node.id);
      }}
      onContextMenu={(event) => {
        if (renaming) return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(node.id, event);
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-novamente-note', node.id);
        event.dataTransfer.setData('text/plain', node.id);
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
        setDropTarget(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(false);
        const sourceId = event.dataTransfer.getData('application/x-novamente-note') || event.dataTransfer.getData('text/plain');
        if (sourceId && sourceId !== node.id) {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeY = (event.clientY - rect.top) / Math.max(rect.height, 1);
          const position = relativeY < 0.25 ? 'before' : relativeY > 0.75 ? 'after' : 'inside';
          onDropOnNode(sourceId, node.id, position);
        }
      }}
    >
      {node.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={node.expanded ? t('node.recolherRamo') : t('node.expandirRamo')}
          title={node.expanded ? t('node.recolherRamo') : t('node.expandirRamo')}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
          className="-ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-bg-hover hover:text-text"
        >
          <Icon name={node.expanded ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
      ) : (
        <span aria-hidden="true" className="w-4 shrink-0" />
      )}

      <Icon
        name={note.icon}
        size={14}
        className={`shrink-0 ${selected ? 'text-accent' : 'text-muted'}`}
      />

      {hasContent(note) ? (
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-accent shadow-[0_0_10px_var(--glow)]' : 'bg-faint'}`}
        />
      ) : null}

      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={note.title}
          aria-label={t('node.placeholderNome')}
          className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-accent bg-bg-app px-1.5 text-sm text-text outline-none"
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (event.relatedTarget instanceof HTMLButtonElement) return;
            commit(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              const value = event.currentTarget.value;
              onRenameConfirm(node.id, value);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancelRename();
              return;
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              const value = event.currentTarget.value;
              onRenameConfirmCreateChild(node.id, value);
            }
          }}
        />
      ) : (
        <span
          data-node-label
          className={`min-w-0 flex-1 truncate text-[length:var(--node-font-size)] leading-none font-medium ${
            emptyTitle ? 'italic opacity-70' : ''
          } ${simplified ? 'invisible' : ''}`}
        >
          {label}
        </span>
      )}

      {node.hasChildren && !node.expanded ? (
        <span
          data-node-badge
          aria-hidden="true"
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
            selected ? 'bg-accent-soft text-accent' : 'bg-bg-hover text-muted'
          } ${simplified ? 'invisible' : ''}`}
        >
          {node.childCount}
        </span>
      ) : null}

      {!renaming ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('node.adicionarFilho', { nome: label })}
          title={t('node.novoFilho')}
          onClick={(event) => {
            event.stopPropagation();
            onCreateChild(node.id);
          }}
          className={`absolute top-1/2 -right-7 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg-raised text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-accent hover:text-accent focus-visible:opacity-100 ${
            selected ? 'opacity-100' : ''
          }`}
        >
          <Icon name="plus" size={12} />
        </button>
      ) : null}
    </div>
  );
});
