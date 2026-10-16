export const changeTypes = ['feature', 'improved', 'fixed', 'security', 'changed'] as const;
export type ChangeType = typeof changeTypes[number];
export type Changelog = {
  schemaVersion: 1;
  version: string;
  title: string;
  summary: string;
  sections: { type: ChangeType; items: string[] }[];
};

export function parseChangelog(input: unknown, expectedVersion?: string): Changelog {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid changelog.');
  const value = input as Record<string, unknown>;
  const text = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  const version = typeof value.version === 'string' && value.version.length <= 80
    ? value.version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/) : null;
  if (value.schemaVersion !== 1 || !text(value.version, 80) ||
      !version || version[0] !== value.version || version[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')) ||
      (expectedVersion !== undefined && value.version !== expectedVersion) ||
      !text(value.title, 100) || !text(value.summary, 240) ||
      !Array.isArray(value.sections) || !value.sections.length || value.sections.length > 5) {
    throw new Error('Changelog requires a matching version, title, brief summary and sections.');
  }
  const seen = new Set<string>();
  const sections = value.sections.map((section: unknown) => {
    if (!section || typeof section !== 'object') throw new Error('Invalid changelog section.');
    const s = section as Record<string, unknown>;
    if (!changeTypes.includes(s.type as ChangeType) || seen.has(s.type as string) ||
        !Array.isArray(s.items) || !s.items.length || s.items.length > 20 || !s.items.every(item => text(item, 500))) {
      throw new Error('Use unique supported changelog types and 1–20 short items per section.');
    }
    seen.add(s.type as string);
    return { type: s.type as ChangeType, items: s.items as string[] };
  });
  return { schemaVersion: 1, version: value.version as string, title: value.title as string, summary: value.summary as string, sections };
}

export function changelogMarkdown(log: Changelog): string {
  return `# ${log.title}\n\n${log.summary}\n\n${log.sections.map(section =>
    `## ${section.type[0].toUpperCase()}${section.type.slice(1)}\n\n${section.items.map(item => `- ${item}`).join('\n')}`
  ).join('\n\n')}\n`;
}
