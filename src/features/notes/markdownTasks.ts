/** Change one source line, preserving its marker, spacing, and line endings. */
export function setMarkdownTaskCheckedAtLine(value: string, lineIndex: number, checked: boolean) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return value;
  const parts = value.split(/(\r\n|\r|\n)/);
  const index = lineIndex * 2;
  const line = parts[index];
  if (line === undefined) return value;
  parts[index] = line.replace(/^([ \t]*[-*+][ \t]+\[)[ xX](\])/, `$1${checked ? "x" : " "}$2`);
  return parts.join("");
}

export function toggleMarkdownTask(value: string, taskIndex: number, checked: boolean) {
  let currentIndex = -1;
  return value.replace(/^([ \t]*[-*+]\s+\[)([ xX])([\]])/gm, (match, before: string, _state: string, after: string) => {
    currentIndex++;
    return currentIndex === taskIndex ? `${before}${checked ? "x" : " "}${after}` : match;
  });
}
