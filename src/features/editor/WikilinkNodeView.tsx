import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { isAlive } from '@/domain/tree';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';
import { useUiStore } from '@/store/uiStore';

export function WikilinkNodeView({ node, updateAttributes }: NodeViewProps) {
  const noteId = typeof node.attrs.noteId === 'string' ? node.attrs.noteId : null;
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
  const sourceId = typeof node.attrs.sourceId === 'string' ? node.attrs.sourceId : null;
  const target = useNotesStore((state) => (noteId ? state.byId[noteId] : undefined));
  const resolved = target !== undefined && isAlive(target);
  const displayedTitle =
    resolved && target ? target.title.trim() || t('common.semTitulo') : title;

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <button
        type="button"
        data-wikilink
        aria-label={
          resolved
            ? t('editor.abrirWikilink', { nome: displayedTitle })
            : t('editor.criarWikilink', { nome: displayedTitle })
        }
        className={`mx-0.5 inline rounded px-1 py-0.5 align-baseline text-sm font-medium underline decoration-dotted underline-offset-2 ${resolved ? 'bg-accent-bg text-accent' : 'border border-dashed border-danger/50 bg-danger/10 text-danger'}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          void (async () => {
            if (resolved && target) {
              useUiStore.getState().requestNavigation(target.id);
              return;
            }
            if (!sourceId || title.trim().length === 0) return;
            try {
              const created = await useNotesStore.getState().createNote({
                parentId: sourceId,
                title: title.trim(),
              });
              updateAttributes({ noteId: created.id, title: created.title });
              useUiStore.getState().requestNavigation(created.id);
            } catch {
              useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' });
            }
          })();
        }}
      >
        {displayedTitle}
      </button>
    </NodeViewWrapper>
  );
}
