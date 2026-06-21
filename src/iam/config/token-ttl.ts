const TTL_PATTERN = /^(\d+)(ms|s|m|h|d|w)?$/i;

const UNIT_TO_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
};

export function parseTokenTtl(value: string, variableName: string): number {
  const normalized = value.trim();
  const match = TTL_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(
      `${variableName} must be a positive duration such as 900, 15m, 1h, or 7d.`,
    );
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const seconds = amount * UNIT_TO_SECONDS[unit];

  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(
      `${variableName} must resolve to at least one whole second.`,
    );
  }

  return seconds;
}
