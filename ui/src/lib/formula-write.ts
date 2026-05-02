// Surgical TOML editor for formula files.
// Operates on line ranges found by scanning; preserves comments and formatting.

import { parseFormula } from './formula-parse';

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

// ── Step helpers ──

// extractStepDescription: pull the description value from a [[steps]] block at stepIndex.
export function extractStepDescription(src: string, stepIndex: number): string {
  const { stepRanges } = parseFormula(src);
  const range = stepRanges[stepIndex];
  if (!range) return '';
  const lines = src.split('\n');
  const stepLines = lines.slice(range.startLine, range.endLine + 1);
  for (let i = 0; i < stepLines.length; i++) {
    const t = stepLines[i].trim();
    if (i > 0 && t.startsWith('[') && !t.startsWith('#')) break;
    const tripleM = t.match(/^description\s*=\s*"""(.*)$/);
    if (tripleM) {
      const after = tripleM[1];
      const closeIdx = after.indexOf('"""');
      if (closeIdx !== -1) return after.slice(0, closeIdx).trim();
      const parts: string[] = after ? [after] : [];
      for (let j = i + 1; j < stepLines.length; j++) {
        const ci = stepLines[j].indexOf('"""');
        if (ci !== -1) { const before = stepLines[j].slice(0, ci); if (before) parts.push(before); break; }
        parts.push(stepLines[j]);
      }
      while (parts.length && parts[0].trim() === '') parts.shift();
      while (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
      return parts.join('\n');
    }
    const simpleM = t.match(/^description\s*=\s*"(.*)"$/);
    if (simpleM) return simpleM[1];
  }
  return '';
}

// writeStepField: set a field inside the [[steps]] block at stepIndex.
export function writeStepField(
  src: string,
  stepIndex: number,
  field: string,
  value: unknown,
): string {
  const parsed = parseFormula(src);
  const range = parsed.stepRanges[stepIndex];
  if (!range) return src;
  const lines = src.split('\n');
  const { startLine, endLine } = range;

  if (field === 'description') return _writeStepDescription(lines, startLine, endLine, value as string);
  if (field === 'needs') return _writeStepNeeds(lines, startLine, endLine, value as string[]);
  if (field === 'max_attempts' || field === 'on_exhausted') return _writeStepRetryField(lines, startLine, endLine, field, value as string | number);
  if (field === 'metadata') return _writeStepMetadata(lines, startLine, endLine, value as Record<string, unknown>);
  return _writeStepSimpleField(lines, startLine, endLine, field, value as string);
}

function _writeStepSimpleField(lines: string[], start: number, end: number, field: string, value: string): string {
  const newLine = `${field} = ${formatTomlValue(value)}`;
  const re = new RegExp(`^${field}\\s*=`);
  for (let i = start + 1; i <= end; i++) {
    const t = lines[i]?.trim() ?? '';
    if (t.startsWith('[') && !t.startsWith('#')) break;
    if (re.test(t)) { lines[i] = newLine; return lines.join('\n'); }
  }
  let ins = start + 1;
  while (ins <= end && (lines[ins]?.trim() ?? '').startsWith('#')) ins++;
  lines.splice(ins, 0, newLine);
  return lines.join('\n');
}

function _writeStepDescription(lines: string[], start: number, end: number, value: string): string {
  let descStart = -1, descEnd = -1;
  for (let i = start + 1; i <= end; i++) {
    const t = lines[i]?.trim() ?? '';
    if (t.startsWith('[') && !t.startsWith('#')) break;
    if (/^description\s*=\s*"""/.test(t)) {
      descStart = i;
      const after = t.slice(t.indexOf('"""') + 3);
      if (after.includes('"""')) { descEnd = i; }
      else { for (let j = i + 1; j <= end; j++) { if ((lines[j] ?? '').includes('"""')) { descEnd = j; break; } } }
      break;
    }
    if (/^description\s*=\s*"/.test(t)) { descStart = i; descEnd = i; break; }
  }
  const hasNewline = value.includes('\n');
  const newBlock = hasNewline ? [`description = """`, value, `"""`] : [`description = ${formatTomlValue(value)}`];
  if (descStart !== -1 && descEnd !== -1) {
    lines.splice(descStart, descEnd - descStart + 1, ...newBlock);
  } else {
    let ins = start + 1;
    while (ins <= end) {
      const t = lines[ins]?.trim() ?? '';
      if (!t || t.startsWith('#') || /^(id|title)\s*=/.test(t)) { ins++; continue; }
      break;
    }
    lines.splice(ins, 0, ...newBlock);
  }
  return lines.join('\n');
}

function _writeStepNeeds(lines: string[], start: number, end: number, value: string[]): string {
  const newLine = `needs = [${value.map(v => `"${v.replace(/"/g, '\\"')}"`).join(', ')}]`;
  const re = /^needs\s*=/;
  for (let i = start + 1; i <= end; i++) {
    const t = lines[i]?.trim() ?? '';
    if (t.startsWith('[') && !t.startsWith('#')) break;
    if (re.test(t)) { lines[i] = newLine; return lines.join('\n'); }
  }
  // Insert before first subsection header
  let ins = start + 1;
  while (ins <= end) {
    const t = lines[ins]?.trim() ?? '';
    if (t.startsWith('[') && !t.startsWith('#')) break;
    if (!t || t.startsWith('#') || /^(id|title|description)\s*=/.test(t) || t === '"""' || t.startsWith('description')) { ins++; continue; }
    break;
  }
  lines.splice(ins, 0, newLine);
  return lines.join('\n');
}

