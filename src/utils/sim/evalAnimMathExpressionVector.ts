/**
 * Mixed float/vector/quaternion math-expression evaluator
 * (MathExpressionFloat / Vector / Pose).
 * Covers expressionToolkit Vector + Rotation ops used in animgraphs.
 */

import {
  ANIM_MATH_SCALAR_BUILTINS,
  getCompiledMathExpr,
  listMathExprIdents,
  type MathExprCompileCache,
  type MathExprCompiled,
} from './evalAnimMathExpression'

export type SimVec4 = { x: number; y: number; z: number; w: number }

export const ZERO_VEC4: SimVec4 = { x: 0, y: 0, z: 0, w: 0 }
export const IDENTITY_QUAT_VEC4: SimVec4 = { x: 0, y: 0, z: 0, w: 1 }

export function vec4(x = 0, y = 0, z = 0, w = 0): SimVec4 {
  return { x, y, z, w }
}

export function vec4Mag3(v: SimVec4): number {
  return Math.hypot(v.x, v.y, v.z)
}

type Val =
  | { kind: 'f'; n: number }
  | { kind: 'v'; v: SimVec4 }
  | { kind: 'q'; v: SimVec4 }

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
  'rot',
  'getroll',
  'getpitch',
  'getyaw',
  ...Object.keys(ANIM_MATH_SCALAR_BUILTINS).map((n) => n.toLowerCase()),
])

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

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
    // `#name` = rotation var; bare `#` = unary minus (engine IsAlpha includes #).
    if (c === '#' && i + 1 < expr.length && /[A-Za-z_]/.test(expr[i + 1]!)) {
      let j = i + 2
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j]!)) j++
      out.push({ t: 'id', v: expr.slice(i, j) })
      i = j
      continue
    }
    // Engine IsAlpha includes $ / @ (vector / reserved prefixes).
    if (/[$A-Za-z_@]/.test(c)) {
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

function asQ(v: Val): SimVec4 | null {
  return v.kind === 'q' ? v.v : null
}

/** Engine Quaternion::GetPitch (degrees). i,j,k,r → x,y,z,w */
function quatGetPitchDeg(q: SimVec4): number {
  const { x: i, y: j, z: k, w: r } = q
  const y2 = j * j
  const z2 = k * k
  const unitLength = r * r + i * i + y2 + z2
  const wxyz = r * i + j * k
  const eps = 0.001
  if (unitLength < 1e-20) return 0
  if (wxyz > (0.5 - eps) * unitLength) return 90
  if (wxyz < (-0.5 + eps) * unitLength) return -90
  return Math.asin((2 * wxyz) / unitLength) * RAD2DEG
}

/** Engine Quaternion::GetYaw (degrees). */
function quatGetYawDeg(q: SimVec4): number {
  const { x: i, y: j, z: k, w: r } = q
  const x2 = i * i
  const z2 = k * k
  const unitLength = r * r + x2 + j * j + z2
  const wxyz = r * i + j * k
  const eps = 0.001
  if (unitLength < 1e-20) return 0
  if (wxyz > (0.5 - eps) * unitLength) return 2 * Math.atan2(j, r) * RAD2DEG
  if (wxyz < (-0.5 + eps) * unitLength) return -2 * Math.atan2(j, r) * RAD2DEG
  return Math.atan2(2 * (r * k - i * j), 1 - 2 * (z2 + x2)) * RAD2DEG
}

/** Engine Quaternion::GetRoll (degrees). */
function quatGetRollDeg(q: SimVec4): number {
  const { x: i, y: j, z: k, w: r } = q
  const x2 = i * i
  const y2 = j * j
  const unitLength = r * r + x2 + y2 + k * k
  const wxyz = r * i + j * k
  const eps = 0.001
  if (unitLength < 1e-20) return 0
  if (wxyz > (0.5 - eps) * unitLength || wxyz < (-0.5 + eps) * unitLength) return 0
  return Math.atan2(2 * (r * j - i * k), 1 - 2 * (y2 + x2)) * RAD2DEG
}

function quatFromAxisAngle(axis: SimVec4, angleRad: number): SimVec4 {
  const half = angleRad * 0.5
  const s = Math.sin(half)
  return vec4(axis.x * s, axis.y * s, axis.z * s, Math.cos(half))
}

function quatMul(a: SimVec4, b: SimVec4): SimVec4 {
  return vec4(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  )
}

function callBuiltin(name: string, args: Val[]): Val | null {
  const n = name.toLowerCase()
  const f = (i: number) => (args[i] ? asF(args[i]!) : null)
  const v = (i: number) => (args[i] ? asV(args[i]!) : null)
  const q = (i: number) => (args[i] ? asQ(args[i]!) : null)

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
  // Rotation: Rot(axis, angleDeg) | Rot(yaw, pitch, roll)
  if (n === 'rot') {
    if (args.length === 2) {
      const axis = v(0)
      const ang = f(1)
      if (!axis || ang == null) return null
      return { kind: 'q', v: quatFromAxisAngle(axis, ang * DEG2RAD) }
    }
    if (args.length === 3) {
      const yaw = f(0)
      const pitch = f(1)
      const roll = f(2)
      if (yaw == null || pitch == null || roll == null) return null
      const yawQ = quatFromAxisAngle(vec4(0, 0, 1), yaw * DEG2RAD)
      const pitchQ = quatFromAxisAngle(vec4(1, 0, 0), pitch * DEG2RAD)
      const rollQ = quatFromAxisAngle(vec4(0, 1, 0), roll * DEG2RAD)
      return { kind: 'q', v: quatMul(yawQ, quatMul(pitchQ, rollQ)) }
    }
    return null
  }
  if (n === 'getroll') {
    const a = q(0)
    return a ? { kind: 'f', n: quatGetRollDeg(a) } : null
  }
  if (n === 'getpitch') {
    const a = q(0)
    return a ? { kind: 'f', n: quatGetPitchDeg(a) } : null
  }
  if (n === 'getyaw') {
    const a = q(0)
    return a ? { kind: 'f', n: quatGetYawDeg(a) } : null
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
  // Quaternion multiply (concat)
  const aq = asQ(a)
  const bq = asQ(b)
  if (aq && bq && op === '*') {
    return { kind: 'q', v: quatMul(aq, bq) }
  }
  return null
}

function negateVal(v: Val): Val {
  if (v.kind === 'f') return { kind: 'f', n: -v.n }
  if (v.kind === 'v') return { kind: 'v', v: vec4(-v.v.x, -v.v.y, -v.v.z, -v.v.w) }
  return { kind: 'q', v: vec4(-v.v.x, -v.v.y, -v.v.z, -v.v.w) }
}

class Parser {
  private i = 0
  private toks: Tok[]
  private floats: Record<string, number>
  private vectors: Record<string, SimVec4>
  private quats: Record<string, SimVec4>

  constructor(
    toks: Tok[],
    floats: Record<string, number>,
    vectors: Record<string, SimVec4>,
    quats: Record<string, SimVec4>
  ) {
    this.toks = toks
    this.floats = floats
    this.vectors = vectors
    this.quats = quats
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
      return negateVal(v)
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '+') {
      this.take()
      return this.parseUnary()
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '#') {
      this.take()
      const v = this.parseUnary()
      if (!v) return null
      return negateVal(v)
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
    // Rotation vars (`#quaternion`) — check before floats so `#` prefix wins.
    if (Object.prototype.hasOwnProperty.call(this.quats, name)) {
      return { kind: 'q', v: this.quats[name]! }
    }
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(this.quats)) {
      if (k.toLowerCase() === lower) return { kind: 'q', v }
    }
    if (Object.prototype.hasOwnProperty.call(this.vectors, name)) {
      return { kind: 'v', v: this.vectors[name]! }
    }
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

/** Identifiers that bind to vector sockets (skip builtins / `#quat`). */
export function listMathExprVectorIdents(expression: string): string[] {
  return listMathExprIdents(expression).filter(
    (n) => !VECTOR_BUILTINS.has(n.toLowerCase()) && !n.startsWith('#')
  )
}

/** Identifiers that bind to quaternion sockets (`#quaternion`). */
export function listMathExprQuatIdents(expression: string): string[] {
  return listMathExprIdents(expression).filter((n) => n.startsWith('#'))
}

function mixedToksForCompiled(compiled: MathExprCompiled): Tok[] | null {
  if (compiled.mixedTokensResolved) {
    return (compiled.mixedTokens as Tok[] | null | undefined) ?? null
  }
  const toks = tokenize(compiled.trimmed)
  compiled.mixedTokens = toks
  compiled.mixedTokensResolved = true
  return toks
}

function evalAnimMathExpressionVal(
  expression: string,
  floatVars: Record<string, number>,
  vectorVars: Record<string, SimVec4>,
  quatVars: Record<string, SimVec4> = {},
  cache?: MathExprCompileCache | null
): Val | null {
  const compiled = getCompiledMathExpr(expression, cache)
  if (!compiled) return null
  const toks = mixedToksForCompiled(compiled)
  if (!toks) return null
  try {
    return new Parser(toks, floatVars, vectorVars, quatVars).parse()
  } catch {
    return null
  }
}

/**
 * @returns null if expression cannot be evaluated / does not yield a vector
 */
export function evalAnimMathExpressionVector(
  expression: string,
  floatVars: Record<string, number>,
  vectorVars: Record<string, SimVec4>,
  quatVars: Record<string, SimVec4> = {},
  cache?: MathExprCompileCache | null
): SimVec4 | null {
  const result = evalAnimMathExpressionVal(
    expression,
    floatVars,
    vectorVars,
    quatVars,
    cache
  )
  if (!result || result.kind !== 'v') return null
  return result.v
}

/**
 * Mixed scalar+vector+quat expression → float (MathExpressionFloat / Pose).
 * @returns null if parse fails or result is not a float
 */
export function evalAnimMathExpressionFloatMixed(
  expression: string,
  floatVars: Record<string, number>,
  vectorVars: Record<string, SimVec4>,
  quatVars: Record<string, SimVec4> = {},
  cache?: MathExprCompileCache | null
): number | null {
  const result = evalAnimMathExpressionVal(
    expression,
    floatVars,
    vectorVars,
    quatVars,
    cache
  )
  if (!result || result.kind !== 'f') return null
  return Number.isFinite(result.n) ? result.n : 0
}
