import type { User } from "@supabase/supabase-js";
import type {
  FolderColor,
  FolderIconName,
  Note,
  NoteFolder,
} from "../../types/note";
import { supabase } from "../auth/supabaseClient";
import { displayNameFromUser } from "../auth/accountProfile";
import { documentToMarkdown, markdownToDocument } from "./richTextDocument";

type FolderRow = {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  id: string;
  title: string;
  content: unknown;
  folder_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_draft: boolean;
};

export class OfflineSyncConflictError extends Error {
  readonly remote: Note | null;
  constructor(remote: Note | null) {
    super("The cloud note changed while this device was offline.");
    this.name = "OfflineSyncConflictError";
    this.remote = remote;
  }
}

export class FolderSyncConflictError extends Error {
  readonly remote: NoteFolder | null;
  constructor(remote: NoteFolder | null) {
    super("The cloud folder changed while this device was offline.");
    this.name = "FolderSyncConflictError";
    this.remote = remote;
  }
}

export type SyncedPreferences = {
  theme: "dark" | "light";
  accent: string;
  fontFamily: string;
};

const folderIcons = new Set<FolderIconName>([
  "folder",
  "briefcase",
  "book",
  "code",
  "heart",
  "idea",
  "music",
  "travel",
  "star",
]);
const folderColors = new Set<FolderColor>([
  "violet",
  "blue",
  "mint",
  "amber",
  "rose",
  "cyan",
]);

const fromFolderRow = (row: FolderRow): NoteFolder => ({
  ...row,
  icon: folderIcons.has(row.icon as FolderIconName)
    ? (row.icon as FolderIconName)
    : "folder",
  color: folderColors.has(row.color as FolderColor)
    ? (row.color as FolderColor)
    : "blue",
  // Order is a device preference; callers apply their own local ordering.
  sortOrder: 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fromNoteRow = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  body: documentToMarkdown(row.content),
  folderId: row.folder_id,
  pinned: row.is_pinned,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  isDraft: row.is_draft,
});

function requireClient() {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  return supabase;
}

function requireUserId(user: User | null) {
  if (!user) throw new Error("Sign in to access your notes.");
  return user.id;
}

function formatSupabaseError(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}) {
  const parts = [
    error.message,
    error.details,
    error.hint ? `Hint: ${error.hint}` : null,
    error.code ? `Code: ${error.code}` : null,
  ].filter((part): part is string => Boolean(part));
  return (
    parts.join(" · ") || "The database request failed without an error message."
  );
}

async function query<T>(
  operation: PromiseLike<{
    data: T;
    error: {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    } | null;
  }>,
) {
  const result = await operation;
  if (result.error) throw new Error(formatSupabaseError(result.error));
  return result.data;
}

