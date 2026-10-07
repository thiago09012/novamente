import {
  exportVault,
  loadVaultNotes,
  mergeVaultNotes,
  notesToBackup,
  parseManifest,
  type MarkdownFile,
} from '@/domain/vault';
import { noteToMarkdown } from '@/domain/markdown';

import type { AppDatabase } from './bootstrap';
import type { NovamenteDatabase } from './database';
import type { Note } from '@/domain/types';
import { setMarkdownVaultWriteHandler } from './markdownVaultWriteGate';
import { t } from '@/i18n';

interface DirectoryHandleWithAccess extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'documents' | 'desktop';
  }) => Promise<DirectoryHandleWithAccess>;
}

const HANDLE_ID = 'obsidian';
const SYNC_STATE_PATH = '.novamente/sync-state.json';
const LEGACY_SYNC_STATE_PATH = '.mente/sync-state.json';

interface SyncState {
  format: 'novamente-markdown-sync';
  version: 1;
  notes: Record<string, { app: string; markdown: string; path: string }>;
}

export function canUseMarkdownVault(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

export async function chooseMarkdownVault(): Promise<DirectoryHandleWithAccess> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('Este navegador não permite conectar uma pasta Markdown.');
  return picker.call(window, { id: 'novamente-obsidian-vault', mode: 'readwrite' });
}

export async function saveMarkdownVaultHandle(
  db: NovamenteDatabase,
  handle: DirectoryHandleWithAccess,
): Promise<void> {
  setMarkdownVaultWriteHandler(null);
  await db.vaultHandles.put({ id: HANDLE_ID, handle });
}

export async function loadMarkdownVaultHandle(
  db: NovamenteDatabase,
): Promise<DirectoryHandleWithAccess | null> {
  const row = await db.vaultHandles.get(HANDLE_ID);
  return row?.handle ? (row.handle as DirectoryHandleWithAccess) : null;
}

async function ensureWritePermission(handle: DirectoryHandleWithAccess): Promise<void> {
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return;
  const requested = await handle.requestPermission({ mode: 'readwrite' });
  if (requested !== 'granted') throw new Error(t('settings.markdownVaultPermission'));
}

/** Reativa a gravação Markdown-first da pasta conectada, sem pedir permissão no bootstrap. */
export async function restoreMarkdownVaultWriteThrough(app: AppDatabase): Promise<void> {
  if (!app.db || app.memoryOnly || !app.db.vaultHandles) return;
  const handle = await loadMarkdownVaultHandle(app.db);
  if (!handle) return;
  setMarkdownVaultWriteHandler((upsert, remove) =>
    persistPrimaryMutation(app, handle, upsert, remove),
  );
}

async function collectMarkdown(
  directory: DirectoryHandleWithAccess,
  prefix = '',
): Promise<MarkdownFile[]> {
  const files: MarkdownFile[] = [];
  for await (const entry of directory.values()) {
    if (!prefix && (entry.name === '.novamente' || entry.name === '.mente')) continue;
    if (entry.kind === 'directory') {
      files.push(
        ...(await collectMarkdown(entry as DirectoryHandleWithAccess, `${prefix}${entry.name}/`)),
      );
    } else if (entry.name.endsWith('.md')) {
      const file = await entry.getFile();
      files.push({ path: `${prefix}${entry.name}`, markdown: await file.text() });
    }
  }
  return files;
}

