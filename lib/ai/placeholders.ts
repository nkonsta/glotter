// Utilities to protect and validate placeholders (ICU, named tokens)

const NAMED_TOKEN = /\{[a-zA-Z0-9_]+\}/g; // {name}
const ICU_PLURAL_OR_SELECT = /\{\s*[a-zA-Z0-9_]+\s*,\s*(plural|select|selectordinal)\s*,[\s\S]*?\}/g;
const PERCENT_S = /%s/g;

export interface ProtectedText {
  textWithSentinels: string;
  mapping: Record<string, string>; // sentinel -> original
}

let sentinelCounter = 0;
function nextSentinel(): string {
  sentinelCounter += 1;
  return `__PH_${sentinelCounter}__`;
}

export function protectPlaceholders(input: string): ProtectedText {
  const mapping: Record<string, string> = {};
  let result = input;

  const replaceAll = (regex: RegExp) => {
    result = result.replace(regex, (match) => {
      const sentinel = nextSentinel();
      mapping[sentinel] = match;
      return sentinel;
    });
  };

  replaceAll(ICU_PLURAL_OR_SELECT);
  replaceAll(NAMED_TOKEN);
  replaceAll(PERCENT_S);

  return { textWithSentinels: result, mapping };
}

export function restorePlaceholders(output: string, mapping: Record<string, string>): string {
  let result = output;
  for (const [sentinel, original] of Object.entries(mapping)) {
    result = result.split(sentinel).join(original);
  }
  return result;
}

export function extractPlaceholders(input: string): string[] {
  const set = new Set<string>();
  const pushAll = (regex: RegExp) => {
    const m = input.match(regex);
    if (m) m.forEach((v) => set.add(v));
  };
  pushAll(ICU_PLURAL_OR_SELECT);
  pushAll(NAMED_TOKEN);
  pushAll(PERCENT_S);
  return Array.from(set);
}

export function validateSamePlaceholders(source: string, candidate: string): { ok: boolean; missing: string[]; extra: string[] } {
  const src = new Set(extractPlaceholders(source));
  const cand = new Set(extractPlaceholders(candidate));
  const missing: string[] = [];
  const extra: string[] = [];
  for (const p of src) if (!cand.has(p)) missing.push(p);
  for (const p of cand) if (!src.has(p)) extra.push(p);
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}


