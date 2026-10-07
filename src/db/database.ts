import Dexie, { type Table } from 'dexie';

import type { ID, Link, Note, Settings, ViewRecord } from '@/domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Linha persistida de configurações (chave fixa "app"). */
export interface SettingsRow extends Settings {
  key: string;
}

export class MenteDatabase extends Dexie {
  notes!: Table<Note, ID>;
  links!: Table<Link, ID>;
  settings!: Table<SettingsRow, string>;
  views!: Table<ViewRecord, ID>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'mente') {
    super(name);
    this.version(1).stores({
      notes: 'id, parentId, [parentId+orderKey], deletedAt, updatedAt, *tags',
      links: 'id, fromId, toId',
      settings: 'key',
      views: 'rootId',
      meta: 'key',
    });
  }
}

/** IndexedDB indisponível (modo privado antigo, navegador bloqueado). */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
