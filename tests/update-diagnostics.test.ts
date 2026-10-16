import { describe, expect, it } from 'vitest';
import { formatUpdateDiagnostic, sanitizeUpdateDiagnostic } from '../src/features/updates/updateDiagnostics';

describe('local updater diagnostics', () => {
  it('keeps the native error chain and removes credentials, signed URLs and personal identifiers', () => {
    const report = formatUpdateDiagnostic({ message: 'request failed', diagnostic: {
      stage: 'check', category: 'connection', elapsedMs: 1234,
      endpoints: ['https://user:password@github.com/owner/repo/latest.json?token=private#fragment'],
      nativeError: 'request for https://example.com/file?token=private',
      causes: ['TLS certificate failed', 'proxy https://user:password@proxy.local/ Bearer private', 'Contact someone@example.com C:\\Users\\someone\\file'],
    } }, 10, 'check', true, false);
    expect(report).toContain('Elapsed: 1234 ms');
    expect(report).toContain('TLS certificate failed');
    expect(report).toContain('Endpoint: https://github.com/owner/repo/latest.json');
    expect(report).toContain('Profile: offline · Automatic checks: off');
    for (const secret of ['password', 'private', 'someone@example.com', 'C:\\Users\\someone', 'proxy.local']) expect(report).not.toContain(secret);
  });
  it('supports legacy string errors without inventing a more specific cause', () => {
    const report = formatUpdateDiagnostic('error sending request', 20100, 'check', true, false);
    expect(report).toContain('Category: unknown');
    expect(report).toContain('Native error: error sending request');
    expect(report).not.toContain('Cause 1');
    expect(sanitizeUpdateDiagnostic('x'.repeat(5000))).toHaveLength(1000);
  });
});
