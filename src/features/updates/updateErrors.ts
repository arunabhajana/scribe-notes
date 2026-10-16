export function updateCheckFailure(cause: unknown): { kind: 'info' | 'error'; message: string } {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  if (/Could not fetch a valid release JSON|\b404\b/i.test(message)) {
    return { kind: 'info', message: 'Public update information is not available right now. Draft and prerelease versions do not appear here. View releases or try again later.' };
  }
  if (/updater_configured.*not found|command.*not found|not allowed|not permitted/i.test(message)) {
    return { kind: 'error', message: 'This build cannot use the updater. Restart Scribe after rebuilding, or install the latest official signed release.' };
  }
  if (/platform.*not found|fallback platforms|unsupported.*(architecture|os)/i.test(message)) {
    return { kind: 'info', message: 'This release does not include an update for your device. View releases to check available installers.' };
  }
  if (/json|deserialize|missing field|invalid type|expected value|invalid.*version/i.test(message)) {
    return { kind: 'error', message: 'The published update information could not be read. View releases for the official installer, or try again later.' };
  }
  if (/timeout|timed out|connect|dns|resolve|network|sending request/i.test(message)) {
    return { kind: 'error', message: 'Scribe could not reach GitHub. Check your internet connection and try again. Your local notes are still available.' };
  }
  return { kind: 'error', message: 'The update check could not finish. Try again or view releases for the official installer.' };
}
