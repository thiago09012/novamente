import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  BackupValidationError,
  createBackup,
  parseBackup,
  summarizeBackup,
  type BackupFile,
} from '@/domain/backup';
import { exportProjectContext } from '@/domain/aiContext';
import { slugify } from '@/domain/markdown';
import { exportMarkdown, exportOpml, importTextBackup } from '@/domain/textBackup';
import { isQuotaExceededError } from '@/db/storageErrors';
import {
  canUseMarkdownVault,
  chooseMarkdownVault,
  loadMarkdownVaultHandle,
  saveMarkdownVaultHandle,
  synchronizeMarkdownVault,
} from '@/db/obsidianVault';
import { t } from '@/i18n';
import { runtime, switchToMemoryOnly } from '@/app/runtime';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useViewStore } from '@/store/viewStore';

export function BackupControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [markdownVaultConnected, setMarkdownVaultConnected] = useState(false);
  const [markdownVaultName, setMarkdownVaultName] = useState('');
  const activeCategoryId = useSettingsStore((state) => state.settings.lastCategoryId);
  const summary = candidate ? summarizeBackup(candidate) : null;

  useEffect(() => {
    const db = runtime().db;
    if (!db) return;
    void loadMarkdownVaultHandle(db)
      .then((handle) => {
        setMarkdownVaultConnected(Boolean(handle));
        setMarkdownVaultName(handle?.name ?? '');
      })
      .catch(() => setMarkdownVaultConnected(false));
  }, []);

  function downloadFile(contents: string, fileName: string, mimeType: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportJson() {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const backup = await runtime().exportBackup();
      downloadFile(
        JSON.stringify(backup, null, 2),
        `novamente-backup-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
      setStatus(t('settings.backupExportado'));
    } catch {
      setError(t('settings.backupErroExportar'));
    } finally {
      setBusy(false);
    }
  }

  async function exportAiContext() {
    if (!activeCategoryId) return;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const backup = await runtime().exportBackup();
      const root = backup.data.notes.find((note) => note.id === activeCategoryId);
      if (!root) throw new Error('Active project category is missing.');
      const context = exportProjectContext(backup.data.notes, activeCategoryId, backup.exportedAt);
      downloadFile(
        context,
        `novamente-context-${slugify(root.title)}-${new Date().toISOString().slice(0, 10)}.md`,
        'text/markdown',
      );
      setStatus(t('settings.aiContextExportado'));
    } catch {
      setError(t('settings.aiContextErro'));
    } finally {
      setBusy(false);
    }
  }

  async function exportText(format: 'markdown' | 'opml') {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const backup = await runtime().exportBackup();
      const date = new Date().toISOString().slice(0, 10);
      if (format === 'markdown') {
        downloadFile(exportMarkdown(backup.data.notes), `novamente-${date}.md`, 'text/markdown');
      } else {
        downloadFile(exportOpml(backup.data.notes), `novamente-${date}.opml`, 'text/xml');
      }
      setStatus(t('settings.backupExportado'));
    } catch {
      setError(t('settings.backupErroExportar'));
    } finally {
      setBusy(false);
    }
  }

  async function connectMarkdownVault() {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const app = runtime();
      if (!app.db || app.memoryOnly) throw new Error('Persistent storage is required.');
      const handle = await chooseMarkdownVault();
      await saveMarkdownVaultHandle(app.db, handle);
      setMarkdownVaultConnected(true);
      setMarkdownVaultName(handle.name);
      const result = await synchronizeMarkdownVault(app);
      await Promise.all([useNotesStore.getState().load(), useSettingsStore.getState().load()]);
      useViewStore.setState({ views: {}, loaded: {} });
      setStatus(
        t('settings.markdownVaultSincronizado', {
          notes: result.written,
          created: result.created,
          updated: result.updated,
          conflicts: result.conflicts,
        }),
      );
    } catch {
      setError(t('settings.markdownVaultErro'));
    } finally {
      setBusy(false);
    }
  }

  async function syncMarkdownVault() {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const result = await synchronizeMarkdownVault(runtime());
      await Promise.all([useNotesStore.getState().load(), useSettingsStore.getState().load()]);
      useViewStore.setState({ views: {}, loaded: {} });
      setStatus(
        t('settings.markdownVaultSincronizado', {
          notes: result.written,
          created: result.created,
          updated: result.updated,
          conflicts: result.conflicts,
        }),
      );
    } catch {
      setError(t('settings.markdownVaultErro'));
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setCandidate(null);
    setStatus('');
    setError('');
    try {
      const text = await file.text();
      const extension = file.name.toLowerCase().split('.').pop();
      if (extension === 'json') {
        const parsed: unknown = JSON.parse(text);
        setCandidate(parseBackup(parsed));
      } else if (extension === 'md' || extension === 'markdown' || extension === 'opml') {
        const current = await runtime().exportBackup();
        const imported = importTextBackup(
          extension === 'opml' ? 'opml' : 'markdown',
          text,
          current.data.settings,
        );
        setCandidate(createBackup(imported.data, imported.exportedAt));
      } else {
        setError(t('settings.backupArquivoInvalido'));
      }
    } catch (cause) {
      setError(
        cause instanceof BackupValidationError
          ? cause.message
          : t('settings.backupArquivoInvalido'),
      );
    }
  }

  async function confirmImport() {
    if (!candidate) return;
    setBusy(true);
    setError('');
    try {
      const app = runtime();
      await app.importBackup(candidate);
      setStatus(t('settings.backupImportado'));
      if (!app.memoryOnly) {
        window.location.reload();
        return;
      }
    } catch (cause) {
      if (!isQuotaExceededError(cause)) {
        setError(t('settings.backupErroImportar'));
        return;
      }
      try {
        const memory = await switchToMemoryOnly();
        await memory.importBackup(candidate);
        setStatus(t('settings.backupImportado'));
      } catch {
        setError(t('settings.backupErroImportar'));
      }
    } finally {
      if (runtime().memoryOnly) {
        await Promise.all([useNotesStore.getState().load(), useSettingsStore.getState().load()]);
        useViewStore.setState({ views: {}, loaded: {} });
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted">{t('settings.backupAjuda')}</p>
      <div className="rounded-[var(--radius)] border border-border bg-bg-app p-3">
        <p className="mb-2 text-xs leading-relaxed text-muted">{t('settings.aiContextAjuda')}</p>
        <Button
          size="sm"
          icon={<Icon name="sparkles" size={14} />}
          disabled={busy || !activeCategoryId}
          onClick={() => void exportAiContext()}
        >
          {t('settings.aiContextExportar')}
        </Button>
      </div>
      <div className="rounded-[var(--radius)] border border-border bg-bg-app p-3">
        <p className="mb-2 text-xs leading-relaxed text-muted">
          {t('settings.markdownVaultAjuda')}
        </p>
        {markdownVaultConnected ? (
          <p className="mb-2 text-xs text-text">
            {t('settings.markdownVaultConectado', { name: markdownVaultName })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Icon name="folder" size={14} />}
            disabled={busy || !canUseMarkdownVault() || runtime().memoryOnly}
            onClick={() =>
              void (markdownVaultConnected ? syncMarkdownVault() : connectMarkdownVault())
            }
          >
            {markdownVaultConnected
              ? t('settings.markdownVaultSincronizar')
              : t('settings.markdownVaultConectar')}
          </Button>
          {markdownVaultConnected ? (
            <Button
              size="sm"
              disabled={busy || !canUseMarkdownVault() || runtime().memoryOnly}
              onClick={() => void connectMarkdownVault()}
            >
              {t('settings.markdownVaultAlterar')}
            </Button>
          ) : null}
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text">{t('settings.exportacoes')}</h3>
        <p className="text-xs leading-relaxed text-muted">{t('settings.exportacoesAjuda')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Icon name="download" size={14} />}
            disabled={busy}
            onClick={() => void exportJson()}
          >
            {t('settings.exportarJson')}
          </Button>
          <Button
            size="sm"
            icon={<Icon name="file-text" size={14} />}
            disabled={busy}
            onClick={() => void exportText('markdown')}
          >
            {t('settings.exportarMarkdown')}
          </Button>
          <Button
            size="sm"
            icon={<Icon name="list-tree" size={14} />}
            disabled={busy}
            onClick={() => void exportText('opml')}
          >
            {t('settings.exportarOpml')}
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-text">{t('settings.importacoes')}</h3>
        <p className="text-xs leading-relaxed text-muted">{t('settings.importacoesAjuda')}</p>
        <div>
          <Button
            size="sm"
            icon={<Icon name="upload" size={14} />}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('settings.importarArquivo')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,text/markdown,.md,.markdown,text/xml,.opml"
            aria-label={t('settings.importarArquivo')}
            className="sr-only"
            onChange={(event) => {
              void selectFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </section>
      {status ? (
        <p role="status" className="text-xs text-accent">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {candidate && summary ? (
        <div
          role="group"
          aria-label={t('settings.confirmarImportacao')}
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-warning/50 bg-bg-app p-3"
        >
          <p className="text-sm font-medium text-text">{t('settings.backupResumo', summary)}</p>
          <p className="text-xs text-muted">{t('settings.backupConfirmacao')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" disabled={busy} onClick={() => setCandidate(null)}>
              {t('common.cancelar')}
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void confirmImport()}>
              {t('settings.substituirImportar')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