async function removeManagedFile(
  directory: DirectoryHandleWithAccess,
  path: string,
): Promise<void> {
  const [head, ...tail] = path.split('/');
  if (!head) return;
  if (tail.length === 0) {
    try {
      await directory.removeEntry(head);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    return;
  }
  try {
    const child = (await directory.getDirectoryHandle(head)) as DirectoryHandleWithAccess;
    await removeManagedFile(child, tail.join('/'));
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

async function writeManagedFile(
  directory: DirectoryHandleWithAccess,
  path: string,
  contents: string,
): Promise<void> {
  const [head, ...tail] = path.split('/');
  if (!head) return;
  if (tail.length > 0) {
    const child = (await directory.getDirectoryHandle(head, {
      create: true,
    })) as DirectoryHandleWithAccess;
    await writeManagedFile(child, tail.join('/'), contents);
    return;
  }
  const handle = await directory.getFileHandle(head, { create: true });
  const writer = await handle.createWritable();
  await writer.write(contents);
  await writer.close();
}

async function readSyncState(directory: DirectoryHandleWithAccess): Promise<SyncState | null> {
  for (const path of [SYNC_STATE_PATH, LEGACY_SYNC_STATE_PATH]) {
    try {
      const [directoryName, fileName] = path.split('/');
      const metadata = (await directory.getDirectoryHandle(
        directoryName,
      )) as DirectoryHandleWithAccess;
      const fileHandle = await metadata.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const raw: unknown = JSON.parse(await file.text());
      if (
        typeof raw !== 'object' ||
        raw === null ||
      !['novamente-markdown-sync', 'neuronow-markdown-sync', 'mente-markdown-sync'].includes(
          String((raw as Record<string, unknown>).format),
        ) ||
        (raw as Record<string, unknown>).version !== 1 ||
        typeof (raw as Record<string, unknown>).notes !== 'object' ||
        (raw as Record<string, unknown>).notes === null ||
        Array.isArray((raw as Record<string, unknown>).notes)
      ) {
        return null;
      }
      const rawNotes = (raw as Record<string, unknown>).notes as Record<string, unknown>;
      const notes: SyncState['notes'] = {};
      for (const [id, value] of Object.entries(rawNotes)) {
        if (
          typeof value === 'object' &&
          value !== null &&
          typeof (value as Record<string, unknown>).app === 'string' &&
          typeof (value as Record<string, unknown>).markdown === 'string' &&
          typeof (value as Record<string, unknown>).path === 'string'
        ) {
          notes[id] = value as SyncState['notes'][string];
        }
      }
      return { format: 'novamente-markdown-sync', version: 1, notes };
    } catch {
      // Tenta o caminho legado antes de tratar o vault como primeira sincronização.
    }
  }
  return null;
}

async function noteSignature(note: Parameters<typeof noteToMarkdown>[0]): Promise<string> {
  const canonical = JSON.stringify({
    id: note.id,
    parentId: note.parentId,
    orderKey: note.orderKey,
    title: note.title,
    tags: note.tags,
    icon: note.icon,
    color: note.color,
    content: note.content,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function persistSyncState(
  directory: DirectoryHandleWithAccess,
  notes: readonly Note[],
  changedIds?: ReadonlySet<string>,
): Promise<void> {
  const currentState = (await readSyncState(directory)) ?? {
    format: 'novamente-markdown-sync' as const,
    version: 1 as const,
    notes: {},
  };
  const stateNotes = { ...currentState.notes };
  const byId = new Map(notes.map((note) => [note.id, note]));
  const exported = exportVault(notes);
  const projectedMarkdown = loadVaultNotes(exported.files, { base: notes });
  const markdownById = new Map(projectedMarkdown.map((note) => [note.id, note]));
  const pathById = new Map(exported.manifest.notes.map((note) => [note.id, note.path]));
  const ids = changedIds ?? new Set(notes.map((note) => note.id));
  for (const id of ids) {
    const note = byId.get(id);
    if (!note || note.deletedAt !== null) {
      delete stateNotes[id];
      continue;
    }
    const markdownNote = markdownById.get(id) ?? note;
    stateNotes[id] = {
      app: await noteSignature(note),
      markdown: await noteSignature(markdownNote),
      path: pathById.get(id) ?? '',
    };
  }
  const state: SyncState = {
    format: 'novamente-markdown-sync',
    version: 1,
    notes: stateNotes,
  };
  await writeManagedFile(directory, SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

async function persistPrimaryMutation(
  app: AppDatabase,
  directory: DirectoryHandleWithAccess,
  upsert: readonly Note[],
  remove: readonly string[],
): Promise<void> {
  if (upsert.length === 0 && remove.length === 0) return;
  await ensureWritePermission(directory);
  const currentNotes = await app.repos.notes.getAll();
  const byId = new Map(currentNotes.map((note) => [note.id, note]));
  const projected = new Map(byId);
  for (const id of remove) projected.delete(id);
  const structural =
    remove.length > 0 ||
    upsert.some((note) => {
      const previous = byId.get(note.id);
      return (
        !previous ||
        previous.title !== note.title ||
        previous.parentId !== note.parentId ||
        previous.orderKey !== note.orderKey ||
        (previous.deletedAt === null) !== (note.deletedAt === null)
      );
    });
  await assertNoExternalChanges(
    directory,
    currentNotes,
    structural ? undefined : new Set(upsert.map((note) => note.id)),
  );
  for (const note of upsert) projected.set(note.id, note);
  const nextNotes = [...projected.values()];

  if (structural) {
    await writeVault(directory, nextNotes);
  } else {
    const exported = exportVault(nextNotes);
    for (const note of upsert) {
      if (note.deletedAt !== null) continue;
      const manifestNote = exported.manifest.notes.find((item) => item.id === note.id);
      const file = exported.files.find((item) => item.path === manifestNote?.path);
      if (manifestNote && file) await writeManagedFile(directory, file.path, file.markdown);
    }
  }
  await persistSyncState(
    directory,
    nextNotes,
    structural ? undefined : new Set([...upsert.map((note) => note.id), ...remove]),
  );
}

async function assertNoExternalChanges(
  directory: DirectoryHandleWithAccess,
  appNotes: readonly Note[],
  noteIds?: ReadonlySet<string>,
): Promise<void> {
  const state = await readSyncState(directory);
  if (!state) throw new Error(t('settings.markdownVaultNeedsSync'));
  const files = await collectMarkdown(directory);
  const external = loadVaultNotes(files, { base: appNotes });
  const appById = new Map(appNotes.map((note) => [note.id, note]));
  const pathById = new Map<string, string>();
  for (const file of files) {
    const frontmatter = file.markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u)?.[1];
    const id = frontmatter?.match(/^id:\s*['"]?([A-Za-z0-9_-]+)['"]?\s*$/mu)?.[1];
    if (id) pathById.set(id, file.path);
  }
  for (const note of external) {
    if (noteIds && !noteIds.has(note.id) && state.notes[note.id]) continue;
    const previous = state.notes[note.id];
    const appNote = appById.get(note.id);
    if (
      !previous ||
      !appNote ||
      (await noteSignature(note)) !== previous.markdown ||
      pathById.get(note.id) !== previous.path
    ) {
      throw new Error(t('settings.markdownVaultNeedsSync'));
    }
  }
}

async function removeObsoleteManagedFiles(
  directory: DirectoryHandleWithAccess,
  oldFiles: readonly string[],
  newFiles: ReadonlySet<string>,
): Promise<void> {
  for (const path of oldFiles) {
    if (!newFiles.has(path)) await removeManagedFile(directory, path);
  }
}

async function writeVault(
  directory: DirectoryHandleWithAccess,
  notes: Parameters<typeof exportVault>[0],
): Promise<void> {
  const previousPaths = await (async () => {
    try {
      const manifestDirectory = (await directory.getDirectoryHandle(
        '.novamente',
      )) as DirectoryHandleWithAccess;
      const manifestHandle = await manifestDirectory.getFileHandle('manifest.json');
      const manifestFile = await manifestHandle.getFile();
      const parsed: unknown = JSON.parse(await manifestFile.text());
      return parseManifest(parsed).notes.map((note) => note.path);
    } catch {
      try {
        const legacyDirectory = (await directory.getDirectoryHandle(
          '.mente',
        )) as DirectoryHandleWithAccess;
        const legacyHandle = await legacyDirectory.getFileHandle('manifest.json');
        const legacyFile = await legacyHandle.getFile();
        const parsed: unknown = JSON.parse(await legacyFile.text());
        return parseManifest(parsed).notes.map((note) => note.path);
      } catch {
        return (await collectMarkdown(directory)).map((file) => file.path);
      }
    }
  })();

  const { files } = exportVault(notes);
  const nextNotePaths = new Set(
    files.filter((file) => !file.path.startsWith('.novamente/')).map((file) => file.path),
  );
  for (const file of files.filter((item) => !item.path.startsWith('.novamente/'))) {
    await writeManagedFile(directory, file.path, file.markdown);
  }
  await removeObsoleteManagedFiles(directory, previousPaths, nextNotePaths);
  for (const file of files.filter((item) => item.path.startsWith('.novamente/'))) {
    await writeManagedFile(directory, file.path, file.markdown);
  }
}

export async function synchronizeMarkdownVault(app: AppDatabase): Promise<{
  imported: number;
  written: number;
  created: number;
  updated: number;
  preserved: number;
  conflicts: number;
}> {
  if (!app.db || app.memoryOnly)
    throw new Error('O vault Markdown exige armazenamento persistente.');
  const handle = await loadMarkdownVaultHandle(app.db);
  if (!handle) throw new Error('Conecte uma pasta do Obsidian primeiro.');
  await ensureWritePermission(handle);

  const base = await app.exportBackup();
  const externalFiles = await collectMarkdown(handle);
  const deletedIds = new Set(
    base.data.notes.filter((note) => note.deletedAt !== null).map((note) => note.id),
  );
  const imported = loadVaultNotes(externalFiles, { base: base.data.notes }).filter(
    (note) => !deletedIds.has(note.id),
  );
  const baseById = new Map(base.data.notes.map((note) => [note.id, note]));
  const syncState = await readSyncState(handle);
  const signatureCache = new WeakMap<Note, Promise<string>>();
  const signature = (note: Note) => {
    const existing = signatureCache.get(note);
    if (existing) return existing;
    const pending = noteSignature(note);
    signatureCache.set(note, pending);
    return pending;
  };
  const conflicts: Array<{ app: Note; markdown: Note; winner: 'app' | 'markdown' }> = [];
  for (const note of imported) {
    const previous = baseById.get(note.id);
    const previousSignatures = syncState?.notes[note.id];
    if (!previous) continue;
    const [appSignature, markdownSignature] = await Promise.all([
      signature(previous),
      signature(note),
    ]);
    const bothChanged =
      Boolean(previousSignatures) &&
      appSignature !== previousSignatures?.app &&
      markdownSignature !== previousSignatures?.markdown &&
      appSignature !== markdownSignature;
    const olderMarkdown =
      !previousSignatures &&
      appSignature !== markdownSignature &&
      note.updatedAt < previous.updatedAt;
    if (bothChanged || olderMarkdown) {
      conflicts.push({
        app: previous,
        markdown: note,
        winner: note.updatedAt >= previous.updatedAt ? 'markdown' : 'app',
      });
    }
  }
  const conflictCopies: string[] = [];
  const conflictTimestamp = Date.now();
  for (const [index, conflict] of conflicts.entries()) {
    const conflictId = `${conflict.app.id}-${conflictTimestamp}-${index + 1}`;
    const appPath = `.novamente/conflicts/${conflictId}-app.md`;
    const markdownPath = `.novamente/conflicts/${conflictId}-markdown.md`;
    await writeManagedFile(handle, appPath, noteToMarkdown(conflict.app));
    await writeManagedFile(handle, markdownPath, noteToMarkdown(conflict.markdown));
    conflictCopies.push(
      `- ${conflict.app.title.replace(/[\r\n|]/gu, ' ')} (ID ${conflict.app.id}): versão ${conflict.winner} mantida; cópias em \`${appPath}\` e \`${markdownPath}\`.`,
    );
  }
  const merged = mergeVaultNotes(base.data.notes, imported);
  const nextBackup = notesToBackup(merged.notes, {
    settings: base.data.settings,
    views: base.data.views,
    includeDeleted: true,
    meta: base.data.meta,
  });
  await app.importBackup(nextBackup);
  const synchronized = await app.exportBackup();
  await writeVault(handle, synchronized.data.notes);
  await persistSyncState(handle, synchronized.data.notes);
  const review = [
    '# Revisão da sincronização Markdown',
    '',
    `Criadas: ${merged.created.length} · atualizadas: ${merged.updated.length} · conflitos: ${conflicts.length}`,
    '',
    'Em conflitos, a versão com updatedAt mais recente foi mantida.',
    '',
    '## Conflitos',
    '',
    ...(conflictCopies.length > 0 ? conflictCopies : ['Nenhum.']),
    '',
  ].join('\n');
  await writeManagedFile(handle, '.novamente/review.md', review);
  setMarkdownVaultWriteHandler((upsert, remove) =>
    persistPrimaryMutation(app, handle, upsert, remove),
  );

  return {
    imported: imported.length,
    written: synchronized.data.notes.filter((note) => note.deletedAt === null).length,
    created: merged.created.length,
    updated: merged.updated.length,
    preserved: merged.keptOnlyInBase.length,
    conflicts: conflicts.length,
  };
}
