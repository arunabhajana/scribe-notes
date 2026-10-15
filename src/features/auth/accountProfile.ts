import type { User } from "@supabase/supabase-js";
import type { DeviceInventory } from "../../hooks/useDeviceSessions";

export type AccountProfile = {
  displayName: string;
  localOnly?: boolean;
  email: string;
  avatarColor?: string;
  deviceInventory?: DeviceInventory;
  linkedAccounts?: { provider: string; email?: string; name?: string }[];
  linkedIdentityCount?: number;
  linkedAccountsLoaded?: boolean;
  linkedAccountsError?: string;
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
    linkedAccounts: (user.identities ?? []).filter((identity) => ["google", "github"].includes(identity.provider)).map((identity) => ({ provider: identity.provider, email: identity.identity_data?.email, name: identity.identity_data?.full_name ?? identity.identity_data?.name ?? identity.identity_data?.user_name })),
    linkedIdentityCount: user.identities?.length ?? 0,
  };
}
