import type { User } from "@supabase/supabase-js";

export type AccountProfile = {
  displayName: string;
  email: string;
};

export function displayNameFromUser(user: User): string | null {
  const metadata = user.user_metadata;
  const names = [metadata.display_name, metadata.full_name, metadata.name,
    ...(user.identities ?? []).flatMap(({ identity_data }) =>
      [identity_data?.full_name, identity_data?.name])];
  return names.find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  )?.trim() ?? null;
}

export function needsDisplayName(user: User): boolean {
  const providers = [user.app_metadata.provider, ...(user.app_metadata.providers ?? [])];
  return providers.some((provider) => provider === "google" || provider === "github") &&
    !displayNameFromUser(user);
}

export function profileFromUser(user: User): AccountProfile {
  const name = displayNameFromUser(user);
  const email = user.email ?? "";

  return {
    displayName: name?.trim() ?? email.split("@")[0] ?? "Scribe user",
    email,
  };
}
