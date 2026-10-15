import { useEffect, type ReactNode } from "react";
import { migrateLegacyPreferences, WorkspacePreferencesContext } from "./workspacePreferences";

export function WorkspacePreferencesProvider({ workspaceId, children }: { workspaceId: string | null; children: ReactNode }) {
  useEffect(() => { if (workspaceId) migrateLegacyPreferences(workspaceId); }, [workspaceId]);
  return <WorkspacePreferencesContext.Provider value={workspaceId}>{children}</WorkspacePreferencesContext.Provider>;
}
