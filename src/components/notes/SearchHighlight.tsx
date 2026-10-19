import { searchTerms } from '../../features/notes/noteSearch';

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const terms = searchTerms(query);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark className="search-match" key={index}>{part}</mark> : part)}</>;
}

