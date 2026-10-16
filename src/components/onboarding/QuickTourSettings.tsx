import { workspaceTourEvent, workspaceTourSeenPreference } from '../../features/onboarding/useWorkspaceTour';
import { useWorkspacePreference } from '../../features/settings/workspacePreferences';

export function QuickTourSettings() {
  const [seen] = useWorkspacePreference(workspaceTourSeenPreference);
  return <div className="update-settings-row quick-tour-settings" id="setting-guided-tour">
    <div><strong>{seen ? 'Repeat the tour' : 'Getting started'}</strong><p>{seen ? 'Walk through Scribe’s main features again.' : 'Explore your workspace and its optional features.'}</p></div>
    <button type="button" className="update-secondary" onClick={() => window.dispatchEvent(new Event(workspaceTourEvent))}>Quick tour</button>
  </div>;
}
