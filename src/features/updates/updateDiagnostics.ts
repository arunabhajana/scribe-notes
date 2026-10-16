import { appVersion } from './changelogs';
import { buildLabel } from '../appIdentity';

const text = (value: unknown) => typeof value === 'string' ? value : '';
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

export function sanitizeUpdateDiagnostic(value: unknown): string {
  return text(value)
    .replace(/https?:\/\/[^\s)"'<>]+/gi, '[url]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/[A-Z]:[\\/]+Users[\\/]+[^\\/\s]+/gi, '[user directory]')
    .replace(/\p{Cc}/gu, ' ').slice(0, 1000);
}

export function formatUpdateDiagnostic(cause: unknown, elapsedMs: number, stage: string, localOnly: boolean, automatic: boolean): string {
  const failure = object(cause);
  const diagnostic = object(failure.diagnostic);
  const duration = typeof diagnostic.elapsedMs === 'number' ? diagnostic.elapsedMs : elapsedMs;
  const timeout = typeof diagnostic.timeoutMs === 'number' && Number.isFinite(diagnostic.timeoutMs) ? Math.max(0, Math.round(diagnostic.timeoutMs)) : 60_000;
  const endpoints = Array.isArray(diagnostic.endpoints) ? diagnostic.endpoints.slice(0, 3).map(value => {
    try {
      const url = new URL(text(value));
      return url.protocol === 'https:' ? `${url.origin}${url.pathname}` : '[unsupported endpoint]';
    } catch { return '[unavailable endpoint]'; }
  }) : [];
  const causes = Array.isArray(diagnostic.causes) ? diagnostic.causes.slice(0, 5).map(sanitizeUpdateDiagnostic).filter(Boolean) : [];
  return [
    `Scribe ${appVersion} · ${buildLabel}`,
    `Checked: ${new Date().toISOString()}`,
    `Profile: ${localOnly ? 'offline' : 'online'} · Automatic checks: ${automatic ? 'on' : 'off'}`,
    `Stage: ${sanitizeUpdateDiagnostic(diagnostic.stage) || stage}`,
    `Category: ${sanitizeUpdateDiagnostic(diagnostic.category) || 'unknown'}`,
    `Elapsed: ${Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0} ms · Timeout: ${timeout} ms`,
    ...(endpoints.length ? endpoints.map(endpoint => `Endpoint: ${endpoint}`) : []),
    `Native error: ${sanitizeUpdateDiagnostic(diagnostic.nativeError || failure.message || (cause instanceof Error ? cause.message : cause)) || 'No native details returned.'}`,
    ...causes.map((entry, index) => `Cause ${index + 1}: ${entry}`),
  ].join('\n');
}
