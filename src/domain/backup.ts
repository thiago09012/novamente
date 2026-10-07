import { defaultSettings, sanitizeSettings } from './settings';
import { isAlive } from './tree';
import type { ID, Link, Note, NoteContentNode, Settings, ViewRecord } from './types';

export const BACKUP_FORMAT = 'novamente-backup';
const LEGACY_BACKUP_FORMAT = 'mente-backup';
export const BACKUP_VERSION = 1;

export interface BackupMetaRow {
  key: string;
  value: unknown;
}

export interface BackupData {
  notes: Note[];
  links: Link[];
  settings: Settings;
  views: ViewRecord[];
  meta: BackupMetaRow[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  data: BackupData;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BackupValidationError(`Campo inválido no backup: ${label}.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`Campo inválido no backup: ${label}.`);
  }
  return value;
}

function parseContent(value: unknown, depth = 0): NoteContentNode {
  if (!record(value) || depth > 100) {
    throw new BackupValidationError('Conteúdo de nota inválido no backup.');
  }
  const type = requireString(value.type, 'content.type');
  if (value.attrs !== undefined && !record(value.attrs)) {
    throw new BackupValidationError('Atributos de conteúdo inválidos no backup.');
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    throw new BackupValidationError('Texto de conteúdo inválido no backup.');
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    throw new BackupValidationError('Filhos de conteúdo inválidos no backup.');
  }
  if (value.marks !== undefined && !Array.isArray(value.marks)) {
    throw new BackupValidationError('Marcas de conteúdo inválidas no backup.');
  }
  const marks = value.marks?.map((mark) => {
    if (!record(mark)) throw new BackupValidationError('Marca de conteúdo inválida no backup.');
    return {
      type: requireString(mark.type, 'content.marks.type'),
      ...(record(mark.attrs) ? { attrs: mark.attrs } : {}),
    };
  });
  return {
    type,
    ...(record(value.attrs) ? { attrs: value.attrs } : {}),
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
    ...(value.content
      ? { content: value.content.map((child) => parseContent(child, depth + 1)) }
      : {}),
    ...(marks ? { marks } : {}),
  };
}

function parseNote(value: unknown): Note {
  if (!record(value)) throw new BackupValidationError('Nota inválida no backup.');
  const id = requireString(value.id, 'note.id');
  const parentId = value.parentId === null ? null : requireString(value.parentId, 'note.parentId');
  const tags = value.tags;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new BackupValidationError(`Tags inválidas na nota ${id}.`);
  }
  const deletedAt =
    value.deletedAt === null ? null : requireFiniteNumber(value.deletedAt, 'note.deletedAt');
  const deletedRootId =
    value.deletedRootId === null ? null : requireString(value.deletedRootId, 'note.deletedRootId');
  if (value.color !== null && typeof value.color !== 'string') {
    throw new BackupValidationError(`Cor inválida na nota ${id}.`);
  }
  return {
    id,
    parentId,
    orderKey: requireString(value.orderKey, 'note.orderKey'),
    title: typeof value.title === 'string' ? value.title : '',
    content: parseContent(value.content),
    contentText: typeof value.contentText === 'string' ? value.contentText : '',
    icon: typeof value.icon === 'string' ? value.icon : 'circle',
    color: value.color,
    tags: [...tags],
    createdAt: requireFiniteNumber(value.createdAt, 'note.createdAt'),
    updatedAt: requireFiniteNumber(value.updatedAt, 'note.updatedAt'),
    deletedAt,
    deletedRootId,
  };
}

function parseLink(value: unknown): Link {
  if (!record(value)) throw new BackupValidationError('Link inválido no backup.');
  return {
    id: requireString(value.id, 'link.id'),
    fromId: requireString(value.fromId, 'link.fromId'),
    toId: value.toId === null ? null : requireString(value.toId, 'link.toId'),
    toTitle: typeof value.toTitle === 'string' ? value.toTitle : '',
  };
}

function parseView(value: unknown): ViewRecord {
  if (!record(value) || !record(value.expanded)) {
    throw new BackupValidationError('Visualização inválida no backup.');
  }
  const expanded: Record<ID, boolean> = {};
  for (const [id, expandedValue] of Object.entries(value.expanded)) {
    if (typeof expandedValue !== 'boolean') {
      throw new BackupValidationError('Expansão inválida no backup.');
    }
    expanded[id] = expandedValue;
  }
  return {
    rootId: requireString(value.rootId, 'view.rootId'),
    expanded,
    panX: requireFiniteNumber(value.panX, 'view.panX'),
    panY: requireFiniteNumber(value.panY, 'view.panY'),
    zoom: requireFiniteNumber(value.zoom, 'view.zoom'),
    selectedId:
      value.selectedId === null ? null : requireString(value.selectedId, 'view.selectedId'),
  };
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const keys = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (keys.has(value))
      throw new BackupValidationError(`Identificador duplicado em ${label}: ${value}.`);
    keys.add(value);
  }
}

function validateRelationships(data: BackupData): void {
  const byId = new Map(data.notes.map((note) => [note.id, note]));
  uniqueBy(data.notes, (note) => note.id, 'notes');
  uniqueBy(data.links, (link) => link.id, 'links');
  uniqueBy(data.views, (view) => view.rootId, 'views');
  uniqueBy(data.meta, (row) => row.key, 'meta');

  for (const note of data.notes) {
    if (note.parentId !== null && !byId.has(note.parentId)) {
      throw new BackupValidationError(`Pai inexistente na nota ${note.id}.`);
    }
    const ancestors = new Set<ID>([note.id]);
    let parentId = note.parentId;
    while (parentId) {
      if (ancestors.has(parentId))
        throw new BackupValidationError(`Ciclo na árvore da nota ${note.id}.`);
      ancestors.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  const categories = new Set(
    data.notes.filter((note) => note.parentId === null).map((note) => note.id),
  );
  for (const link of data.links) {
    if (!byId.has(link.fromId) || (link.toId !== null && !byId.has(link.toId))) {
      throw new BackupValidationError(`Referência inexistente no link ${link.id}.`);
    }
  }
  for (const view of data.views) {
    if (
      !categories.has(view.rootId) ||
      (view.selectedId && !byId.has(view.selectedId)) ||
      view.zoom <= 0
    ) {
      throw new BackupValidationError(`Referência inválida na visualização ${view.rootId}.`);
    }
  }
  if (data.settings.lastCategoryId !== null && !categories.has(data.settings.lastCategoryId)) {
    throw new BackupValidationError('Categoria ativa inválida nas configurações do backup.');
  }
  const deletedRoots = new Set(
    data.notes.filter((note) => note.deletedAt !== null).map((note) => note.id),
  );
  for (const note of data.notes) {
    if (note.deletedRootId !== null && !deletedRoots.has(note.deletedRootId)) {
      throw new BackupValidationError(`Raiz da lixeira inexistente na nota ${note.id}.`);
    }
  }
}

export function parseBackup(value: unknown): BackupFile {
  if (
    !record(value) ||
    (value.format !== BACKUP_FORMAT && value.format !== LEGACY_BACKUP_FORMAT) ||
    value.version !== BACKUP_VERSION
  ) {
    throw new BackupValidationError('Formato ou versão de backup não suportado.');
  }
  if (!record(value.data)) throw new BackupValidationError('Dados do backup ausentes.');
  const raw = value.data;
  if (
    !Array.isArray(raw.notes) ||
    !Array.isArray(raw.links) ||
    !Array.isArray(raw.views) ||
    !Array.isArray(raw.meta)
  ) {
    throw new BackupValidationError('Tabelas do backup inválidas.');
  }
  if (!record(raw.settings)) throw new BackupValidationError('Configurações ausentes no backup.');
  const meta = raw.meta.map((row) => {
    if (!record(row)) throw new BackupValidationError('Metadado inválido no backup.');
    return { key: requireString(row.key, 'meta.key'), value: row.value };
  });
  const data: BackupData = {
    notes: raw.notes.map(parseNote),
    links: raw.links.map(parseLink),
    settings: sanitizeSettings({ ...defaultSettings(), ...raw.settings }),
    views: raw.views.map(parseView),
    meta,
  };
  requireFiniteNumber(value.exportedAt, 'exportedAt');
  validateRelationships(data);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: value.exportedAt as number,
    data,
  };
}

export function createBackup(data: BackupData, exportedAt = Date.now()): BackupFile {
  return parseBackup({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, data });
}

export function summarizeBackup(backup: BackupFile): { notes: number; categories: number } {
  return {
    notes: backup.data.notes.length,
    categories: backup.data.notes.filter((note) => isAlive(note) && note.parentId === null).length,
  };
}
