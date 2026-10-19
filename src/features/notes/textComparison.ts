export type TextChange = { kind: 'same' | 'removed' | 'added'; text: string };

// Bounded LCS: detailed word changes for ordinary edits, line changes for
// larger notes, and a common-prefix/suffix comparison for very large rewrites.
export function compareText(earlier: string, current: string): TextChange[] {
  if (earlier === current) return [{ kind: 'same', text: earlier }];
  let a = earlier.match(/\s+|[^\s]+/g) ?? [], b = current.match(/\s+|[^\s]+/g) ?? [];
  if (a.length * b.length > 160_000) {
    a = earlier.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    b = current.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  }
  let start = 0, tail = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (tail < a.length - start && tail < b.length - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const left = a.slice(start, a.length - tail), right = b.slice(start, b.length - tail);
  const output: TextChange[] = [];
  function append(kind: TextChange['kind'], text: string) {
    if (!text) return;
    const last = output.at(-1);
    if (last?.kind === kind) last.text += text;
    else output.push({ kind, text });
  }
  append('same', a.slice(0, start).join(''));
  if (left.length * right.length > 160_000) {
    append('removed', left.join('')); append('added', right.join(''));
  } else {
    const width = right.length + 1;
    const grid = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      grid[i * width + j] = left[i] === right[j] ? grid[(i + 1) * width + j + 1] + 1 : Math.max(grid[(i + 1) * width + j], grid[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { append('same', left[i++]); j++; }
      else if (i < left.length && (j === right.length || grid[(i + 1) * width + j] >= grid[i * width + j + 1])) append('removed', left[i++]);
      else append('added', right[j++]);
    }
  }
  append('same', tail ? a.slice(a.length - tail).join('') : '');
  return output;
}
