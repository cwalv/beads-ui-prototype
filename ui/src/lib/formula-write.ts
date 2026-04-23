// Surgical TOML editor for formula files.
// Operates on line ranges found by scanning; preserves comments and formatting.

export function writeVarDefault(src: string, name: string, newValue: string | number | boolean): string {
  return writeVarField(src, name, 'default', newValue);
}

export function formatTomlValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return `"${v}"`;
  if (typeof v === 'number') return String(v);
  return `"${v.replace(/"/g, '\\"')}"`;
}

// writeVarField: set any field (default, description, required) inside [vars.NAME].
// For `required`: value=true writes `required = true`; value=false removes the line.
export function writeVarField(
  src: string,
  varName: string,
  field: string,
  value: string | number | boolean,
): string {
  const lines = src.split('\n');
  const sectionRe = new RegExp(`^\\[vars\\.${varName}\\s*\\]\\s*$`);
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i].trim())) { sectionStart = i; break; }
  }
  if (sectionStart === -1) return src;

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^\[/.test(lines[i].trim())) { sectionEnd = i; break; }
  }

  const fieldRe = new RegExp(`^${field}\\s*=`);
  let fieldLine = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (fieldRe.test(lines[i].trim())) { fieldLine = i; break; }
  }

  // `required = false` → remove the line entirely (absence = false in TOML)
  if (field === 'required' && value === false) {
    if (fieldLine !== -1) lines.splice(fieldLine, 1);
    return lines.join('\n');
  }

  const rawVal = field === 'required' ? 'true' : formatTomlValue(value as string | number | boolean);
  const newText = `${field} = ${rawVal}`;

  if (fieldLine !== -1) {
    lines[fieldLine] = newText;
  } else {
    let insertAt = sectionEnd;
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, newText);
  }
  return lines.join('\n');
}

// writeTopLevel: replace or insert a simple top-level key=value (before any [section]).
// Handles string, number, boolean, and string[] values.
export function writeTopLevel(
  src: string,
  key: string,
  value: string | number | boolean | string[],
): string {
  const lines = src.split('\n');

  // End of top-level section = first line starting with '[' (not a comment)
  let topEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('[') && !t.startsWith('#')) { topEnd = i; break; }
  }

  const newVal = Array.isArray(value)
    ? `[${value.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(', ')}]`
    : formatTomlValue(value as string | number | boolean);
  const newLine = `${key} = ${newVal}`;

  const keyRe = new RegExp(`^${key}\\s*=`);
  for (let i = 0; i < topEnd; i++) {
    if (keyRe.test(lines[i].trim())) {
      lines[i] = newLine;
      return lines.join('\n');
    }
  }

  // Not found — insert just before first [section] (after a blank line gap if needed)
  const insertAt = topEnd;
  lines.splice(insertAt, 0, newLine);
  return lines.join('\n');
}

// writeDescription: replace or insert `description = """..."""` in the top-level section.
// Handles both existing triple-quoted and simple quoted forms.
export function writeDescription(src: string, value: string): string {
  const lines = src.split('\n');

  // Locate top-level boundary
  let topEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('[') && !t.startsWith('#')) { topEnd = i; break; }
  }

  let descStart = -1;
  let descEnd = -1;
  for (let i = 0; i < topEnd; i++) {
    const t = lines[i].trim();
    if (/^description\s*=\s*"""/.test(t)) {
      descStart = i;
      // Check if closing """ is on the same line
      const after = t.slice(t.indexOf('"""') + 3);
      if (after.includes('"""')) {
        descEnd = i;
      } else {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].includes('"""')) { descEnd = j; break; }
        }
      }
      break;
    }
    if (/^description\s*=\s*"/.test(t)) {
      descStart = i;
      descEnd = i;
      break;
    }
  }

  const hasNewline = value.includes('\n');
  const newBlock = hasNewline
    ? [`description = """`, value, `"""`]
    : [`description = ${formatTomlValue(value)}`];

  if (descStart !== -1 && descEnd !== -1) {
    lines.splice(descStart, descEnd - descStart + 1, ...newBlock);
  } else {
    // Insert at start of top-level section
    lines.splice(0, 0, ...newBlock, '');
  }
  return lines.join('\n');
}

// addVar: append a new [vars.NAME] section after the last existing [vars.*] section.
export function addVar(src: string, varName: string): string {
  const lines = src.split('\n');

  // Find the end of the last [vars.*] section (or [vars] header block)
  let lastVarSectionEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^\[vars/.test(t)) {
      // Scan forward to find the end of this section
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\[/.test(lines[j].trim())) {
          lastVarSectionEnd = j;
          break;
        }
        if (j === lines.length - 1) lastVarSectionEnd = lines.length;
      }
      // Keep scanning — want the LAST vars section end
    }
  }

  const newSection = ['', `[vars.${varName}]`, `description = ""`];

  if (lastVarSectionEnd === -1) {
    // No vars section; append before [[steps]] or at end
    let stepsStart = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (/^\[\[steps\]\]/.test(lines[i].trim())) { stepsStart = i; break; }
    }
    lines.splice(stepsStart, 0, ...newSection);
  } else {
    // Trim trailing blank lines at section end before inserting
    let insertAt = lastVarSectionEnd;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, ...newSection);
  }
  return lines.join('\n');
}

// removeVar: remove the entire [vars.NAME] section (including trailing blank lines).
export function removeVar(src: string, varName: string): string {
  const lines = src.split('\n');
  const sectionRe = new RegExp(`^\\[vars\\.${varName}\\s*\\]\\s*$`);
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i].trim())) { sectionStart = i; break; }
  }
  if (sectionStart === -1) return src;

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^\[/.test(lines[i].trim())) { sectionEnd = i; break; }
  }

  // Pull back over any blank lines that precede this section
  let deleteFrom = sectionStart;
  while (deleteFrom > 0 && lines[deleteFrom - 1].trim() === '') deleteFrom--;

  lines.splice(deleteFrom, sectionEnd - deleteFrom);
  return lines.join('\n');
}

// extractDescription: pull the value from `description = """..."""` or `description = "..."`.
// Returns empty string when not found.
export function extractDescription(src: string): string {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // Stop at first section header
    if (t.startsWith('[') && !t.startsWith('#')) break;

    const tripleM = t.match(/^description\s*=\s*"""(.*)$/);
    if (tripleM) {
      const after = tripleM[1];
      // Closing """ on the same line?
      const closeIdx = after.indexOf('"""');
      if (closeIdx !== -1) return after.slice(0, closeIdx).trim();
      // Multi-line: collect lines until closing """
      const parts: string[] = after ? [after] : [];
      for (let j = i + 1; j < lines.length; j++) {
        const ci = lines[j].indexOf('"""');
        if (ci !== -1) {
          const before = lines[j].slice(0, ci);
          if (before) parts.push(before);
          break;
        }
        parts.push(lines[j]);
      }
      // Trim leading/trailing blank lines
      while (parts.length && parts[0].trim() === '') parts.shift();
      while (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
      return parts.join('\n');
    }

    const simpleM = t.match(/^description\s*=\s*"(.*)"$/);
    if (simpleM) return simpleM[1];
  }
  return '';
}
