export type TourRoute = 'notes' | 'general' | 'appearance' | 'editor' | 'shortcuts' | 'notifications' | 'about';
export type TourStep = {
  id: string; title: string; description: string; section: string;
  target?: string; route?: TourRoute; interactive?: boolean; clickTo?: string;
  actionLabel?: string; requiresComposer?: boolean; requiresPracticeNote?: boolean;
  placement?: 'settings';
};

// Keep the complete walkthrough at 15 steps, including optional note practice.
// Real saving, trashing and preference changes always require the user's action.
export function workspaceTourSteps(localOnly: boolean, shortcut: string): TourStep[] {
  return [
    { id: 'welcome', section: 'Welcome', title: 'Let’s find your way around.', description: localOnly ? 'Explore your offline workspace by trying the real controls, without an online account. Skip anytime.' : 'Try the main tools in your own workspace. Optional features stay your choice. Skip anytime.' },
    { id: 'new-note', section: 'Your first note', route: 'notes', target: '[data-tour="new-note"]', title: 'Start a new note.', description: 'Click New Note to try the editor, or skip note practice.', interactive: true, actionLabel: 'Open New Note' },
    { id: 'write', section: 'Your first note', target: '.composer-body', title: 'Give your thought a little space.', description: 'Add a title and a few words. Try the toolbar for lists, checkboxes or code; Reading mode previews your note. Choose Next when you’re ready to save.', interactive: true, requiresComposer: true },
    { id: 'save', section: 'Your first note', target: '[data-tour="save-note"]', title: 'Keep your note.', description: 'Click Save Note to keep it. Next, we’ll try its right-click menu. Skipping the tour leaves this editor open.', interactive: true, actionLabel: 'Save my note', requiresComposer: true },
    { id: 'delete-note', section: 'Note actions', route: 'notes', title: 'Right-click the note you just made.', description: 'The context menu has pinning, reminders and folder actions. Right-click this note to see how moving it to Trash works.', interactive: true, actionLabel: 'Show note menu', requiresPracticeNote: true },
    { id: 'delete-menu', section: 'Note actions', target: '[data-tour="practice-trash"]', title: 'Move a note to Trash.', description: 'Choose Move to trash to try it, or keep your note. This is reversible: restore it from Trash later. Permanent deletion is a separate action.', interactive: true, actionLabel: 'Move to Trash', requiresPracticeNote: true },
    { id: 'organize', section: 'Your workspace', route: 'notes', target: '.sidebar-scroll', title: 'Find and organize your thoughts.', description: 'Search titles and content here. Use Drafts, Pinned Notes and folders to stay organized; + creates a folder. Restore removed notes from Trash.' },
    { id: 'settings', section: 'Make it yours', target: '[data-tour="open-settings"]', title: 'Your preferences are here.', description: 'Click Settings. We’ll visit the main options next.', interactive: true, clickTo: 'general-nav', actionLabel: 'Open settings' },
    { id: 'general-nav', section: 'Make it yours', target: '[data-tour="settings-general"]', title: 'Start with General.', description: 'Click General for export and import. Use this menu to switch sections, or search above for any setting. Shortcuts has your keyboard bindings.', interactive: true, clickTo: 'transfer', actionLabel: 'Open General' },
    { id: 'transfer', section: 'Make it yours', route: 'general', placement: 'settings', target: '#setting-move-your-notes', title: 'Take your notes with you.', description: localOnly ? 'Export a Scribe backup or Markdown, choosing what to include. Import brings a saved copy into this workspace. Both work offline.' : 'Export a backup or Markdown, or import a saved copy here. Optional cloud sync is just above, with its own explanation before enabling.' },
    { id: 'appearance', section: 'Make it yours', route: 'appearance', placement: 'settings', target: '#setting-color-mood', title: 'Choose your look.', description: 'Try light or dark mode here. Accent colors and fonts are further down. Each workspace keeps its own preferences.', interactive: true },
    { id: 'windows', section: 'Useful extras', route: 'editor', placement: 'settings', target: '#setting-windows-integration', title: 'Capture from anywhere.', description: `Quick Capture uses ${shortcut} while Scribe runs. Startup opens Scribe with Windows; Close to system tray keeps it running after the window closes. All are your choice.`, interactive: true },
    { id: 'notifications', section: 'Useful extras', route: 'notifications', placement: 'settings', target: '#setting-stay-in-the-loop', title: 'Choose your reminders.', description: 'Set reminder, desktop alert and sound preferences here. Windows permissions also apply. Reminder presets are further down.', interactive: true },
    { id: 'updates', section: 'Stay up to date', route: 'about', placement: 'settings', target: '.update-auto', title: 'Update on your terms.', description: localOnly ? 'Automatic checks are off by default. Enabling them contacts GitHub; it doesn’t upload your notes or enable cloud sync. Check manually above, or read What’s New below.' : 'Choose automatic checks here or check manually above. Downloads still need your action. What’s New below has the release notes.', interactive: true },
    { id: 'finish', section: 'All set', title: 'Your space is ready.', description: 'Keep writing or explore at your own pace. You can replay this tour from Settings → About.' },
  ];
}
