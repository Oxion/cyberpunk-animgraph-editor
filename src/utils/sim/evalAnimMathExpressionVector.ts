/**
 * Minimal vector math-expression evaluator for animAnimNode_MathExpressionVector.
 * Covers common expressionToolkit vector ops (Vec, getX/Y/Z, + - * /, length, norm, …).
 * Scalar subset matches evalAnimMathExpression (deg-trig). Rotation ops not ported.
 */

import { ANIM_MATH_SCALAR_BUILTINS, listMathExprIdents } from './evalAnimMathExpression'

export type SimVec4 = { x: number; y: number; z: number; w: number }

export const ZERO_VEC4: SimVec4 = { x: 0, y: 0, z: 0, w: 0 }

export function vec4(x = 0, y = 0, z = 0, w = 0): SimVec4 {
  return { x, y, z, w }
}

export function vec4Mag3(v: SimVec4): number {
  return Math.hypot(v.x, v.y, v.z)
}

type Val =
  | { kind: 'f'; n: number }
  | { kind: 'v'; v: SimVec4 }

const VECTOR_BUILTINS = new Set([
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
  ...Object.keys(ANIM_MATH_SCALAR_BUILTINS).map((n) => n.toLowerCase()),
])

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }

function tokenize(expr: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) j++
      const n = Number(expr.slice(i, j))
      if (!Number.isFinite(n)) return null
      out.push({ t: 'num', v: n })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j]!)) j++
      out.push({ t: 'id', v: expr.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/^%&|!#'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    if (c === '(') {
      out.push({ t: 'lp' })
      i++
      continue
    }
    if (c === ')') {
      out.push({ t: 'rp' })
      i++
      continue
    }
    if (c === ',') {
      out.push({ t: 'comma' })
      i++
      continue
    }
    return null
  }
  return out
}

function asF(v: Val): number | null {
  return v.kind === 'f' ? v.n : null
}

function asV(v: Val): SimVec4 | null {
  return v.kind === 'v' ? v.v : null
}

function callBuiltin(name: string, args: Val[]): Val | null {
  const n = name.toLowerCase()
  const f = (i: number) => (args[i] ? asF(args[i]!) : null)
  const v = (i: number) => (args[i] ? asV(args[i]!) : null)

  if (n === 'vec') {
    if (args.length < 3) return null
    return {
      kind: 'v',
      v: vec4(f(0) ?? 0, f(1) ?? 0, f(2) ?? 0, args.length > 3 ? (f(3) ?? 0) : 0),
    }
  }
  if (n === 'getx') {
    const a = v(0)
    return a ? { kind: 'f', n: a.x } : null
  }
  if (n === 'gety') {
    const a = v(0)
    return a ? { kind: 'f', n: a.y } : null
  }
  if (n === 'getz') {
    const a = v(0)
    return a ? { kind: 'f', n: a.z } : null
  }
  if (n === 'setx') {
    const a = v(0)
    const x = f(1)
    return a && x != null ? { kind: 'v', v: vec4(x, a.y, a.z, a.w) } : null
  }
  if (n === 'sety') {
    const a = v(0)
    const y = f(1)
    return a && y != null ? { kind: 'v', v: vec4(a.x, y, a.z, a.w) } : null
  }
  if (n === 'setz') {
    const a = v(0)
    const z = f(1)
    return a && z != null ? { kind: 'v', v: vec4(a.x, a.y, z, a.w) } : null
  }
  if (n === 'setxy') {
    const a = v(0)
    const x = f(1)
    const y = f(2)
    return a && x != null && y != null ? { kind: 'v', v: vec4(x, y, a.z, a.w) } : null
  }
  if (n === 'setyz') {
    const a = v(0)
    const y = f(1)
    const z = f(2)
    return a && y != null && z != null ? { kind: 'v', v: vec4(a.x, y, z, a.w) } : null
  }
  if (n === 'setxz') {
    const a = v(0)
    const x = f(1)
    const z = f(2)
    return a && x != null && z != null ? { kind: 'v', v: vec4(x, a.y, z, a.w) } : null
  }
  if (n === 'length') {
    const a = v(0)
    return a ? { kind: 'f', n: vec4Mag3(a) } : null
  }
  if (n === 'lengthsq') {
    const a = v(0)
    return a ? { kind: 'f', n: a.x * a.x + a.y * a.y + a.z * a.z } : null
  }
  if (n === 'norm') {
    const a = v(0)
    if (!a) return null
    const m = vec4Mag3(a)
    if (m < 1e-12) return { kind: 'v', v: ZERO_VEC4 }
    return { kind: 'v', v: vec4(a.x / m, a.y / m, a.z / m, a.w) }
  }
  if (n === 'cross') {
    const a = v(0)
    const b = v(1)
    if (!a || !b) return null
    return {
      kind: 'v',
      v: vec4(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
        0
      ),
    }
  }
  if (n === 'dot') {
    const a = v(0)
    const b = v(1)
    return a && b ? { kind: 'f', n: a.x * b.x + a.y * b.y + a.z * b.z } : null
  }
  if (n === 'lerp') {
    const a = v(0)
    const b = v(1)
    const t = f(2)
    if (!a || !b || t == null) return null
    return {
      kind: 'v',
      v: vec4(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t
      ),
    }
  }
  // scalar helpers — shared with float eval (deg-trig, logical, …)
  const scalar = ANIM_MATH_SCALAR_BUILTINS[n]
  if (scalar) {
    const nums = args.map(asF)
    if (nums.some((x) => x == null)) return null
    try {
      const result = scalar(...(nums as number[]))
      return typeof result === 'number' && Number.isFinite(result)
        ? { kind: 'f', n: result }
        : null
    } catch {
      return null
    }
  }
  return null
}

