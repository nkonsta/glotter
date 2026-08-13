export const AI_MAX_REQUEST_BYTES = 256 * 1024;
export const AI_MAX_ENTRIES_PER_REQUEST = 100;
export const AI_MAX_TARGET_LANGUAGES_PER_REQUEST = 5;
export const AI_MAX_ENTRY_CHARACTERS = 2000;
export const AI_MAX_TOTAL_SOURCE_CHARACTERS = 50000;
export const AI_MAX_GLOSSARY_TERMS = 50;
export const AI_MAX_GLOSSARY_TERM_CHARACTERS = 500;
export const AI_MAX_KEY_CHARACTERS = 500;
export const AI_MAX_LANGUAGE_CODE_CHARACTERS = 35;

export function chunkAiEntries<T extends { text: string }>(items: T[], requestedSize: number): T[][] {
  const chunkSize = Number.isInteger(requestedSize) && requestedSize > 0
    ? Math.min(requestedSize, AI_MAX_ENTRIES_PER_REQUEST)
    : AI_MAX_ENTRIES_PER_REQUEST;
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let characters = 0;

  for (const item of items) {
    if (
      chunk.length > 0 &&
      (chunk.length >= chunkSize || characters + item.text.length > AI_MAX_TOTAL_SOURCE_CHARACTERS)
    ) {
      chunks.push(chunk);
      chunk = [];
      characters = 0;
    }
    chunk.push(item);
    characters += item.text.length;
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  return chunks;
}

export function chunkAiTargetLanguages(items: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += AI_MAX_TARGET_LANGUAGES_PER_REQUEST) {
    chunks.push(items.slice(i, i + AI_MAX_TARGET_LANGUAGES_PER_REQUEST));
  }
  return chunks;
}
