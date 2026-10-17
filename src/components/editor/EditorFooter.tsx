import { useDeferredValue, useMemo } from "react";
import { ModifiedTime } from "./ModifiedTime";

export function EditorFooter({ body, updatedAt }: { body: string; updatedAt: string }) {
  const deferredBody = useDeferredValue(body);
  const words = useMemo(() => deferredBody.trim() ? deferredBody.trim().split(/\s+/).length : 0, [deferredBody]);
  return (
    <footer className="editor-footer">
      <div>
        <span>{words} words</span>
        <span className="footer-separator">·</span>
        <span>{body.length} characters</span>
        <span className="footer-separator">·</span>
        <ModifiedTime updatedAt={updatedAt} />
      </div>
      <div className="editor-footer-right">
        <span>Markdown supported</span>
      </div>
    </footer>
  );
}
