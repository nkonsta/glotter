export type ImportMode = 'add-only' | 'merge' | 'overwrite';

export function flattenJson(input: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (typeof input !== 'object' || input === null) return result;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      Object.assign(result, flattenJson(value, newKey));
    } else {
      result[newKey] = value as unknown;
    }
  }
  return result;
}

export function setNested(target: Record<string, unknown>, dottedKey: string, value: unknown): void {
  const parts = dottedKey.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const current = cursor[part];
    if (typeof current !== 'object' || current === null) {
      const next: Record<string, unknown> = {};
      cursor[part] = next;
      cursor = next;
    } else {
      cursor = current as Record<string, unknown>;
    }
  }
  cursor[parts[parts.length - 1]] = value as unknown;
}

export function normalizeLeafValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SingleLanguageImport = Record<string, unknown>;

export type ImportPreview = {
  totalKeys: number;
  addCount: number;
  updateCount: number;
  unchangedCount: number;
  conflictKeys: string[]; // reserved for future, if needed
};

export function computePreview(
  current: Record<string, string | null>,
  incoming: Record<string, unknown>,
  mode: ImportMode
): ImportPreview {
  const incomingFlat = flattenJson(incoming);
  let addCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  for (const [key, raw] of Object.entries(incomingFlat)) {
    const next = normalizeLeafValue(raw);
    const prev = current[key] ?? null;
    if (prev == null) {
      addCount += 1;
      continue;
    }
    if (mode === 'add-only') {
      // existing values won't be updated
      unchangedCount += 1;
    } else if (mode === 'merge') {
      if (prev !== next) updateCount += 1;
      else unchangedCount += 1;
    } else if (mode === 'overwrite') {
      if (prev !== next) updateCount += 1;
      else unchangedCount += 1;
    }
  }
  return {
    totalKeys: Object.keys(incomingFlat).length,
    addCount,
    updateCount,
    unchangedCount,
    conflictKeys: [],
  };
}

export function toKeyToValueMap(input: Record<string, unknown>): Record<string, string | null> {
  const flat = flattenJson(input);
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(flat)) out[k] = normalizeLeafValue(v);
  return out;
}


