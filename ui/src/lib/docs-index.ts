import ARCHITECTURE from '../../../docs/ARCHITECTURE.md?raw';
import BEADS_CLAUDE from '../../../docs/beads-CLAUDE.md?raw';
import BEADS_README from '../../../docs/beads-README.md?raw';
import CLI_REFERENCE from '../../../docs/CLI_REFERENCE.md?raw';
import CONFIG from '../../../docs/CONFIG.md?raw';
import FORMULAS from '../../../docs/formulas.md?raw';
import LABELS from '../../../docs/LABELS.md?raw';
import METADATA from '../../../docs/METADATA.md?raw';
import MOLECULES from '../../../docs/MOLECULES.md?raw';

export interface DocEntry {
  slug: string;       // URL-safe name (matches the import key)
  filename: string;   // e.g. ARCHITECTURE.md
  title: string;      // first H1 found in the file
  brief: string;      // first non-empty paragraph after the title
  anchors: string[];  // all heading slugs
  raw: string;
}

function headingToSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function parseDoc(filename: string, raw: string): DocEntry {
  const lines = raw.split('\n');
  let title = filename.replace(/\.md$/, '');
  let brief = '';
  const anchors: string[] = [];
  let foundTitle = false;
  let paraLines: string[] = [];

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    if (h1 && !foundTitle) {
      title = h1[1].trim();
      foundTitle = true;
      continue;
    }
    const hN = line.match(/^#{1,6}\s+(.+)/);
    if (hN) {
      anchors.push(headingToSlug(hN[1]));
      if (brief && paraLines.length > 0) {
        brief = paraLines.join(' ').trim();
        paraLines = [];
      }
      continue;
    }
    if (!brief && foundTitle) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('**For:**') && !trimmed.startsWith('---')) {
        paraLines.push(trimmed);
      } else if (paraLines.length > 0 && !trimmed) {
        brief = paraLines.join(' ').trim().replace(/^[*_]|[*_]$/g, '');
        paraLines = [];
      }
    }
  }
  if (!brief && paraLines.length > 0) {
    brief = paraLines.join(' ').trim();
  }
  // strip markdown bold/italic from brief
  brief = brief.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').slice(0, 120);

  const slug = filename.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9-]/g, '-');
  return { slug, filename, title, brief, anchors, raw };
}

const RAW_DOCS: [string, string][] = [
  ['ARCHITECTURE.md', ARCHITECTURE],
  ['beads-CLAUDE.md', BEADS_CLAUDE],
  ['beads-README.md', BEADS_README],
  ['CLI_REFERENCE.md', CLI_REFERENCE],
  ['CONFIG.md', CONFIG],
  ['formulas.md', FORMULAS],
  ['LABELS.md', LABELS],
  ['METADATA.md', METADATA],
  ['MOLECULES.md', MOLECULES],
];

export const DOC_ENTRIES: DocEntry[] = RAW_DOCS.map(([fn, raw]) => parseDoc(fn, raw));

export const DOC_TOTAL_ANCHORS = DOC_ENTRIES.reduce((n, d) => n + d.anchors.length, 0);

export function getDocBySlug(slug: string): DocEntry | null {
  // Try exact slug match, then case-insensitive filename match
  return (
    DOC_ENTRIES.find(d => d.slug === slug) ??
    DOC_ENTRIES.find(d => d.filename.toLowerCase().replace(/\.md$/, '') === slug.toLowerCase()) ??
    null
  );
}

export function getDocByFilename(filename: string): DocEntry | null {
  return DOC_ENTRIES.find(d => d.filename === filename) ?? null;
}
