import { Icon } from "../Icon";
import type { NoteFolder } from "../../types/note";
import { useState } from "react";

export function FolderNavigation({
  folders,
  folderCounts,
  unfiledCount,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  unfiledPosition,
  onReorderFolders,
}: {
  folders: NoteFolder[];
  folderCounts: Record<string, number>;
  unfiledCount: number;
  selectedFolder: string | null;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  unfiledPosition: number;
  onReorderFolders: (sourceId: string, targetId: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const orderedItems: (NoteFolder | null)[] = [...folders];
  orderedItems.splice(
    Math.max(0, Math.min(folders.length, unfiledPosition)),
    0,
    null,
  );
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
      setDraggedId(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    },
    onDragOver: (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setTargetId(id);
    },
    onDrop: (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const source = draggedId ?? event.dataTransfer.getData("text/plain");
      if (source) onReorderFolders(source, id);
      setDraggedId(null);
      setTargetId(null);
    },
    onDragEnd: () => {
      setDraggedId(null);
      setTargetId(null);
    },
    className: `folder-item ${selectedFolder === id ? "active" : ""} ${draggedId === id ? "is-dragging" : ""} ${targetId === id && draggedId !== id ? "is-drop-target" : ""}`,
  });
  return (
    <>
      <div className="folder-heading">
        <span>Folders</span>
        <button
          className="icon-button add-folder"
          onClick={onCreateFolder}
          aria-label="Create folder"
          data-tooltip="Create folder"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <nav className="folder-nav" aria-label="Folders">
        {orderedItems.map((folder) => {
          const id = folder?.id ?? "system:unfiled";
          const name = folder?.name ?? "Unfiled";
          return (
            <button
              data-context-folder={id}
              key={id}
              {...dragProps(id)}
              data-tooltip={name}
              aria-label={`${name}, ${folder ? (folderCounts[id] ?? 0) : unfiledCount} Notes`}
              onClick={() => onSelectFolder(id)}
            >
              <span
                className="folder-icon"
                style={
                  {
                    "--folder-color": `var(--folder-${folder?.color ?? "blue"})`,
                  } as React.CSSProperties
                }
              >
                <Icon name={folder?.icon ?? "folder"} size={15} />
              </span>
              <span>{name}</span>
              <span className="nav-count">
                {folder ? (folderCounts[id] ?? 0) : unfiledCount}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
