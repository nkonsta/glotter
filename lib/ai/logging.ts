type AiLogLevel = 'info' | 'warn' | 'error';
type AiLogFields = Record<string, string | number | boolean | null | undefined>;

export function logAi(level: AiLogLevel, event: string, fields: AiLogFields = {}) {
  const payload = JSON.stringify({
    scope: 'ai_translation',
    event,
    ...fields,
  });

  if (level === 'error') {
    console.error(payload);
  } else if (level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}
