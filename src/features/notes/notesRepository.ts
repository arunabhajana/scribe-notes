import type { User } from "@supabase/supabase-js";
import type {
  FolderColor,
  FolderIconName,
  Note,
  NoteFolder,
} from "../../types/note";
import { supabase } from "../auth/supabaseClient";
import { displayNameFromUser } from "../auth/accountProfile";
import { documentToMarkdown } from "./richTextDocument";
import { encodeSyncOperations, type SyncBatch, type SyncReply } from "./syncProtocol";

type FolderRow = {
  version?: number;
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  version?: number;
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
  version: row.version,
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
  async sync(user: User, batch: SyncBatch, cursor: string | null): Promise<SyncReply> {
    requireUserId(user);
    const client = requireClient();
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || session?.user.id !== user.id)
      throw new Error("The signed-in account changed. Its local queue was kept for the next sign-in.");
    const operations = batch.payload ?? encodeSyncOperations(batch.operations);
    const raw = await query(client.rpc("sync_notes_batch", {
      p_batch_id: batch.id, p_operations: operations, p_cursor: cursor,
    }).setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(AbortSignal.timeout(20_000))) as {
      cursor: string; full: boolean; hasMore: boolean;
      changes: { entity: "note" | "folder"; id: string; snapshot: NoteRow | FolderRow | null }[];
      results: { revisionId: string; status: "applied" | "conflict"; entity: "note" | "folder"; snapshot: NoteRow | FolderRow | null }[];
    };
    const decode = (entity: "note" | "folder", row: NoteRow | FolderRow | null) =>
      row ? (entity === "note" ? fromNoteRow(row as NoteRow) : fromFolderRow(row as FolderRow)) : null;
    return {
      ...raw,
      changes: raw.changes.map((change) => ({ ...change, snapshot: decode(change.entity, change.snapshot) })),
      results: raw.results.map((result) => ({ ...result, snapshot: decode(result.entity, result.snapshot) })),
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

};
