/**
 * Scalar evaluator for anim MathExpressionFloat strings.
 * Subset of RED expressionToolkit (expressionToolkit_opRegistry Scalar + Logical).
 * Vector/rotation ops live in evalAnimMathExpressionVector (mixed path).
 *
 * Engine trig takes/returns degrees. Engine `&` / `|` / `xor` / `!` are float
 * logical (operand > eps → 1 else 0), not bitwise / JS boolean.
 */

/** Engine IsAlpha: alnum + _ $ # @. `#name` = rotation var; bare `#` = unary minus (mixed tokenizer). */
const SAFE_EXPR = /^[\d\s+\-*/().,_<>=!&|^%#$a-zA-Z@]+$/
/** `$vec` / `@x` / `name` / `#quat` — `#` alone is not an ident. */
const IDENT_RE = /[$A-Za-z_@][A-Za-z0-9_]*|#[A-Za-z_][A-Za-z0-9_]*/g
const EPS = Number.EPSILON

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function logicalTrue(x: number): boolean {
  return x > EPS
}

/** Shared scalar builtins (also used by vector expression eval). */
export const ANIM_MATH_SCALAR_BUILTINS: Record<string, (...args: number[]) => number> = {
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  max: (...args) => Math.max(...args),
  min: (...args) => Math.min(...args),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  cbrt: (x) => Math.cbrt(x),
  log: (x) => Math.log(x),
  log2: (x) => Math.log(x) / Math.log(2),
  // Degrees in / out — expressionToolkit ScalarOperations
  sin: (x) => Math.sin(x * DEG2RAD),
  cos: (x) => Math.cos(x * DEG2RAD),
  tan: (x) => Math.tan(x * DEG2RAD),
  asin: (x) => Math.asin(x) * RAD2DEG,
  acos: (x) => Math.acos(x) * RAD2DEG,
  atan: (x) => Math.atan(x) * RAD2DEG,
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  sign: (x) => (x >= 0 ? 1 : -1),
  pow: (a, b) => Math.pow(a, b),
  /** Zero-arg PI constant: PI() or PI in rewritten form */
  pi: () => Math.PI,
  and: (a, b) => (logicalTrue(a) && logicalTrue(b) ? 1 : 0),
  or: (a, b) => (logicalTrue(a) || logicalTrue(b) ? 1 : 0),
  xor: (a, b) => (logicalTrue(a) !== logicalTrue(b) ? 1 : 0),
  not: (a) => (logicalTrue(a) ? 0 : 1),
  // Logical ops as named funcs (expressionToolkit LogicalOperations)
  greater_or_equal: (a, b) => (a >= b ? 1 : 0),
  less_or_equal: (a, b) => (a <= b ? 1 : 0),
}

const BUILTINS = ANIM_MATH_SCALAR_BUILTINS

/** Scalar builtins + vector-toolkit names so listMathExprIdents skips them. */
const BUILTIN_NAMES = new Set([
  ...Object.keys(BUILTINS).map((n) => n.toLowerCase()),
  'vec',
  'getx',
  'gety',
  'getz',
  'setx',
  'sety',
  'setz',
  'setxy',
  'setyz',
  'setxz',
  'length',
  'lengthsq',
  'norm',
  'cross',
  'dot',
  'lerp',
  'rot',
  'getroll',
  'getpitch',
  'getyaw',
])

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

/** Bare float socket names (`A`, `weight`) — not `$vec` / `#quat`. */
export function listMathExprFloatIdents(expression: string): string[] {
  return listMathExprIdents(expression).filter(
    (n) => !n.startsWith('#') && !n.startsWith('$') && !n.startsWith('@')
  )
}

/** True when expression needs the mixed (vector/quat) parser. */
export function mathExprNeedsMixedEval(expression: string): boolean {
  return /[$]|#[A-Za-z_]|get[XYZ]\s*\(|get(?:Roll|Pitch|Yaw)\s*\(|\b(?:vec|length|norm|dot|cross|lerp|Rot)\s*\(/i.test(
    expression
  )
}

function lookupVar(vars: Record<string, number>, name: string): number {
  const direct = vars[name]
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const lower = vars[name.toLowerCase()]
  if (typeof lower === 'number' && Number.isFinite(lower)) return lower
  return 0
}

/** Top-level split on `op` (paren-aware). */
function splitTopLevel(expr: string, op: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && expr.startsWith(op, i)) {
      if (op.length === 1) {
        const prev = expr[i - 1]
        const next = expr[i + 1]
        if (op === '&' && (prev === '&' || next === '&')) continue
        if (op === '|' && (prev === '|' || next === '|')) continue
        if (
          op === '=' &&
          (prev === '=' || next === '=' || prev === '!' || prev === '<' || prev === '>')
        )
          continue
        if (op === '!' && next === '=') continue
      }
      parts.push(expr.slice(start, i).trim())
      i += op.length - 1
      start = i + 1
    }
  }
  parts.push(expr.slice(start).trim())
  return parts.length > 1 ? parts : null
}

/**
 * Rewrite ^ / & / | with toolkit precedence: | < & < ^.
 * Each part is rewritten before wrapping so ops are never trapped inside __fn.*().
 */
