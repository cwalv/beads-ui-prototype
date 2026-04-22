const PALETTE = [
  '#2f6fe8', '#2d7a4a', '#c36a1d', '#6f42c1',
  '#b23a3a', '#0e7490', '#7c3aed', '#0f766e',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function workspaceColor(name: string): string {
  return PALETTE[hashStr(name) % PALETTE.length];
}
