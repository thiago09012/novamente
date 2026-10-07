import { useCallback, useEffect, useState } from 'react';

import { AppSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { openAppDatabase, StorageUnavailableError } from '@/db/bootstrap';
import { openMemoryDatabase } from '@/db/memory';
import { subscribeDatabaseChanges } from '@/db/sync';
import { t } from '@/i18n';
import { setRuntime } from '@/app/runtime';
import { useNotesStore } from '@/store/notesStore';
import { useUiStore } from '@/store/uiStore';
import { selectViewById, useViewStore } from '@/store/viewStore';
import {
  applySettingsToDom,
  useSettingsStore,
  watchSystemPreferences,
} from '@/store/settingsStore';

import { AppShell } from './AppShell';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

type BootState = 'loading' | 'ready' | 'storage-error' | 'load-error';

function ErrorScreen({
  title,
  text,
  onRetry,
  onContinueMemory,
}: {
  title: string;
  text: string;
  onRetry: () => void;
  onContinueMemory?: () => void;
}) {
  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-bg-app p-6 text-center">
      <Icon name="lock" size={32} className="text-danger" />
      <div>
        <h1 className="text-lg font-semibold text-text">{title}</h1>
        <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
      </div>
      <Button variant="primary" onClick={onRetry}>
        {t('common.tentarNovamente')}
      </Button>
      {onContinueMemory ? (
        <Button onClick={onContinueMemory}>{t('erros.continuarMemoria')}</Button>
      ) : null}
    </div>
  );
}

export function App() {
  const [boot, setBoot] = useState<BootState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const settings = useSettingsStore((state) => state.settings);
  const system = useSettingsStore((state) => state.system);
  const settingsStatus = useSettingsStore((state) => state.status);

  const start = useCallback(async () => {
    setBoot('loading');
    try {
      const database = await openAppDatabase();
      setRuntime(database);
      useUiStore.getState().setMemoryOnly(false);
      await Promise.all([useSettingsStore.getState().load(), useNotesStore.getState().load()]);
      setMemoryOnly(false);
      setBoot('ready');
    } catch (error) {
      setBoot(error instanceof StorageUnavailableError ? 'storage-error' : 'load-error');
    }
  }, []);

  const startMemoryOnly = useCallback(async () => {
    setBoot('loading');
    try {
      const database = openMemoryDatabase();
      setRuntime(database);
      useUiStore.getState().setMemoryOnly(true);
      await Promise.all([useSettingsStore.getState().load(), useNotesStore.getState().load()]);
      setMemoryOnly(true);
      setBoot('ready');
    } catch {
      setBoot('load-error');
    }
  }, []);

  useEffect(() => {
    // Carregamento adiado para fora do corpo do efeito (evita cascata de renders).
    const timer = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(timer);
  }, [start, attempt]);

  // Preferências do sistema (tema/movimento) → estado do store.
  useEffect(() => {
    return watchSystemPreferences((systemPrefs) => {
      useSettingsStore.setState({ system: systemPrefs });
    });
  }, []);

  useEffect(() => {
    if (boot !== 'ready') return;
    return subscribeDatabaseChanges((change) => {
      if (change.kind === 'all') {
        useUiStore.getState().toast(t('toast.dadosAlteradosOutraAba'), {
          actionLabel: t('common.recarregar'),
          onAction: () => window.location.reload(),
        });
        return;
      }
      if (change.kind === 'settings') {
        useSettingsStore.setState({ settings: change.settings });
        return;
      }
      if (change.kind === 'view') {
        useViewStore.getState().applyRemoteView(change.rootId, change.view);
        return;
      }

      const settings = useSettingsStore.getState().settings;
      const currentView = selectViewById(useViewStore.getState(), settings.lastCategoryId);
      const selectedId = currentView.selectedId;
      const localSelected = selectedId ? useNotesStore.getState().byId[selectedId] : undefined;
      const remoteSelected = selectedId
        ? change.upsert.find((note) => note.id === selectedId)
        : undefined;
      useNotesStore.getState().applyRemoteChanges(
        change.upsert,
        change.remove,
        change.replaceLinkOwners,
        change.links,
      );

      if (!remoteSelected || !localSelected || remoteSelected.updatedAt < localSelected.updatedAt) {
        return;
      }
      if (remoteSelected.deletedAt !== null) {
        const deletedRootId = remoteSelected.deletedRootId ?? remoteSelected.id;
        if (settings.lastCategoryId) useViewStore.getState().select(settings.lastCategoryId, null);
        void useSettingsStore.getState().update({ editorOpen: false }).catch(() => undefined);
        useUiStore.getState().toast(t('toast.notaExcluidaOutraAba'), {
          actionLabel: t('common.desfazer'),
          onAction: () => {
            void useNotesStore.getState().restoreNotes([deletedRootId]);
          },
        });
        return;
      }
      useUiStore.getState().toast(t('toast.notaAlteradaOutraAba'), {
        actionLabel: t('common.recarregar'),
        onAction: () => window.location.reload(),
      });
    });
  }, [boot]);

  // Tema, densidade, escala e movimento aplicados ao documento.
  useEffect(() => {
    applySettingsToDom(settings, system);
  }, [settings, system]);

  if (boot === 'storage-error') {
    return (
      <ErrorScreen
        title={t('erros.storageTitulo')}
        text={t('erros.storageTexto')}
        onRetry={() => setAttempt((value) => value + 1)}
        onContinueMemory={() => void startMemoryOnly()}
      />
    );
  }

  if (boot === 'load-error') {
    return (
      <ErrorScreen
        title={t('erros.carregamentoTitulo')}
        text={t('toast.erroSalvar')}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (boot !== 'ready' || settingsStatus !== 'ready') {
    return <AppSkeleton />;
  }

  return (
    <ErrorBoundary panel="app">
      <AppShell memoryOnly={memoryOnly} />
    </ErrorBoundary>
  );
}
