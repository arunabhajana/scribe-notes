import { describe, expect, it } from 'vitest';
import { updateCheckFailure } from '../src/features/updates/updateErrors';

describe('actionable update check feedback', () => {
  it.each(['Could not fetch a valid release JSON from the remote', 'HTTP 404'])('does not blame the connection for unavailable release metadata: %s', message => {
    expect(updateCheckFailure(message)).toEqual(expect.objectContaining({ kind: 'info' }));
    expect(updateCheckFailure(message).message).toContain('Draft and prerelease');
    expect(updateCheckFailure(message).message).not.toContain('connection');
  });
  it('distinguishes a stale native binary from a network problem', () => {
    expect(updateCheckFailure('Command updater_configured not found').message).toContain('Restart Scribe after rebuilding');
  });
  it('explains actual network failures', () => {
    expect(updateCheckFailure(new Error('error sending request: DNS lookup failed')).message).toContain('internet connection');
  });
  it.each([
    'error sending request for url (https://github.com/arunabhajana/scribe-notes/releases/latest/download/latest.json)',
    'error sending request for url (https://github.com/arunabhajana/scribe-windows/releases/latest/download/latest.json)',
    'error reading a body from connection: connection reset by peer',
  ])('does not misclassify native transport errors as invalid JSON: %s', message => {
    const failure = updateCheckFailure(message);
    expect(failure.message).toContain('internet connection');
    expect(failure.message).not.toContain('could not read');
    expect(failure.message).not.toContain('github.com');
  });
  it('identifies a timeout even when the error contains a JSON endpoint URL', () => {
    expect(updateCheckFailure('request timed out for https://github.com/owner/repo/latest.json').message).toContain('too long');
  });
  it('uses the native error category when the top-level error hides the timeout', () => {
    expect(updateCheckFailure({ message: 'error sending request for url (https://github.com/latest.json)', diagnostic: { category: 'timeout' } }).message).toContain('too long');
  });
  it('distinguishes malformed metadata and missing platform installers', () => {
    expect(updateCheckFailure('missing field version').message).toContain('could not be read');
    expect(updateCheckFailure('the platform windows-x86_64 was not found').message).toContain('your device');
  });
  it('does not expose arbitrary internal error details', () => {
    expect(updateCheckFailure('internal sensitive diagnostic').message).not.toContain('sensitive');
  });
});
