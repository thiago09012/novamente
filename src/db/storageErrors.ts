export function isQuotaExceededError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof DOMException && current.name === 'QuotaExceededError') return true;
    if (typeof current === 'object') {
      const item = current as { name?: unknown; code?: unknown; inner?: unknown; cause?: unknown };
      if (
        item.name === 'QuotaExceededError' ||
        item.code === 22 ||
        item.code === 1014
      ) {
        return true;
      }
      current = item.inner ?? item.cause;
      continue;
    }
    break;
  }
  return false;
}