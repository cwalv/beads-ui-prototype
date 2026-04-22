// Surgical TOML editor for formula var defaults.
// Replaces `default = "..."` inside [vars.NAME], preserving everything else.

export function writeVarDefault(src: string, name: string, newValue: string | number | boolean): string {
  const lines = src.split('\n');
  const sectionRe = new RegExp(`^\\[vars\\.${name}\\s*\\]\\s*$`);
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i].trim())) { sectionStart = i; break; }
  }
  if (sectionStart === -1) return src;

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^\[/.test(lines[i].trim())) { sectionEnd = i; break; }
  }

  let defLine = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (/^default\s*=/.test(lines[i].trim())) { defLine = i; break; }
  }

  const newText = `default = ${formatTomlValue(newValue)}`;

  if (defLine !== -1) {
    lines[defLine] = newText;
  } else {
    let insertAt = sectionEnd;
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, newText);
  }
  return lines.join('\n');
}

export function formatTomlValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return `"${v}"`;
  if (typeof v === 'number') return String(v);
  return `"${v.replace(/"/g, '\\"')}"`;
}
