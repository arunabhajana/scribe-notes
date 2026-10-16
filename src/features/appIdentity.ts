export const appName = import.meta.env.DEV ? "Scribe Dev" : "Scribe";
export const buildLabel = import.meta.env.DEV ? "Development build" : "Production build";
export const appScheme = import.meta.env.DEV ? "com.scribe.notes.dev" : "com.scribe.notes";
export const authCallbackUrl = `${appScheme}://auth/callback`;
