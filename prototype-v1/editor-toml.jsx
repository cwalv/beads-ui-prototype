// Tiny TOML parser — enough to extract steps (id, title, needs, metadata keys) + vars.
// NOT a full TOML impl; tuned for formula files.
//
// Also exposes `writeVar(src, name, value)` — surgical text replacement on the
// `default = "..."` line of [vars.NAME], preserving everything else.

function parseFormula(src) {
  const lines = src.split("\n");
  const errors = [];
  const vars = {};
  const steps = [];
  const header = {};

  // Rough line classifier
  let ctx = null;         // null | "vars.NAME" | "steps[i]" | "steps[i].retry" | "doc-block"
  let stepIdx = -1;
  let docDepth = 0;

  // Track multi-line triple-quoted strings so we don't mis-parse inside them
  let inTriple = false;
  let tripleKind = null;  // '"""' | "'''"

  // Track [[steps]] start lines so editor can jump to them
  const stepRanges = [];  // { id, startLine, endLine }

  const keyRe = /^([A-Za-z_][A-Za-z0-9_\-.]*)\s*=\s*(.*)$/;
  const sectionRe = /^\[\[?\s*([A-Za-z_][A-Za-z0-9_\-.]*)(?:\.([A-Za-z_][A-Za-z0-9_\-.]*))?\s*\]?\]$/;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Triple-quote tracking (handles description = """ ... """ at top)
    if (inTriple) {
      if (line.endsWith(tripleKind)) { inTriple = false; tripleKind = null; }
      continue;
    }
    if (/"""|'''/.test(raw)) {
      const m = raw.match(/("""|''')/);
      const close = raw.indexOf(m[0], raw.indexOf(m[0]) + 3);
      if (close === -1) { inTriple = true; tripleKind = m[0]; continue; }
    }

    if (!line || line.startsWith("#")) continue;

    // Section headers
    if (line.startsWith("[")) {
      const isArray = line.startsWith("[[");
      const inner = line.replace(/^\[+|\]+$/g, "").trim();
      const parts = inner.split(".");

      // Close out previous step range
      if (ctx && ctx.startsWith("steps[") && parts[0] !== "steps" && !(parts[0] === "steps" && parts.length > 1)) {
        if (stepIdx >= 0 && stepRanges[stepIdx]) stepRanges[stepIdx].endLine = i - 1;
      }

      if (isArray && parts[0] === "steps") {
        stepIdx++;
        steps[stepIdx] = { id: null, title: null, needs: [], metadata: {}, retry: null };
        ctx = `steps[${stepIdx}]`;
        if (stepRanges[stepIdx - 1]) stepRanges[stepIdx - 1].endLine = i - 1;
        stepRanges[stepIdx] = { id: null, startLine: i, endLine: lines.length - 1 };
      } else if (!isArray && parts[0] === "steps" && parts[1] === "retry" && stepIdx >= 0) {
        ctx = `steps[${stepIdx}].retry`;
        steps[stepIdx].retry = steps[stepIdx].retry || {};
      } else if (!isArray && parts[0] === "vars" && parts[1]) {
        ctx = `vars.${parts[1]}`;
        vars[parts[1]] = vars[parts[1]] || { name: parts[1], description: "", required: false, default: null, startLine: i, endLine: lines.length - 1 };
      } else if (!isArray && parts[0] === "vars" && !parts[1]) {
        ctx = "vars";
      } else {
        ctx = inner;
      }
      continue;
    }

    // Key = value
    const m = line.match(keyRe);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();

    // Strip inline comments (carefully — don't cut strings)
    if (!val.startsWith('"') && !val.startsWith("'") && val.includes("#")) {
      val = val.slice(0, val.indexOf("#")).trim();
    }

    const parsedVal = parseValue(val);

    // Top-level
    if (!ctx || ctx === "" ) {
      header[key] = parsedVal;
      continue;
    }

    if (ctx.startsWith("vars.")) {
      const vname = ctx.slice(5);
      const v = vars[vname];
      if (!v) continue;
      if (key === "description") v.description = parsedVal;
      if (key === "required") v.required = parsedVal === true;
      if (key === "default") v.default = parsedVal;
      v.endLine = i;
    } else if (ctx.startsWith("steps[") && !ctx.endsWith(".retry")) {
      const s = steps[stepIdx];
      if (key === "id") {
        s.id = parsedVal;
        if (stepRanges[stepIdx]) stepRanges[stepIdx].id = parsedVal;
      }
      if (key === "title") s.title = parsedVal;
      if (key === "needs" && Array.isArray(parsedVal)) s.needs = parsedVal;
      if (key === "metadata" && typeof parsedVal === "object" && parsedVal !== null) s.metadata = parsedVal;
    } else if (ctx.endsWith(".retry")) {
      const s = steps[stepIdx];
      s.retry = s.retry || {};
      if (key === "max_attempts") s.retry.max_attempts = parsedVal;
      if (key === "on_exhausted") s.retry.on_exhausted = parsedVal;
    }
  }

  // Close out final step range
  if (stepIdx >= 0 && stepRanges[stepIdx]) {
    stepRanges[stepIdx].endLine = lines.length - 1;
  }

  // Validate: no step without id, needs references exist, no cycles
  const ids = new Set(steps.map(s => s.id).filter(Boolean));
  steps.forEach((s, idx) => {
    if (!s.id) errors.push({ line: stepRanges[idx]?.startLine, msg: `[[steps]] #${idx} missing id` });
    s.needs.forEach(n => {
      if (!ids.has(n)) errors.push({ line: stepRanges[idx]?.startLine, msg: `step "${s.id}" needs unknown "${n}"` });
    });
  });
  const cycles = findCycles(steps);
  cycles.forEach(ids => errors.push({ msg: `cycle: ${ids.join(" → ")}`, cycle: ids }));

  return { header, vars, steps, stepRanges, errors, cycles, lineCount: lines.length };
}

function parseValue(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
  if (val.startsWith("[") && val.endsWith("]")) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    // Split on commas that aren't inside quotes
    const parts = [];
    let depth = 0, cur = "", inStr = null;
    for (const ch of inner) {
      if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
      if (ch === "[" || ch === "{") depth++;
      if (ch === "]" || ch === "}") depth--;
      if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map(parseValue);
  }
  if (val.startsWith("{") && val.endsWith("}")) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return {};
    // Inline-table parse — crude
    const out = {};
    const parts = [];
    let depth = 0, cur = "", inStr = null;
    for (const ch of inner) {
      if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    parts.forEach(p => {
      const eq = p.indexOf("=");
      if (eq === -1) return;
      let k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
      out[k] = parseValue(v);
    });
    return out;
  }
  return val;
}

function findCycles(steps) {
  const byId = Object.fromEntries(steps.filter(s => s.id).map(s => [s.id, s]));
  const cycles = [];
  const color = {}; // 0 = white, 1 = grey, 2 = black
  const path = [];

  function dfs(id) {
    if (color[id] === 1) {
      const start = path.indexOf(id);
      if (start >= 0) cycles.push([...path.slice(start), id]);
      return;
    }
    if (color[id] === 2) return;
    color[id] = 1;
    path.push(id);
    const s = byId[id];
    if (s) s.needs.forEach(n => { if (byId[n]) dfs(n); });
    path.pop();
    color[id] = 2;
  }
  Object.keys(byId).forEach(id => { if (!color[id]) dfs(id); });
  return cycles;
}

// ── Surgical writer for var defaults ──
// Replaces the `default = "..."` line inside [vars.NAME] with a new value.
// If no `default` exists, inserts one. Preserves everything else.
function writeVarDefault(src, name, newValue) {
  const lines = src.split("\n");
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

  // Find existing default line
  let defLine = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (/^default\s*=/.test(lines[i].trim())) { defLine = i; break; }
  }

  const formatted = formatTomlValue(newValue);
  const newText = `default = ${formatted}`;

  if (defLine !== -1) {
    lines[defLine] = newText;
  } else {
    // Insert before first blank/new-section line at end of section
    let insertAt = sectionEnd;
    // Back up past trailing blanks
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") insertAt--;
    lines.splice(insertAt, 0, newText);
  }
  return lines.join("\n");
}

function formatTomlValue(v) {
  if (typeof v === "boolean") return `"${v}"`; // Formula convention: strings
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
  return `"${String(v)}"`;
}

// ── Syntax highlighter for overlay rendering ──
// Returns an array of {line, segments: [{text, cls}]}.
function highlightLines(src) {
  const lines = src.split("\n");
  let inTriple = false;
  return lines.map(line => {
    if (inTriple) {
      if (/"""|'''/.test(line)) inTriple = false;
      return [{ text: line, cls: "t-com" }];
    }
    if (/"""|'''/.test(line) && !line.match(/""".*"""|'''.*'''/)) {
      inTriple = true;
      return [{ text: line, cls: "t-com" }];
    }
    const segs = [];
    // Comments
    const hashIdx = findUnquotedHash(line);
    const code = hashIdx === -1 ? line : line.slice(0, hashIdx);
    const comment = hashIdx === -1 ? "" : line.slice(hashIdx);

    // Section headers
    if (/^\s*\[/.test(code)) {
      segs.push({ text: code, cls: "t-sec" });
      if (comment) segs.push({ text: comment, cls: "t-com" });
      return segs;
    }

    // key = value
    const m = code.match(/^(\s*)([A-Za-z_][A-Za-z0-9_\-.]*)(\s*=\s*)(.*)$/);
    if (m) {
      if (m[1]) segs.push({ text: m[1], cls: "" });
      segs.push({ text: m[2], cls: "t-key" });
      segs.push({ text: m[3], cls: "t-op" });
      segs.push(...highlightValue(m[4]));
      if (comment) segs.push({ text: comment, cls: "t-com" });
      return segs;
    }

    segs.push({ text: code, cls: "" });
    if (comment) segs.push({ text: comment, cls: "t-com" });
    return segs;
  });
}

function findUnquotedHash(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) { if (c === inStr && line[i - 1] !== "\\") inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "#") return i;
  }
  return -1;
}

function highlightValue(v) {
  const out = [];
  let rest = v;

  // Strings
  const strM = rest.match(/^"([^"\\]|\\.)*"/);
  if (strM) {
    // Highlight {{var}} inside
    const str = strM[0];
    const parts = str.split(/(\{\{[^}]+\}\})/);
    parts.forEach(p => {
      if (/^\{\{/.test(p)) out.push({ text: p, cls: "t-var" });
      else out.push({ text: p, cls: "t-str" });
    });
    out.push({ text: rest.slice(strM[0].length), cls: "" });
    return out;
  }
  if (/^(true|false)\b/.test(rest)) {
    const m = rest.match(/^(true|false)/);
    out.push({ text: m[0], cls: "t-bool" });
    out.push({ text: rest.slice(m[0].length), cls: "" });
    return out;
  }
  if (/^-?\d/.test(rest)) {
    const m = rest.match(/^-?[\d.]+/);
    out.push({ text: m[0], cls: "t-num" });
    out.push({ text: rest.slice(m[0].length), cls: "" });
    return out;
  }
  // Arrays / inline tables — recurse crudely
  if (rest.startsWith("[") || rest.startsWith("{")) {
    // Split on strings vs rest
    const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|(true|false)\b|(-?\d+(?:\.\d+)?)\b/g;
    let last = 0, m;
    while ((m = re.exec(rest)) !== null) {
      if (m.index > last) out.push({ text: rest.slice(last, m.index), cls: "" });
      const tok = m[0];
      if (/^"|^'/.test(tok)) {
        const parts = tok.split(/(\{\{[^}]+\}\})/);
        parts.forEach(p => {
          if (/^\{\{/.test(p)) out.push({ text: p, cls: "t-var" });
          else out.push({ text: p, cls: "t-str" });
        });
      } else if (/^(true|false)/.test(tok)) out.push({ text: tok, cls: "t-bool" });
      else out.push({ text: tok, cls: "t-num" });
      last = m.index + tok.length;
    }
    if (last < rest.length) out.push({ text: rest.slice(last), cls: "" });
    return out;
  }

  out.push({ text: rest, cls: "" });
  return out;
}

// Resolve {{var}} placeholders against a var-values map.
function resolveVars(str, vars) {
  return String(str).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k) => {
    if (vars[k] !== undefined && vars[k] !== "") return vars[k];
    return m; // leave unresolved
  });
}

Object.assign(window, { parseFormula, writeVarDefault, highlightLines, resolveVars });
