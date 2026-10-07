import type { AppDatabase } from '@/db/bootstrap';
import { setBroadcastingEnabled } from '@/db/sync';
import { t } from '@/i18n';
import { useUiStore } from '@/store/uiStore';
import { openMemoryDatabase } from '@/db/memory';

let current: AppDatabase | null = null;

/** Instância aberta do banco (injetada pelo bootstrap em App). */
export function setRuntime(database: AppDatabase): void {
  current = database;
  setBroadcastingEnabled(!database.memoryOnly);
}

export function runtime(): AppDatabase {
  if (!current) throw new Error('Banco de dados ainda não inicializado.');
  return current;
}

export function hasRuntime(): boolean {
  return current !== null;
}

let memoryFallback: Promise<AppDatabase> | null = null;

export function switchToMemoryOnly(): Promise<AppDatabase> {
  if (current?.memoryOnly) return Promise.resolve(current);
  if (memoryFallback) return memoryFallback;
  const source = current;
  if (!source) return Promise.reject(new Error('Banco de dados ainda não inicializado.'));

  memoryFallback = (async () => {
    const snapshot = await source.exportBackup();
    const memory = openMemoryDatabase();
    await memory.importBackup(snapshot);
    setRuntime(memory);
    useUiStore.getState().setMemoryOnly(true);
    useUiStore.getState().toast(t('toast.quotaModoMemoria'), {
      tone: 'error',
      persistent: true,
      actionLabel: t('erros.exportarAgora'),
      onAction: () => useUiStore.getState().openDialog('settings'),
    });
    return memory;
  })().finally(() => {
    memoryFallback = null;
  });
  return memoryFallback;
}
