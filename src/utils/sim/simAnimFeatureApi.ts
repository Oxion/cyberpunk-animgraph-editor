/**
 * Public AnimFeature write API for drivers / UI / console.
 * Engine ApplyFeature is atomic — use withBatch for multi-field updates.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'

export type SimAnimFeatureApi = {
  setFeature: (feature: string, property: string, value: number) => void
  setBoolFeature: (feature: string, property: string, value: boolean) => void
  setStringFeature: (feature: string, property: string, value: string) => void
  setVectorFeature: (feature: string, property: string, value: SimVec4) => void
  setQuatFeature: (feature: string, property: string, value: SimVec4) => void
  getFeature: (feature: string, property: string) => number | undefined
  getBoolFeature: (feature: string, property: string) => boolean | undefined
  getStringFeature: (feature: string, property: string) => string | undefined
  getVectorFeature: (feature: string, property: string) => SimVec4 | undefined
  getQuatFeature: (feature: string, property: string) => SimVec4 | undefined
  /**
   * Defer publish/step until fn completes (nested batches collapse to one publish).
   * Prefer this over piecemeal set* when applying a full feature snapshot.
   */
  withBatch: (fn: () => void) => void
}
