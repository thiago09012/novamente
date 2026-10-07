import type { ID, Link, Note, Settings, ViewRecord } from '@/domain/types';

export type DatabaseChange =
  | {
      kind: 'notes';
      upsert: Note[];
      remove: ID[];
      replaceLinkOwners?: ID[];
      links?: Link[];
    }
  | { kind: 'settings'; settings: Settings }
  | { kind: 'view'; rootId: ID; view: ViewRecord | null }
  | { kind: 'all' };

const CHANNEL_NAME = 'novamente-database-sync-v1';
const listeners = new Set<(change: DatabaseChange) => void>();
let channel: BroadcastChannel | null = null;
let broadcastingEnabled = true;

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<DatabaseChange>) => {
    for (const listener of listeners) listener(event.data);
  };
  return channel;
}

export function publishDatabaseChange(change: DatabaseChange): void {
  if (broadcastingEnabled) channel?.postMessage(change);
}

export function setBroadcastingEnabled(enabled: boolean): void {
  broadcastingEnabled = enabled;
}

export function subscribeDatabaseChanges(
  listener: (change: DatabaseChange) => void,
): () => void {
  listeners.add(listener);
  ensureChannel();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && channel) {
      channel.close();
      channel = null;
    }
  };
}