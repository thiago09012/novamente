import type { ID, Link, Note, Settings, ViewRecord } from '@/domain/types';

/**
 * Interface de repositório (camada de domínio de persistência).
 * Trocável por um backend remoto no futuro sem tocar em stores/UI (seção 17).
 */
export interface NotesRepository {
  /** Todas as notas, incluindo a lixeira (a filtragem é derivada). */
  getAll(): Promise<Note[]>;
  getById(id: ID): Promise<Note | undefined>;
  put(note: Note): Promise<void>;
  putMany(notes: readonly Note[]): Promise<void>;
  /** Aplica as notas alteradas/removidas por um comando estrutural atomicamente. */
  applyChanges(
    upsert: readonly Note[],
    remove: readonly ID[],
    replaceLinkOwners?: readonly ID[],
    links?: readonly Link[],
  ): Promise<void>;
  /** Persiste conteúdo e índice de links atomicamente. */
  saveContent(note: Note, links: readonly Link[]): Promise<void>;
  /** Exclusão definitiva (lixeira) — nunca usada para excluir normal. */
  remove(ids: readonly ID[]): Promise<void>;
  count(): Promise<number>;
}

export interface LinksRepository {
  getAll(): Promise<Link[]>;
  getByFrom(fromId: ID): Promise<Link[]>;
  getByTo(toId: ID): Promise<Link[]>;
  /** Remove os links da nota e grava os novos na mesma transação. */
  replaceFrom(fromId: ID, links: readonly Link[]): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<Settings>;
}

export interface ViewsRepository {
  get(rootId: ID): Promise<ViewRecord | undefined>;
  put(view: ViewRecord): Promise<void>;
  remove(rootId: ID): Promise<void>;
}

export interface MetaRepository {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface Repositories {
  notes: NotesRepository;
  links: LinksRepository;
  settings: SettingsRepository;
  views: ViewsRepository;
  meta: MetaRepository;
}
