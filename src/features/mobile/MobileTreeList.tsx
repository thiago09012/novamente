import { useMemo } from 'react';

import { Icon } from '@/components/ui/Icon';
import { isAlive } from '@/domain/tree';
import type { ID, Note } from '@/domain/types';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';
import { selectViewById, useViewStore } from '@/store/viewStore';

interface MobileTreeListProps {
  rootId: ID | null;
  onOpenNote: (id: ID) => void;
}

interface TreeRow {
  note: Note;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

/** Navegação hierárquica por toque para a visão mobile retrato. */
export function MobileTreeList({ rootId, onOpenNote }: MobileTreeListProps) {
  const byId = useNotesStore((state) => state.byId);
  const childIds = useNotesStore((state) => state.childIds);
  const view = useViewStore((state) => selectViewById(state, rootId));

  const rows = useMemo(() => {
    if (!rootId) return [];
    const result: TreeRow[] = [];
    const walk = (parentId: ID, depth: number) => {
      for (const id of childIds[parentId] ?? []) {
        const note = byId[id];
        if (!note || !isAlive(note)) continue;
        const children = childIds[id] ?? [];
        const expanded = view.expanded[id] ?? false;
        result.push({ note, depth, hasChildren: children.length > 0, expanded });
        if (expanded) walk(id, depth + 1);
      }
    };
    walk(rootId, 0);
    return result;
  }, [byId, childIds, rootId, view.expanded]);

  function toggleBranch(id: ID, expanded: boolean) {
    if (!rootId) return;
    useViewStore.getState().patch(rootId, {
      expanded: { ...view.expanded, [id]: expanded },
    });
  }

  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-app px-3 py-3"
      aria-label={t('mobile.listaNotas')}
      data-testid="mobile-tree-list"
    >
      {rows.length === 0 ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
          <Icon name="list-tree" size={24} className="text-muted" />
          <p className="text-sm font-medium text-text">{t('canvas.vazioTitulo')}</p>
          <p className="text-xs text-muted">{t('canvas.vazioTexto')}</p>
        </div>
      ) : (
        <>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('mobile.listaNotas')}
          </p>
          <div role="tree" aria-label={t('a11y.navegarArvore')} className="overflow-hidden rounded-xl border border-border bg-bg-raised">
            {rows.map(({ note, depth, hasChildren, expanded }) => {
              const selected = note.id === view.selectedId;
              const childCount = childIds[note.id]?.length ?? 0;
              return (
                <div
                  key={note.id}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-selected={selected}
                  aria-expanded={hasChildren ? expanded : undefined}
                  className={`flex min-h-12 items-center gap-2 border-b border-border/60 px-2 last:border-b-0 ${selected ? 'bg-accent-bg' : 'active:bg-bg-hover'}`}
                  style={{ paddingLeft: `${8 + Math.min(depth, 5) * 18}px` }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
                      aria-label={expanded ? t('mobile.recolherRamo', { nome: note.title }) : t('mobile.expandirRamo', { nome: note.title })}
                      aria-expanded={expanded}
                      onClick={() => toggleBranch(note.id, !expanded)}
                    >
                      <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={16} />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="w-9 shrink-0" />
                  )}
                  <button
                    type="button"
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onOpenNote(note.id)}
                    aria-label={t('mobile.abrirNota', { nome: note.title.trim() || t('common.semTitulo') })}
                  >
                    <Icon name={note.icon} size={16} className={`shrink-0 ${selected ? 'text-accent' : 'text-muted'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {note.title.trim() || t('common.semTitulo')}
                    </span>
                    {childCount > 0 ? (
                      <span className="rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-muted">
                        {childCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