function _writeStepRetryField(lines: string[], start: number, end: number, field: string, value: string | number): string {
  let retryLine = -1;
  for (let i = start + 1; i <= end; i++) {
    if (/^\[steps\.retry\]/.test(lines[i]?.trim() ?? '')) { retryLine = i; break; }
  }
  const rawVal = typeof value === 'number' ? String(value) : (field === 'max_attempts' ? String(parseInt(String(value), 10)) : formatTomlValue(String(value)));
  const newLine = `${field} = ${rawVal}`;
  if (retryLine !== -1) {
    const re = new RegExp(`^${field}\\s*=`);
    for (let i = retryLine + 1; i <= end; i++) {
      const t = lines[i]?.trim() ?? '';
      if (t.startsWith('[') && !t.startsWith('#')) break;
      if (re.test(t)) { lines[i] = newLine; return lines.join('\n'); }
    }
    lines.splice(retryLine + 1, 0, newLine);
  } else {
    let ins = end + 1;
    while (ins > start + 1 && (lines[ins - 1]?.trim() ?? '') === '') ins--;
    lines.splice(ins, 0, '', '[steps.retry]', newLine);
  }
  return lines.join('\n');
}

function _writeStepMetadata(lines: string[], start: number, end: number, value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([k, v]) => `"${k}" = ${formatTomlValue(String(v))}`);
  const newLine = entries.length ? `metadata = { ${entries.join(', ')} }` : `metadata = {}`;
  const re = /^metadata\s*=/;
  for (let i = start + 1; i <= end; i++) {
    const t = lines[i]?.trim() ?? '';
    if (t.startsWith('[') && !t.startsWith('#')) break;
    if (re.test(t)) { lines[i] = newLine; return lines.join('\n'); }
  }
  let ins = end + 1;
  while (ins > start + 1 && (lines[ins - 1]?.trim() ?? '') === '') ins--;
  lines.splice(ins, 0, newLine);
  return lines.join('\n');
}

