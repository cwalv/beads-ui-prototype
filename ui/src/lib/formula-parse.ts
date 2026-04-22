// Tiny TOML parser tuned for .formula.toml files.
// NOT a full TOML impl — only extracts the fields the UI needs.

export interface VarDef {
  name: string;
  description: string;
  required: boolean;
  default: string | number | boolean | null;
  startLine: number;
  endLine: number;
}

export interface StepRetry {
  max_attempts?: number;
  on_exhausted?: string;
}

export interface Step {
  id: string | null;
  title: string | null;
  needs: string[];
  metadata: Record<string, unknown>;
  retry: StepRetry | null;
}

export interface StepRange {
  id: string | null;
  startLine: number;
  endLine: number;
}

export interface ParseError {
  line?: number;
  msg: string;
  cycle?: string[];
}

export interface FormulaHeader {
  formula?: string;
  version?: number | string;
  extends?: string;
  [key: string]: unknown;
}

export interface ParsedFormula {
  header: FormulaHeader;
  vars: Record<string, VarDef>;
  steps: Step[];
  stepRanges: StepRange[];
  errors: ParseError[];
  cycles: string[][];
  lineCount: number;
}

const keyRe = /^([A-Za-z_][A-Za-z0-9_\-.]*)\s*=\s*(.*)$/;

export function parseFormula(src: string): ParsedFormula {
  const lines = src.split('\n');
  const errors: ParseError[] = [];
  const vars: Record<string, VarDef> = {};
  const steps: Step[] = [];
  const header: FormulaHeader = {};

  let ctx: string | null = null;
  let stepIdx = -1;
  let inTriple = false;
  let tripleKind: string | null = null;
  const stepRanges: StepRange[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (inTriple) {
      if (tripleKind && line.endsWith(tripleKind)) { inTriple = false; tripleKind = null; }
      continue;
    }
    if (/"""|'''/.test(raw)) {
      const m = raw.match(/("""|''')/);
      if (m) {
        const close = raw.indexOf(m[0], raw.indexOf(m[0]) + 3);
        if (close === -1) { inTriple = true; tripleKind = m[0]; continue; }
      }
    }

    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('[')) {
      const isArray = line.startsWith('[[');
      const inner = line.replace(/^\[+|\]+$/g, '').trim();
      const parts = inner.split('.');

      if (ctx && ctx.startsWith('steps[') && parts[0] !== 'steps') {
        if (stepIdx >= 0 && stepRanges[stepIdx]) stepRanges[stepIdx].endLine = i - 1;
      }

      if (isArray && parts[0] === 'steps') {
        stepIdx++;
        steps[stepIdx] = { id: null, title: null, needs: [], metadata: {}, retry: null };
        ctx = `steps[${stepIdx}]`;
        if (stepRanges[stepIdx - 1]) stepRanges[stepIdx - 1].endLine = i - 1;
        stepRanges[stepIdx] = { id: null, startLine: i, endLine: lines.length - 1 };
      } else if (!isArray && parts[0] === 'steps' && parts[1] === 'retry' && stepIdx >= 0) {
        ctx = `steps[${stepIdx}].retry`;
        if (!steps[stepIdx].retry) steps[stepIdx].retry = {};
      } else if (!isArray && parts[0] === 'vars' && parts[1]) {
        ctx = `vars.${parts[1]}`;
        if (!vars[parts[1]]) {
          vars[parts[1]] = { name: parts[1], description: '', required: false, default: null, startLine: i, endLine: lines.length - 1 };
        }
      } else if (!isArray && parts[0] === 'vars' && !parts[1]) {
        ctx = 'vars';
      } else {
        ctx = inner;
      }
      continue;
    }

    const m = line.match(keyRe);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();

    if (!val.startsWith('"') && !val.startsWith("'") && val.includes('#')) {
      val = val.slice(0, val.indexOf('#')).trim();
    }

    const parsedVal = parseValue(val);

    if (!ctx || ctx === '') {
      (header as Record<string, unknown>)[key] = parsedVal;
      continue;
    }

    if (ctx.startsWith('vars.')) {
      const vname = ctx.slice(5);
      const v = vars[vname];
      if (!v) continue;
      if (key === 'description') v.description = String(parsedVal);
      if (key === 'required') v.required = parsedVal === true;
      if (key === 'default') v.default = parsedVal as VarDef['default'];
      v.endLine = i;
    } else if (ctx.startsWith('steps[') && !ctx.endsWith('.retry')) {
      const s = steps[stepIdx];
      if (key === 'id') {
        s.id = String(parsedVal);
        if (stepRanges[stepIdx]) stepRanges[stepIdx].id = String(parsedVal);
      }
      if (key === 'title') s.title = String(parsedVal);
      if (key === 'needs' && Array.isArray(parsedVal)) s.needs = parsedVal.map(String);
      if (key === 'metadata' && typeof parsedVal === 'object' && parsedVal !== null) s.metadata = parsedVal as Record<string, unknown>;
    } else if (ctx.endsWith('.retry')) {
      const s = steps[stepIdx];
      if (!s.retry) s.retry = {};
      if (key === 'max_attempts') s.retry.max_attempts = Number(parsedVal);
      if (key === 'on_exhausted') s.retry.on_exhausted = String(parsedVal);
    }
  }

  if (stepIdx >= 0 && stepRanges[stepIdx]) {
    stepRanges[stepIdx].endLine = lines.length - 1;
  }

  const ids = new Set(steps.map(s => s.id).filter(Boolean));
  steps.forEach((s, idx) => {
    if (!s.id) errors.push({ line: stepRanges[idx]?.startLine, msg: `[[steps]] #${idx} missing id` });
    s.needs.forEach(n => {
      if (!ids.has(n)) errors.push({ line: stepRanges[idx]?.startLine, msg: `step "${s.id}" needs unknown "${n}"` });
    });
  });
  const cycles = findCycles(steps);
  cycles.forEach(c => errors.push({ msg: `cycle: ${c.join(' → ')}`, cycle: c }));

  return { header, vars, steps, stepRanges, errors, cycles, lineCount: lines.length };
}

export function parseValue(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    const parts: string[] = [];
    let depth = 0, cur = '', inStr: string | null = null;
    for (const ch of inner) {
      if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map(parseValue);
  }
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return {};
    const out: Record<string, unknown> = {};
    const parts: string[] = [];
    let depth = 0, cur = '', inStr: string | null = null;
    for (const ch of inner) {
      if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    parts.forEach(p => {
      const eq = p.indexOf('=');
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

export function findCycles(steps: Step[]): string[][] {
  const byId = Object.fromEntries(steps.filter(s => s.id).map(s => [s.id!, s]));
  const cycles: string[][] = [];
  const color: Record<string, number> = {};
  const path: string[] = [];

  function dfs(id: string) {
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

export function resolveVars(str: string, vars: Record<string, string>): string {
  return String(str).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k) => {
    if (vars[k] !== undefined && vars[k] !== '') return vars[k];
    return m;
  });
}
