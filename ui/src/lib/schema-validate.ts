// Light schema-driven validation. Layered on top of parseFormula's syntactic
// errors. Conservative by design — reports things we're highly confident
// about, leaves gray areas alone.

import type { FormulaSchema, SchemaField } from '../client/schema';
import type { ParseError, ParsedFormula } from './formula-parse';

export function validateAgainstSchema(parsed: ParsedFormula, schema: FormulaSchema): ParseError[] {
  const errs: ParseError[] = [];

  // Required top-level fields
  for (const f of schema.topLevel) {
    if (f.required && !(f.key in parsed.header)) {
      errs.push({ msg: `missing required top-level field "${f.key}"` });
    }
  }

  // Step-level required fields + strict enums
  parsed.steps.forEach((step, i) => {
    const stepN = `step ${i + 1}${step.id ? ` (${step.id})` : ''}`;
    for (const f of schema.step) {
      if (f.required) {
        const has = (f.key === 'id' && !!step.id) || (f.key === 'title' && !!step.title);
        // Other required step fields aren't tracked by parseFormula's Step shape;
        // we only validate the ones we can see.
        if ((f.key === 'id' || f.key === 'title') && !has) {
          errs.push({ msg: `${stepN}: missing required field "${f.key}"` });
        }
      }
    }
    // Strict enum check for retry.on_exhausted (the only step-level enum
    // currently surfaced in the parsed Step shape).
    if (step.retry?.on_exhausted) {
      const f = schema.step.find(s => s.key === 'on_exhausted');
      if (f?.enumStrict && f.enum && !f.enum.includes(step.retry.on_exhausted)) {
        errs.push({
          msg: `${stepN}: on_exhausted="${step.retry.on_exhausted}" not in {${f.enum.join(', ')}}`,
        });
      }
    }
  });

  return errs;
}

// Look up a schema field by key (top-level or step). For future hover-help.
export function findSchemaField(
  schema: FormulaSchema,
  key: string,
  scope: 'topLevel' | 'step' | 'var',
): SchemaField | undefined {
  return schema[scope].find(f => f.key === key);
}