// renameStepId: rename a step's id and rewrite all `needs` references.
export function renameStepId(src: string, oldId: string, newId: string): string {
  if (oldId === newId || !oldId || !newId) return src;
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = src.split('\n');
  const idRe = new RegExp(`^id\\s*=\\s*"${escaped}"\\s*$`);
  const needsValRe = new RegExp(`"${escaped}"`, 'g');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (idRe.test(t)) { lines[i] = `id = "${newId}"`; continue; }
    if (/^needs\s*=/.test(t)) { lines[i] = lines[i].replace(needsValRe, `"${newId}"`); }
  }
  return lines.join('\n');
}

// addStep: append a new [[steps]] block, optionally after a given step index.
export function addStep(src: string, opts: { id: string; title?: string; afterIndex?: number }): string {
  const parsed = parseFormula(src);
  const lines = src.split('\n');
  const newBlock = [
    '',
    '[[steps]]',
    `id = "${opts.id}"`,
    ...(opts.title ? [`title = "${opts.title.replace(/"/g, '\\"')}"`] : ['']),
  ];
  let insertAt: number;
  if (opts.afterIndex !== undefined && parsed.stepRanges[opts.afterIndex]) {
    insertAt = parsed.stepRanges[opts.afterIndex].endLine + 1;
  } else if (parsed.stepRanges.length > 0) {
    insertAt = parsed.stepRanges[parsed.stepRanges.length - 1].endLine + 1;
  } else {
    insertAt = lines.length;
  }
  lines.splice(insertAt, 0, ...newBlock);
  return lines.join('\n');
}

// removeStep: remove the [[steps]] block at stepIndex and scrub its id from all needs.
export function removeStep(src: string, stepIndex: number): string {
  const parsed = parseFormula(src);
  const range = parsed.stepRanges[stepIndex];
  if (!range) return src;
  const removedId = parsed.steps[stepIndex]?.id ?? null;
  const lines = src.split('\n');
  let deleteFrom = range.startLine;
  while (deleteFrom > 0 && lines[deleteFrom - 1].trim() === '') deleteFrom--;
  lines.splice(deleteFrom, range.endLine - deleteFrom + 1);
  let result = lines.join('\n');
  if (removedId) result = _scrubFromNeeds(result, removedId);
  return result;
}

function _scrubFromNeeds(src: string, id: string): string {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = `"${esc}"`;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^needs\s*=/.test(lines[i].trim())) continue;
    let l = lines[i];
    l = l.replace(new RegExp(`,\\s*${quoted}`), '');
    l = l.replace(new RegExp(`${quoted}\\s*,\\s*`), '');
    l = l.replace(new RegExp(quoted), '');
    lines[i] = l;
  }
  return lines.join('\n');
}

// moveStep: reorder step blocks in source (visual order = source order).
export function moveStep(src: string, fromIndex: number, toIndex: number): string {
  if (fromIndex === toIndex) return src;
  const parsed = parseFormula(src);
  const { stepRanges } = parsed;
  if (fromIndex < 0 || fromIndex >= stepRanges.length) return src;
  if (toIndex < 0 || toIndex >= stepRanges.length) return src;

  const lines = src.split('\n');
  const fromRange = stepRanges[fromIndex];
  let blockStart = fromRange.startLine;
  while (blockStart > 0 && lines[blockStart - 1].trim() === '') blockStart--;
  const blockLines = lines.splice(blockStart, fromRange.endLine - blockStart + 1);

  // Re-parse with the block removed to get updated ranges
  const updated = parseFormula(lines.join('\n'));
  const effectiveTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
  const targetRange = updated.stepRanges[effectiveTo];
  if (!targetRange) { lines.splice(blockStart, 0, ...blockLines); return lines.join('\n'); }

  let insertAt: number;
  if (toIndex === 0) {
    insertAt = updated.stepRanges[0].startLine;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
  } else if (fromIndex < toIndex) {
    insertAt = targetRange.endLine + 1;
  } else {
    insertAt = targetRange.startLine;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
  }
  lines.splice(insertAt, 0, ...blockLines);
  return lines.join('\n');
}
