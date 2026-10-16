// Cards only display a few lines. Never parse a multi-megabyte note into a
// hidden DOM tree just to show its opening snippet. Full reading mode is intact.
export function notePreview(body: string): string {
  let head = body.slice(0, 1980);
  let lines = 0;
  for (let index = 0; index < head.length; index++) {
    if (head[index] === '\n' && ++lines === 22) { head = head.slice(0, index); break; }
  }
  if (head.length === body.length) return head;
  // Close a cut-off block only in the display snippet. This also keeps older
  // compact code blocks readable when their closing fence is beyond the limit.
  let fence: CodeFence | null = null;
  for (const line of head.split('\n')) {
    if (fence) { if (closesCodeFence(line, fence)) fence = null; }
    else fence = openingCodeFence(line);
  }
  if (fence && fence.length <= 64) return `${head}\n${fence.marker.repeat(fence.length)}`;
  return head;
}
import { closesCodeFence, openingCodeFence, type CodeFence } from './codeFences';