function applyAdd(a: Val, op: '+' | '-', b: Val): Val | null {
  const af = asF(a)
  const bf = asF(b)
  if (af != null && bf != null) {
    return { kind: 'f', n: op === '+' ? af + bf : af - bf }
  }
  const av = asV(a)
  const bv = asV(b)
  if (av && bv) {
    return op === '+'
      ? { kind: 'v', v: vec4(av.x + bv.x, av.y + bv.y, av.z + bv.z, av.w + bv.w) }
      : { kind: 'v', v: vec4(av.x - bv.x, av.y - bv.y, av.z - bv.z, av.w - bv.w) }
  }
  return null
}

function applyMul(a: Val, op: '*' | '/', b: Val): Val | null {
  const af = asF(a)
  const bf = asF(b)
  if (af != null && bf != null) {
    if (op === '/' && Math.abs(bf) < 1e-12) return { kind: 'f', n: 0 }
    return { kind: 'f', n: op === '*' ? af * bf : af / bf }
  }
  const av = asV(a)
  const bv = asV(b)
  if (av && bf != null) {
    if (op === '/' && Math.abs(bf) < 1e-12) return { kind: 'v', v: ZERO_VEC4 }
    const s = op === '*' ? bf : 1 / bf
    return { kind: 'v', v: vec4(av.x * s, av.y * s, av.z * s, av.w * s) }
  }
  if (af != null && bv && op === '*') {
    return { kind: 'v', v: vec4(bv.x * af, bv.y * af, bv.z * af, bv.w * af) }
  }
  return null
}

class Parser {
  private i = 0
  private toks: Tok[]
  private floats: Record<string, number>
  private vectors: Record<string, SimVec4>

  constructor(
    toks: Tok[],
    floats: Record<string, number>,
    vectors: Record<string, SimVec4>
  ) {
    this.toks = toks
    this.floats = floats
    this.vectors = vectors
  }

  private peek(): Tok | undefined {
    return this.toks[this.i]
  }
  private take(): Tok | undefined {
    return this.toks[this.i++]
  }
  private expect(t: Tok['t']): boolean {
    if (this.peek()?.t === t) {
      this.take()
      return true
    }
    return false
  }

  parse(): Val | null {
    const v = this.parseAdd()
    if (v == null || this.i !== this.toks.length) return null
    return v
  }

  private parseAdd(): Val | null {
    let left = this.parseMul()
    if (!left) return null
    while (
      this.peek()?.t === 'op' &&
      ((this.peek() as { v: string }).v === '+' || (this.peek() as { v: string }).v === '-')
    ) {
      const op = (this.take() as { t: 'op'; v: '+' | '-' }).v
      const right = this.parseMul()
      if (!right) return null
      const next = applyAdd(left, op, right)
      if (!next) return null
      left = next
    }
    return left
  }

