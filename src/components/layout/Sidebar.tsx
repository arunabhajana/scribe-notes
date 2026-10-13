import type { NoteSection } from "../../types/note";
import type { NoteFolder } from "../../types/note";
import { FolderNavigation } from "../navigation/FolderNavigation";
import { PrimaryNavigation } from "../navigation/PrimaryNavigation";
import { SearchNotes } from "../navigation/SearchNotes";
import { BrandHeader } from "../navigation/BrandHeader";
import { ProfileBar } from "../profile/ProfileMenu";
import type { ShortcutBindings } from "../../features/shortcuts/keyboardShortcuts";
import { formatShortcut } from "../../features/shortcuts/keyboardShortcuts";
import type { AccountProfile } from "../../features/auth/accountProfile";

type SidebarProps = {
  section: NoteSection;
  folder: string;
  folderId: string | null;
  folders: NoteFolder[];
  unfiledPosition: number;
  folderCounts: Record<string, number>;
  noteCount: number;
  draftCount: number;
  unfiledCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectSection: (section: NoteSection) => void;
  onSelectFolder: (folder: string) => void;
  onReorderFolders: (sourceId: string, targetId: string) => void;
  onCreateFolder: () => void;
  onOpenPreferences: () => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpandSidebar: () => void;
  shortcuts: ShortcutBindings;
  profile: AccountProfile;
};

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <BrandHeader
        collapsed={props.collapsed}
        onToggleCollapsed={props.onToggleCollapsed}
        shortcut={formatShortcut(props.shortcuts.toggleSidebar)}
      />
      <div className="sidebar-scroll">
        <SearchNotes
          value={props.search}
          onChange={props.onSearchChange}
          collapsed={props.collapsed}
          onExpand={props.onExpandSidebar}
          shortcut={formatShortcut(props.shortcuts.search)}
        />
        <PrimaryNavigation
          section={props.section}
          folderId={props.folderId}
          noteCount={props.noteCount}
          draftCount={props.draftCount}
          onSelect={props.onSelectSection}
          shortcuts={props.shortcuts}
        />
        <FolderNavigation
          folders={props.folders}
          unfiledPosition={props.unfiledPosition}
          folderCounts={props.folderCounts}
          unfiledCount={props.unfiledCount}
          selectedFolder={
            props.section === "unfiled" ? "system:unfiled" : props.folderId
          }
          onSelectFolder={props.onSelectFolder}
          onCreateFolder={props.onCreateFolder}
          onReorderFolders={props.onReorderFolders}
        />
      </div>
      <ProfileBar
        collapsed={props.collapsed}
        profile={props.profile}
        onOpenPreferences={props.onOpenPreferences}
        onLogout={props.onLogout}
      />
    </aside>
  );
}
