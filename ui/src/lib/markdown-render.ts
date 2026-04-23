import { marked } from 'marked';
import { slugifyHeading } from './slugify';

const renderer = new marked.Renderer();

// Open external links in a new tab; keep internal links in-SPA
renderer.link = ({ href, text }) => {
  const isExternal = href.startsWith('http://') || href.startsWith('https://');
  // Convert .md links to /docs/ routes
  const mdMatch = href.match(/^(?:\.\/)?([A-Za-z0-9_-]+)\.md(#.*)?$/);
  if (mdMatch) {
    const slug = mdMatch[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const hash = mdMatch[2] ?? '';
    return `<a href="/docs/${slug}${hash}">${text}</a>`;
  }
  if (isExternal) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return `<a href="${href}">${text}</a>`;
};

// Add id anchors to headings for hash navigation
renderer.heading = ({ text, depth }) => {
  const slug = slugifyHeading(text);
  return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
};

marked.use({ renderer });

export function renderMarkdown(src: string): string {
  return marked.parse(src) as string;
}