  private parseMul(): Val | null {
    let left = this.parsePow()
    if (!left) return null
    while (
      this.peek()?.t === 'op' &&
      ((this.peek() as { v: string }).v === '*' ||
        (this.peek() as { v: string }).v === '/' ||
        (this.peek() as { v: string }).v === '%')
    ) {
      const op = (this.take() as { t: 'op'; v: string }).v
      const right = this.parsePow()
      if (!right) return null
      if (op === '%') {
        const af = asF(left)
        const bf = asF(right)
        if (af == null || bf == null) return null
        left = { kind: 'f', n: af % bf }
        continue
      }
      const next = applyMul(left, op as '*' | '/', right)
      if (!next) return null
      left = next
    }
    return left
  }

  private parsePow(): Val | null {
    let left = this.parseUnary()
    if (!left) return null
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '^') {
      this.take()
      const right = this.parsePow()
      if (!right) return null
      const af = asF(left)
      const bf = asF(right)
      if (af == null || bf == null) return null
      return { kind: 'f', n: Math.pow(af, bf) }
    }
    return left
  }

  private parseUnary(): Val | null {
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '-') {
      this.take()
      const v = this.parseUnary()
      if (!v) return null
      if (v.kind === 'f') return { kind: 'f', n: -v.n }
      return { kind: 'v', v: vec4(-v.v.x, -v.v.y, -v.v.z, -v.v.w) }
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '+') {
      this.take()
      return this.parseUnary()
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '#') {
      this.take()
      const v = this.parseUnary()
      if (!v) return null
      if (v.kind === 'f') return { kind: 'f', n: -v.n }
      return { kind: 'v', v: vec4(-v.v.x, -v.v.y, -v.v.z, -v.v.w) }
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '!') {
      this.take()
      const v = this.parseUnary()
      if (!v) return null
      const n = asF(v)
      if (n == null) return null
      return { kind: 'f', n: ANIM_MATH_SCALAR_BUILTINS.not!(n) }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Val | null {
    const tok = this.peek()
    if (!tok) return null
    if (tok.t === 'num') {
      this.take()
      return { kind: 'f', n: tok.v }
    }
    if (tok.t === 'lp') {
      this.take()
      const v = this.parseAdd()
      if (!v || !this.expect('rp')) return null
      return v
    }
    if (tok.t === 'id') {
      this.take()
      if (this.peek()?.t === 'lp') {
        this.take()
        const args: Val[] = []
        if (this.peek()?.t !== 'rp') {
          for (;;) {
            const a = this.parseAdd()
            if (!a) return null
            args.push(a)
            if (this.peek()?.t === 'comma') {
              this.take()
              continue
            }
            break
          }
        }
        if (!this.expect('rp')) return null
        return callBuiltin(tok.v, args)
      }
      return this.lookup(tok.v)
    }
    return null
  }

  private lookup(name: string): Val | null {
    if (name.toLowerCase() === 'pi') {
      return { kind: 'f', n: Math.PI }
    }
    if (Object.prototype.hasOwnProperty.call(this.vectors, name)) {
      return { kind: 'v', v: this.vectors[name]! }
    }
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(this.vectors)) {
      if (k.toLowerCase() === lower) return { kind: 'v', v }
    }
    if (Object.prototype.hasOwnProperty.call(this.floats, name)) {
      return { kind: 'f', n: this.floats[name]! }
    }
    for (const [k, v] of Object.entries(this.floats)) {
      if (k.toLowerCase() === lower) return { kind: 'f', n: v }
    }
    // Unknown ident → 0 (matches float eval fallback)
    return { kind: 'f', n: 0 }
  }
}

/** Identifiers that bind to sockets (skip vector/scalar builtins). */
export function listMathExprVectorIdents(expression: string): string[] {
  return listMathExprIdents(expression).filter(
    (n) => !VECTOR_BUILTINS.has(n.toLowerCase())
  )
}

/**
 * @returns null if expression cannot be evaluated / does not yield a vector
 */
export function evalAnimMathExpressionVector(
  expression: string,
  floatVars: Record<string, number>,
  vectorVars: Record<string, SimVec4>
): SimVec4 | null {
  const expr = expression.trim()
  if (!expr) return null
  const toks = tokenize(expr)
  if (!toks) return null
  try {
    const parser = new Parser(toks, floatVars, vectorVars)
    const result = parser.parse()
    if (!result) return null
    if (result.kind === 'v') return result.v
    // Scalar result → (n,0,0,0) is wrong; treat as failure for vector node
    return null
  } catch {
    return null
  }
}