function rewriteLogicalAndPow(expr: string): string {
  const orParts = splitTopLevel(expr, '|')
  if (orParts) {
    return orParts.map(rewriteLogicalAndPow).reduce((a, b) => `__fn.or(${a},${b})`)
  }
  const andParts = splitTopLevel(expr, '&')
  if (andParts) {
    return andParts.map(rewriteLogicalAndPow).reduce((a, b) => `__fn.and(${a},${b})`)
  }
  const powParts = splitTopLevel(expr, '^')
  if (powParts) {
    return powParts.map(rewriteLogicalAndPow).reduce((a, b) => `__fn.pow(${a},${b})`)
  }
  return expr
}

/** Rewrite unary `!` / `#` (engine # = unary minus). */
function rewriteUnary(expr: string): string {
  let out = ''
  let i = 0
  while (i < expr.length) {
    const c = expr[i]!
    if (c === '!' && expr[i + 1] !== '=') {
      i++
      while (expr[i] === ' ') i++
      if (expr[i] === '(') {
        let depth = 0
        const start = i
        for (; i < expr.length; i++) {
          if (expr[i] === '(') depth++
          else if (expr[i] === ')') {
            depth--
            if (depth === 0) {
              i++
              break
            }
          }
        }
        out += `__fn.not(${rewriteUnary(expr.slice(start, i))})`
        continue
      }
      const m = expr.slice(i).match(/^(?:__fn\.[A-Za-z_]\w*|\w+)/)
      if (m) {
        out += `__fn.not(${m[0]})`
        i += m[0].length
        continue
      }
      out += c
      continue
    }
    if (c === '#') {
      out += '-'
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

function rewriteBarePi(expr: string): string {
  return expr.replace(/\bPI\b/gi, '__fn.pi()')
}

/** Per-runner (or ad-hoc) compile cache keyed by trimmed expressionString. */
export type MathExprCompileCache = Map<string, MathExprCompiled>

/**
 * One compile of an expressionString: idents + scalar runner.
 * Mixed tokenizer fills `mixedTokens` lazily (evalAnimMathExpressionVector).
 */
export type MathExprCompiled = {
  trimmed: string
  safe: boolean
  needsMixed: boolean
  /** All non-builtin idents in expression order (AutoRegisterVar). */
  idents: string[]
  floatIdents: string[]
  vectorIdents: string[]
  quatIdents: string[]
  /** Scalar path; null when unsafe / compile failed. */
  evalScalar: ((vars: Record<string, number>) => number | null) | null
  /** Lazy mixed-path tokenize result (Tok[] | null); set by vector module. */
  mixedTokens?: unknown
  mixedTokensResolved?: boolean
}

function compileMathExpr(trimmed: string): MathExprCompiled {
  const idents = listMathExprIdents(trimmed)
  const floatIdents = idents.filter(
    (n) => !n.startsWith('#') && !n.startsWith('$') && !n.startsWith('@')
  )
  const quatIdents = idents.filter((n) => n.startsWith('#'))
  // Same as listMathExprVectorIdents: builtins already stripped by listMathExprIdents.
  const vectorIdents = idents.filter((n) => !n.startsWith('#'))
  const needsMixed = mathExprNeedsMixedEval(trimmed)
  const safe = SAFE_EXPR.test(trimmed)

  let evalScalar: MathExprCompiled['evalScalar'] = null
  if (safe) {
    const paramOf = new Map<string, string>()
    const argNames: string[] = []
    for (const ident of idents) {
      const param = `__v${argNames.length}`
      paramOf.set(ident, param)
      argNames.push(param)
    }

    let js = trimmed.replace(IDENT_RE, (name) => {
      if (isBuiltinIdent(name)) {
        const lower = name.toLowerCase()
        if (lower === 'pi') return '__fn.pi()'
        return `__fn.${lower}`
      }
      return paramOf.get(name) ?? name
    })
    js = js.replace(/([^!<>=])=([^=])/g, '$1==$2')
    js = rewriteBarePi(js)
    js = rewriteUnary(js)
    js = rewriteLogicalAndPow(js)

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        '__fn',
        ...argNames,
        `"use strict"; return Number(${js});`
      ) as (...args: unknown[]) => unknown
      const identsSnapshot = idents
      evalScalar = (vars) => {
        try {
          const argValues = identsSnapshot.map((id) => lookupVar(vars, id))
          const result = fn(BUILTINS, ...argValues)
          return typeof result === 'number' && Number.isFinite(result) ? result : 0
        } catch {
          return null
        }
      }
    } catch {
      evalScalar = null
    }
  }

  return {
    trimmed,
    safe,
    needsMixed,
    idents,
    floatIdents,
    vectorIdents,
    quatIdents,
    evalScalar,
  }
}

/** Compile (or fetch) expression; empty string → null. */
export function getCompiledMathExpr(
  expression: string,
  cache?: MathExprCompileCache | null
): MathExprCompiled | null {
  const trimmed = expression.trim()
  if (!trimmed) return null
  const hit = cache?.get(trimmed)
  if (hit) return hit
  const compiled = compileMathExpr(trimmed)
  cache?.set(trimmed, compiled)
  return compiled
}

/**
 * @returns null if expression cannot be evaluated safely
 */
export function evalAnimMathExpression(
  expression: string,
  vars: Record<string, number>,
  cache?: MathExprCompileCache | null
): number | null {
  const compiled = getCompiledMathExpr(expression, cache)
  if (!compiled?.evalScalar) return null
  return compiled.evalScalar(vars)
}
