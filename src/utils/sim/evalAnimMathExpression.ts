/**
 * Minimal evaluator for anim MathExpressionFloat strings seen in graphs
 * (clamp, max, min, abs, comparisons, arithmetic, & |).
 * Not a full RED expressionToolkit port.
 *
 * Engine `&` / `|` (expressionToolkit_opRegistry LogicalOperations) are logical,
 * not bitwise: operand > eps → 1 else 0. Mapped to JS `&&` / `||` + Number().
 */

const SAFE_EXPR = /^[\d\s+\-*/().,_<>=!&|%a-zA-Z]+$/
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g

const BUILTINS: Record<string, (...args: number[]) => number> = {
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  max: (...args) => Math.max(...args),
  min: (...args) => Math.min(...args),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
}

const BUILTIN_NAMES = new Set(Object.keys(BUILTINS).map((n) => n.toLowerCase()))

function isBuiltinIdent(name: string): boolean {
  return BUILTIN_NAMES.has(name.toLowerCase())
}

/** Identifiers in expression order (skip clamp/max/…); matches AutoRegisterVar. */
export function listMathExprIdents(expression: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of expression.matchAll(IDENT_RE)) {
    const n = m[0]!
    if (isBuiltinIdent(n) || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function lookupVar(vars: Record<string, number>, name: string): number {
  const direct = vars[name]
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const lower = vars[name.toLowerCase()]
  if (typeof lower === 'number' && Number.isFinite(lower)) return lower
  return 0
}

/**
 * @returns null if expression cannot be evaluated safely
 */
export function evalAnimMathExpression(
  expression: string,
  vars: Record<string, number>
): number | null {
  const expr = expression.trim()
  if (!expr || !SAFE_EXPR.test(expr)) return null

  const idents = listMathExprIdents(expr)
  const paramOf = new Map<string, string>()
  const argNames: string[] = []
  const argValues: number[] = []
  for (const ident of idents) {
    const param = `__v${argNames.length}`
    paramOf.set(ident, param)
    argNames.push(param)
    argValues.push(lookupVar(vars, ident))
  }

  let js = expr.replace(IDENT_RE, (name) => {
    if (isBuiltinIdent(name)) return `__fn.${name.toLowerCase()}`
    return paramOf.get(name) ?? name
  })
  // lone = → ==
  js = js.replace(/([^!<>=])=([^=])/g, '$1==$2')
  js = js.replace(/&/g, '&&').replace(/\|/g, '||')

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      '__fn',
      ...argNames,
      `"use strict"; return Number(${js});`
    )
    const result = fn(BUILTINS, ...argValues)
    return typeof result === 'number' && Number.isFinite(result) ? result : 0
  } catch {
    return null
  }
}
