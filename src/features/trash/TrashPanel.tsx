import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { buildIndex, depthOf } from '@/domain/tree';
import { trashDaysRemaining } from '@/domain/trash';
import type { ID, Note } from '@/domain/types';
import { t } from '@/i18n';
import { collectTrashGroup, useNotesStore, useTrashRootIds } from '@/store/notesStore';
import { useUiStore } from '@/store/uiStore';

type ConfirmState = { mode: 'none' } | { mode: 'group'; id: ID } | { mode: 'purge' };

function groupRootId(group: Note[]): ID {
  const root = group.find((note) => note.id === note.deletedRootId);
  return (root ?? group[0]).id;
}

export function TrashPanel() {
  const rootIds = useTrashRootIds();
  const notes = useNotesStore();
  const closeDialog = useUiStore((state) => state.closeDialog);
  const toast = useUiStore((state) => state.toast);
  const now = useUiStore((state) => state.dialogOpenedAt);
  const [confirm, setConfirm] = useState<ConfirmState>({ mode: 'none' });

  const index = useMemo(() => buildIndex(Object.values(notes.byId)), [notes.byId]);
  const groups = useMemo(
    () => rootIds.map((id) => collectTrashGroup(notes.byId, id)).filter((g) => g.length > 0),
    [rootIds, notes.byId],
  );
  const total = groups.reduce((sum, group) => sum + group.length, 0);

  async function guard(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) toast(success);
      setConfirm({ mode: 'none' });
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }

  return (
    <Dialog open onClose={closeDialog} title={t('trash.titulo')} width="34rem">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="trash" size={28} className="text-muted" />
          <p className="font-medium text-text">{t('trash.vazioTitulo')}</p>
          <p className="max-w-xs text-sm text-muted">{t('trash.vazioTexto')}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3" role="list">
            {groups.map((group) => {
              const rootId = groupRootId(group);
              const root = notes.byId[rootId];
              const titles = [...group].sort((a, b) => depthOf(index, a.id) - depthOf(index, b.id));
              const confirming = confirm.mode === 'group' && confirm.id === rootId;
              return (
                <li
                  key={rootId}
                  className="rounded-[var(--radius)] border border-border bg-bg-app p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">
                        {root?.title || t('common.semTitulo')}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t('trash.grupo', { n: group.length })}
                      </p>
                      {root?.deletedAt ? (
                        <p className="mt-0.5 text-xs text-muted">
                          {trashDaysRemaining(root.deletedAt, now) === 1
                            ? t('trash.expiraAmanha')
                            : t('trash.expiraEm', {
                                dias: trashDaysRemaining(root.deletedAt, now),
                              })}
                        </p>
                      ) : null}
                    </div>
                    {confirming ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            void guard(
                              () => notes.deleteForever([rootId]),
                              t('toast.excluidaDefinitivamente'),
                            )
                          }
                        >
                          {t('common.excluir')}
                        </Button>
                        <Button size="sm" onClick={() => setConfirm({ mode: 'none' })}>
                          {t('common.cancelar')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          icon={<Icon name="undo" size={14} />}
                          onClick={() =>
                            void guard(() => notes.restoreNotes([rootId]), t('toast.restaurada'))
                          }
                        >
                          {t('trash.restaurar')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Icon name="x" size={14} />}
                          onClick={() => setConfirm({ mode: 'group', id: rootId })}
                        >
                          {t('trash.excluirDefinitivo')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <ul className="mt-2 flex flex-col gap-0.5" role="list">
                    {titles.map((note) => (
                      <li
                        key={note.id}
                        className="truncate text-xs text-muted"
                        style={{ paddingLeft: `${Math.min(depthOf(index, note.id), 6) * 10}px` }}
                      >
                        {note.title || t('common.semTitulo')}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-border pt-3">
            {confirm.mode === 'purge' ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">
                    {t('trash.confirmarEsvaziarTitulo')}
                  </p>
                  <p className="text-xs text-muted">
                    {t('trash.confirmarEsvaziarTexto', { n: total })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      void guard(
                        () =>
                          Promise.all(
                            groups.map((group) => notes.deleteForever([groupRootId(group)])),
                          ),
                        t('toast.lixeiraVazia'),
                      )
                    }
                  >
                    {t('trash.esvaziar')}
                  </Button>
                  <Button size="sm" onClick={() => setConfirm({ mode: 'none' })}>
                    {t('common.cancelar')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">{t('trash.grupo', { n: total })}</p>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Icon name="trash" size={14} />}
                  onClick={() => setConfirm({ mode: 'purge' })}
                >
                  {t('trash.esvaziar')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
