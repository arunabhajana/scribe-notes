export type Note = {
  /** Server revision; undefined only for caches created before versioned sync. */
  version?: number;
  id: string;
  title: string;
  body: string;
  folderId: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Drafts remain drafts until the user explicitly saves them. */
  isDraft: boolean;
};

export type NoteSection = "all" | "drafts" | "pinned" | "trash" | "unfiled";

export type NotePatch = Partial<Omit<Note, "id" | "createdAt">>;

export type FolderIconName =
  | "folder"
  | "briefcase"
  | "book"
  | "code"
  | "heart"
  | "idea"
  | "music"
  | "travel"
  | "star";
export type FolderColor =
  | "violet"
  | "blue"
  | "mint"
  | "amber"
  | "rose"
  | "cyan";
export type NoteFolder = {
  version?: number;
  id: string;
  name: string;
  icon: FolderIconName;
  color: FolderColor;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SystemFolder = {
  id: "system:unfiled";
  name: "Unfiled";
  icon: "folder";
  color: "blue";
  system: true;
};
