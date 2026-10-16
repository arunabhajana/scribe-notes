export function updateCheckFailure(cause: unknown): { kind: 'info' | 'error'; message: string } {
  const failure = cause && typeof cause === 'object' ? cause as { message?: unknown; diagnostic?: { category?: unknown } } : null;
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : typeof failure?.message === 'string' ? failure.message : '';
  const category = failure?.diagnostic?.category;
  if (/Could not fetch a valid release JSON|\b404\b/i.test(message)) {
    return { kind: 'info', message: 'Public update information is not available right now. Draft and prerelease versions do not appear here. View releases or try again later.' };
  }
  if (category === 'permission' || category === 'configuration' || /updater_configured.*not found|command.*not found|not allowed|not permitted/i.test(message)) {
    return { kind: 'error', message: 'This build cannot use the updater. Restart Scribe after rebuilding, or install the latest official signed release.' };
  }
  if (/platform.*not found|fallback platforms|unsupported.*(architecture|os)/i.test(message)) {
    return { kind: 'info', message: 'This release does not include an update for your device. View releases to check available installers.' };
  }
  // Native request errors include the endpoint URL. Its `latest.json` suffix
  // must not turn a connection failure into a malformed-manifest error.
  if (category === 'timeout' || /timeout|timed out/i.test(message)) {
    return { kind: 'error', message: 'GitHub took too long to respond. Try checking again. Your local notes are still available.' };
  }
  if (category === 'connection' || category === 'network' || /connect|dns|resolve|network|sending request|error reading a body from connection/i.test(message)) {
    return { kind: 'error', message: 'Scribe could not reach GitHub. Check your internet connection and try again. Your local notes are still available.' };
  }
  const withoutUrls = message.replace(/https?:\/\/[^\s)]+/gi, '[url]');
  if (/json|deserializ|missing field|invalid type|expected value|invalid.*version|invalid.*pub_date|error decoding response body/i.test(withoutUrls)) {
    return { kind: 'error', message: 'The update information returned by GitHub could not be read. Retry the check; if it continues, use View releases for the official installer.' };
  }
  return { kind: 'error', message: 'The update check could not finish. Try again or view releases for the official installer.' };
}