export const notesRepository = {
  async load(user: User) {
    const client = requireClient();
    const userId = requireUserId(user);
    const [folderRows, noteRows] = await Promise.all([
      query(
        client
          .from("folders")
          .select("id,name,icon,color,created_at,updated_at")
          .eq("user_id", userId)
          .order("created_at"),
      ),
      query(
        client
          .from("notes")
          .select(
            "id,title,content,folder_id,is_pinned,created_at,updated_at,deleted_at,is_draft",
          )
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
      ),
    ]);
    return {
      folders: (folderRows as FolderRow[]).map(fromFolderRow),
      notes: (noteRows as NoteRow[]).map(fromNoteRow),
    };
  },

  async loadProfileName(user: User): Promise<string | null> {
    const client = requireClient();
    const userId = requireUserId(user);
    const metadata = user.user_metadata as Record<string, unknown>;
    const displayName = displayNameFromUser(user);
    if (!displayName) {
      const existing = await query(client.from("profiles").select("display_name")
        .eq("user_id", userId).maybeSingle());
      return existing?.display_name ?? null;
    }
    const profile = await query(
      client
        .from("profiles")
        .upsert(
          {
            user_id: userId,
            display_name: displayName,
            avatar_url:
              typeof metadata.avatar_url === "string"
                ? metadata.avatar_url
                : null,
          },
          { onConflict: "user_id" },
        )
        .select("display_name")
        .single(),
    );
    return profile?.display_name ?? null;
  },

  async updatePreferences(user: User, preferences: Partial<SyncedPreferences>) {
    const values: Record<string, string> = {};
    if (preferences.theme !== undefined) values.theme = preferences.theme;
    if (preferences.accent !== undefined)
      values.accent_color = preferences.accent;
    if (preferences.fontFamily !== undefined)
      values.font_family = preferences.fontFamily;
    if (Object.keys(values).length) {
      await query(
        requireClient()
          .from("user_settings")
          .update(values)
          .eq("user_id", requireUserId(user)),
      );
    }
  },

  async createNote(user: User, note: Note) {
    const client = requireClient();
    const userId = requireUserId(user);
    const values = {
      id: note.id,
      user_id: userId,
      title: note.title,
      content: markdownToDocument(note.body),
      folder_id: note.folderId,
      is_pinned: note.pinned,
      created_at: note.createdAt,
      deleted_at: note.deletedAt,
      is_draft: note.isDraft,
    };
    const data = await query(
      client
        .from("notes")
        .upsert(values, { onConflict: "id" })
        .select(
          "id,title,content,folder_id,is_pinned,created_at,updated_at,deleted_at,is_draft",
        )
        .single(),
    );
    return fromNoteRow(data as NoteRow);
  },

  async updateNote(
    user: User,
    id: string,
    patch: Partial<Note>,
    expectedUpdatedAt?: string,
  ) {
    const client = requireClient();
    const userId = requireUserId(user);
    const values: Record<string, unknown> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.body !== undefined)
      values.content = markdownToDocument(patch.body);
    if (patch.folderId !== undefined) values.folder_id = patch.folderId;
    if (patch.pinned !== undefined) values.is_pinned = patch.pinned;
    if (patch.deletedAt !== undefined) values.deleted_at = patch.deletedAt;
    if (patch.isDraft !== undefined) values.is_draft = patch.isDraft;
    if (Object.keys(values).length === 0) return null;
    let update = client
      .from("notes")
      .update(values)
      .eq("id", id)
      .eq("user_id", userId);
    if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
    const data = await query(
      update
        .select(
          "id,title,content,folder_id,is_pinned,created_at,updated_at,deleted_at,is_draft",
        )
        .maybeSingle(),
    );
    if (!data) {
      if (expectedUpdatedAt) {
        const remote = await query(
          client
            .from("notes")
            .select(
              "id,title,content,folder_id,is_pinned,created_at,updated_at,deleted_at,is_draft",
            )
            .eq("id", id)
            .eq("user_id", userId)
            .maybeSingle(),
        );
        throw new OfflineSyncConflictError(
          remote ? fromNoteRow(remote as NoteRow) : null,
        );
      }
      throw new Error(
        "This note could not be found or is no longer accessible.",
      );
    }
    return fromNoteRow(data as NoteRow);
  },

  async permanentlyDeleteNote(
    user: User,
    id: string,
    expectedUpdatedAt?: string,
  ) {
    const client = requireClient();
    const userId = requireUserId(user);
    let deletion = client
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (expectedUpdatedAt)
      deletion = deletion.eq("updated_at", expectedUpdatedAt);
    const deleted = await query(deletion.select("id").maybeSingle());
    if (!deleted && expectedUpdatedAt) {
      const remote = await query(
        client
          .from("notes")
          .select(
            "id,title,content,folder_id,is_pinned,created_at,updated_at,deleted_at,is_draft",
          )
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (remote)
        throw new OfflineSyncConflictError(fromNoteRow(remote as NoteRow));
    }
  },

  async createFolder(user: User, folder: NoteFolder) {
    const data = await query(
      requireClient()
        .from("folders")
        .upsert({
          id: folder.id,
          user_id: requireUserId(user),
          name: folder.name,
          icon: folder.icon,
          color: folder.color,
          created_at: folder.createdAt,
        })
        .select("id,name,icon,color,created_at,updated_at")
        .single(),
    );
    return fromFolderRow(data as FolderRow);
  },

  async updateFolder(
    user: User,
    folder: NoteFolder,
    expectedUpdatedAt?: string,
  ) {
    let update = requireClient()
      .from("folders")
      .update({
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
      })
      .eq("id", folder.id)
      .eq("user_id", requireUserId(user));
    if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
    const data = await query(
      update.select("id,name,icon,color,created_at,updated_at").maybeSingle(),
    );
    if (!data) {
      if (expectedUpdatedAt) {
        const remote = await query(
          requireClient()
            .from("folders")
            .select("id,name,icon,color,created_at,updated_at")
            .eq("id", folder.id)
            .eq("user_id", requireUserId(user))
            .maybeSingle(),
        );
        throw new FolderSyncConflictError(
          remote ? fromFolderRow(remote as FolderRow) : null,
        );
      }
      throw new Error(
        "This folder could not be found or is no longer accessible.",
      );
    }
    return fromFolderRow(data as FolderRow);
  },

  async deleteFolder(user: User, id: string, expectedUpdatedAt?: string) {
    // The schema's composite FK uses ON DELETE SET NULL(folder_id), so Postgres
    // detaches this user's notes atomically as part of deleting the folder.
    const client = requireClient();
    const userId = requireUserId(user);
    let deletion = client
      .from("folders")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (expectedUpdatedAt)
      deletion = deletion.eq("updated_at", expectedUpdatedAt);
    const deleted = await query(deletion.select("id").maybeSingle());
    if (!deleted && expectedUpdatedAt) {
      const remote = await query(
        client
          .from("folders")
          .select("id,name,icon,color,created_at,updated_at")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (remote)
        throw new FolderSyncConflictError(fromFolderRow(remote as FolderRow));
    }
  },
};
