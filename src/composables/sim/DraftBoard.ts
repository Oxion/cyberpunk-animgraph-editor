import { ref, Ref, triggerRef } from "vue"
import { IDraftBoard } from "./types"
import { IDENTITY_QUAT_VEC4, SimVec4, ZERO_VEC4 } from "@/utils/sim"
import { makeFeatureKey } from "./features"

export class DraftBoard implements IDraftBoard {
  readonly id: string

  private readonly _numericFeatureByKeyRef: Ref<Partial<Record<string, number>>> = ref({})
  private readonly _stringFeatureByKeyRef: Ref<Partial<Record<string, string>>> = ref({})
  private readonly _booleanFeatureByKeyRef: Ref<Partial<Record<string, boolean>>> = ref({})
  private readonly _vectorFeatureByKeyRef: Ref<Partial<Record<string, SimVec4>>> = ref({})
  private readonly _quatFeatureByKeyRef: Ref<Partial<Record<string, SimVec4>>> = ref({})

  private readonly _numericFeaturesRevisionRef: Ref<number> = ref(0)
  private readonly _stringFeaturesRevisionRef: Ref<number> = ref(0)
  private readonly _booleanFeaturesRevisionRef: Ref<number> = ref(0)
  private readonly _vectorFeaturesRevisionRef: Ref<number> = ref(0)
  private readonly _quatFeaturesRevisionRef: Ref<number> = ref(0)

  private readonly _populatedNumericFeatureKeyToFeatureMap: Map<string, { feature: string; property: string }> = new Map()
  private readonly _populatedStringFeatureKeyToFeatureMap: Map<string, { feature: string; property: string }> = new Map()
  private readonly _populatedBooleanFeatureKeyToFeatureMap: Map<string, { feature: string; property: string }> = new Map()
  private readonly _populatedVectorFeatureKeyToFeatureMap: Map<string, { feature: string; property: string }> = new Map()
  private readonly _populatedQuatFeatureKeyToFeatureMap: Map<string, { feature: string; property: string }> = new Map()

  private readonly _floatVarByKeyRef: Ref<Partial<Record<string, number>>> = ref({})
  private readonly _intVarByKeyRef: Ref<Partial<Record<string, number>>> = ref({})
  private readonly _boolVarByKeyRef: Ref<Partial<Record<string, boolean>>> = ref({})
  private readonly _vectorVarByKeyRef: Ref<Partial<Record<string, SimVec4>>> = ref({})
  private readonly _quatVarByKeyRef: Ref<Partial<Record<string, SimVec4>>> = ref({})

  private readonly _floatVarsRevisionRef: Ref<number> = ref(0)
  private readonly _intVarsRevisionRef: Ref<number> = ref(0)
  private readonly _boolVarsRevisionRef: Ref<number> = ref(0)
  private readonly _vectorVarsRevisionRef: Ref<number> = ref(0)
  private readonly _quatVarsRevisionRef: Ref<number> = ref(0)

  private readonly _populatedFloatVarNamesSet: Set<string> = new Set()
  private readonly _populatedIntVarNamesSet: Set<string> = new Set()
  private readonly _populatedBoolVarNamesSet: Set<string> = new Set()
  private readonly _populatedVectorVarNamesSet: Set<string> = new Set()
  private readonly _populatedQuatVarNamesSet: Set<string> = new Set()

  private readonly _wrapperWeightByKeyRef: Ref<Partial<Record<string, number>>> = ref({})
  private readonly _wrapperWeightsRevisionRef: Ref<number> = ref(0)
  private readonly _populatedWrapperWeightNamesSet: Set<string> = new Set()

  private readonly _tagValueByKeyRef: Ref<Partial<Record<string, number>>> = ref({})
  private readonly _tagValuesRevisionRef: Ref<number> = ref(0)
  private readonly _populatedTagValueNamesSet: Set<string> = new Set()

  private readonly _entityTagByKeyRef: Ref<Partial<Record<string, boolean>>> = ref({})
  private readonly _entityTagsRevisionRef: Ref<number> = ref(0)
  private readonly _populatedEntityTagNamesSet: Set<string> = new Set()

  constructor(id: string) {
    this.id = id
  }

  get numericFeatureByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, number>>>>> {
    return this._numericFeatureByKeyRef
  }
  get stringFeatureByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, string>>>>> {
    return this._stringFeatureByKeyRef
  }
  get booleanFeatureByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>> {
    return this._booleanFeatureByKeyRef
  }
  get vectorFeatureByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>> {
    return this._vectorFeatureByKeyRef
  }
  get quatFeatureByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>> {
    return this._quatFeatureByKeyRef
  }

  get numericFeaturesRevisionRef(): Readonly<Ref<number>> {
    return this._numericFeaturesRevisionRef
  }
  get stringFeaturesRevisionRef(): Readonly<Ref<number>> {
    return this._stringFeaturesRevisionRef
  }
  get booleanFeaturesRevisionRef(): Readonly<Ref<number>> {
    return this._booleanFeaturesRevisionRef
  }
  get vectorFeaturesRevisionRef(): Readonly<Ref<number>> {
    return this._vectorFeaturesRevisionRef
  }
  get quatFeaturesRevisionRef(): Readonly<Ref<number>> {
    return this._quatFeaturesRevisionRef
  }

  get populatedNumericFeatureKeyToFeatureMap(): ReadonlyMap<string, { feature: string; property: string }> {
    return this._populatedNumericFeatureKeyToFeatureMap
  }
  get populatedStringFeatureKeyToFeatureMap(): ReadonlyMap<string, { feature: string; property: string }> {
    return this._populatedStringFeatureKeyToFeatureMap
  }
  get populatedBooleanFeatureKeyToFeatureMap(): ReadonlyMap<string, { feature: string; property: string }> {
    return this._populatedBooleanFeatureKeyToFeatureMap
  }
  get populatedVectorFeatureKeyToFeatureMap(): ReadonlyMap<string, { feature: string; property: string }> {
    return this._populatedVectorFeatureKeyToFeatureMap
  }
  get populatedQuatFeatureKeyToFeatureMap(): ReadonlyMap<string, { feature: string; property: string }> {
    return this._populatedQuatFeatureKeyToFeatureMap
  }

  setNumericFeatureValue(feature: string, property: string, value: number): void {
    const key = makeFeatureKey(feature, property)
    this._numericFeatureByKeyRef.value[key] = value
    this._numericFeaturesRevisionRef.value++
    this._populatedNumericFeatureKeyToFeatureMap.set(key, { feature, property })
    triggerRef(this._numericFeatureByKeyRef)
  }
  clearNumericFeatureValue(feature: string, property: string): void {
    const key = makeFeatureKey(feature, property)
    if (!this._populatedNumericFeatureKeyToFeatureMap.delete(key)) return
    delete this._numericFeatureByKeyRef.value[key]
    this._numericFeaturesRevisionRef.value++
    triggerRef(this._numericFeatureByKeyRef)
  }
  setStringFeatureValue(feature: string, property: string, value: string): void {
    const key = makeFeatureKey(feature, property)
    this._stringFeatureByKeyRef.value[key] = value
    this._stringFeaturesRevisionRef.value++
    this._populatedStringFeatureKeyToFeatureMap.set(key, { feature, property })
    triggerRef(this._stringFeatureByKeyRef)
  }
  clearStringFeatureValue(feature: string, property: string): void {
    const key = makeFeatureKey(feature, property)
    if (!this._populatedStringFeatureKeyToFeatureMap.delete(key)) return
    delete this._stringFeatureByKeyRef.value[key]
    this._stringFeaturesRevisionRef.value++
    triggerRef(this._stringFeatureByKeyRef)
  }
  setBooleanFeatureValue(feature: string, property: string, value: boolean): void {
    const key = makeFeatureKey(feature, property)
    this._booleanFeatureByKeyRef.value[key] = value
    this._booleanFeaturesRevisionRef.value++
    this._populatedBooleanFeatureKeyToFeatureMap.set(key, { feature, property })
    triggerRef(this._booleanFeatureByKeyRef)
  }
  clearBooleanFeatureValue(feature: string, property: string): void {
    const key = makeFeatureKey(feature, property)
    if (!this._populatedBooleanFeatureKeyToFeatureMap.delete(key)) return
    delete this._booleanFeatureByKeyRef.value[key]
    this._booleanFeaturesRevisionRef.value++
    triggerRef(this._booleanFeatureByKeyRef)
  }
  setVectorFeatureValue(feature: string, property: string, value: SimVec4): void {
    const key = makeFeatureKey(feature, property)
    this._vectorFeatureByKeyRef.value[key] = value
    this._vectorFeaturesRevisionRef.value++
    this._populatedVectorFeatureKeyToFeatureMap.set(key, { feature, property })
    triggerRef(this._vectorFeatureByKeyRef)
  }
  clearVectorFeatureValue(feature: string, property: string): void {
    const key = makeFeatureKey(feature, property)
    if (!this._populatedVectorFeatureKeyToFeatureMap.delete(key)) return
    delete this._vectorFeatureByKeyRef.value[key]
    this._vectorFeaturesRevisionRef.value++
    triggerRef(this._vectorFeatureByKeyRef)
  }
  setVectorFeatureAxisValue(feature: string, property: string, axis: keyof SimVec4, value: number): void {
    const key = makeFeatureKey(feature, property)
    const currentValue = this._vectorFeatureByKeyRef.value[key]
    const nextValue = {
      ...(currentValue ?? ZERO_VEC4),
      [axis]: value,
    }
    this.setVectorFeatureValue(feature, property, nextValue)
  }
  setQuatFeatureValue(feature: string, property: string, value: SimVec4): void {
    const key = makeFeatureKey(feature, property)
    this._quatFeatureByKeyRef.value[key] = value
    this._quatFeaturesRevisionRef.value++
    this._populatedQuatFeatureKeyToFeatureMap.set(key, { feature, property })
    triggerRef(this._quatFeatureByKeyRef)
  }
  clearQuatFeatureValue(feature: string, property: string): void {
    const key = makeFeatureKey(feature, property)
    if (!this._populatedQuatFeatureKeyToFeatureMap.delete(key)) return
    delete this._quatFeatureByKeyRef.value[key]
    this._quatFeaturesRevisionRef.value++
    triggerRef(this._quatFeatureByKeyRef)
  }
  setQuatFeatureAxisValue(feature: string, property: string, axis: keyof SimVec4, value: number): void {
    const key = makeFeatureKey(feature, property)
    const currentValue = this._quatFeatureByKeyRef.value[key]
    const nextValue = {
      ...(currentValue ?? IDENTITY_QUAT_VEC4),
      [axis]: value,
    }
    this.setQuatFeatureValue(feature, property, nextValue)
  }

  get floatVarByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, number>>>>> {
    return this._floatVarByKeyRef
  }
  get intVarByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, number>>>>> {
    return this._intVarByKeyRef
  }
  get boolVarByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>> {
    return this._boolVarByKeyRef
  }
  get vectorVarByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>> {
    return this._vectorVarByKeyRef
  }
  get quatVarByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>> {
    return this._quatVarByKeyRef
  }

  get floatVarsRevisionRef(): Readonly<Ref<number>> {
    return this._floatVarsRevisionRef
  }
  get intVarsRevisionRef(): Readonly<Ref<number>> {
    return this._intVarsRevisionRef
  }
  get boolVarsRevisionRef(): Readonly<Ref<number>> {
    return this._boolVarsRevisionRef
  }
  get vectorVarsRevisionRef(): Readonly<Ref<number>> {
    return this._vectorVarsRevisionRef
  }
  get quatVarsRevisionRef(): Readonly<Ref<number>> {
    return this._quatVarsRevisionRef
  }

  get populatedFloatVarNamesSet(): ReadonlySet<string> {
    return this._populatedFloatVarNamesSet
  }
  get populatedIntVarNamesSet(): ReadonlySet<string> {
    return this._populatedIntVarNamesSet
  }
  get populatedBoolVarNamesSet(): ReadonlySet<string> {
    return this._populatedBoolVarNamesSet
  }
  get populatedVectorVarNamesSet(): ReadonlySet<string> {
    return this._populatedVectorVarNamesSet
  }
  get populatedQuatVarNamesSet(): ReadonlySet<string> {
    return this._populatedQuatVarNamesSet
  }

  setFloatVarValue(varName: string, value: number): void {
    this._floatVarByKeyRef.value[varName] = value
    this._floatVarsRevisionRef.value++
    this._populatedFloatVarNamesSet.add(varName)
    triggerRef(this._floatVarByKeyRef)
  }
  clearFloatVarValue(varName: string): void {
    if (!this._populatedFloatVarNamesSet.delete(varName)) return
    delete this._floatVarByKeyRef.value[varName]
    this._floatVarsRevisionRef.value++
    triggerRef(this._floatVarByKeyRef)
  }
  setIntVarValue(varName: string, value: number): void {
    this._intVarByKeyRef.value[varName] = value
    this._intVarsRevisionRef.value++
    this._populatedIntVarNamesSet.add(varName)
    triggerRef(this._intVarByKeyRef)
  }
  clearIntVarValue(varName: string): void {
    if (!this._populatedIntVarNamesSet.delete(varName)) return
    delete this._intVarByKeyRef.value[varName]
    this._intVarsRevisionRef.value++
    triggerRef(this._intVarByKeyRef)
  }
  setBoolVarValue(varName: string, value: boolean): void {
    this._boolVarByKeyRef.value[varName] = value
    this._boolVarsRevisionRef.value++
    this._populatedBoolVarNamesSet.add(varName)
    triggerRef(this._boolVarByKeyRef)
  }
  clearBoolVarValue(varName: string): void {
    if (!this._populatedBoolVarNamesSet.delete(varName)) return
    delete this._boolVarByKeyRef.value[varName]
    this._boolVarsRevisionRef.value++
    triggerRef(this._boolVarByKeyRef)
  }
  setVectorVarValue(varName: string, value: SimVec4): void {
    this._vectorVarByKeyRef.value[varName] = value
    this._vectorVarsRevisionRef.value++
    this._populatedVectorVarNamesSet.add(varName)
    triggerRef(this._vectorVarByKeyRef)
  }
  clearVectorVarValue(varName: string): void {
    if (!this._populatedVectorVarNamesSet.delete(varName)) return
    delete this._vectorVarByKeyRef.value[varName]
    this._vectorVarsRevisionRef.value++
    triggerRef(this._vectorVarByKeyRef)
  }
  setVectorVarAxisValue(varName: string, axis: keyof SimVec4, value: number): void {
    const currentValue = this._vectorVarByKeyRef.value[varName]
    const nextValue = {
      ...(currentValue ?? ZERO_VEC4),
      [axis]: value,
    }
    this.setVectorVarValue(varName, nextValue)
  }
  setQuatVarValue(varName: string, value: SimVec4): void {
    this._quatVarByKeyRef.value[varName] = value
    this._quatVarsRevisionRef.value++
    this._populatedQuatVarNamesSet.add(varName)
    triggerRef(this._quatVarByKeyRef)
  }
  clearQuatVarValue(varName: string): void {
    if (!this._populatedQuatVarNamesSet.delete(varName)) return
    delete this._quatVarByKeyRef.value[varName]
    this._quatVarsRevisionRef.value++
    triggerRef(this._quatVarByKeyRef)
  }
  setQuatVarAxisValue(varName: string, axis: keyof SimVec4, value: number): void {
    const currentValue = this._quatVarByKeyRef.value[varName]
    const nextValue = {
      ...(currentValue ?? IDENTITY_QUAT_VEC4),
      [axis]: value,
    }
    this.setQuatVarValue(varName, nextValue)
  }

  get wrapperWeightByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, number>>>>> {
    return this._wrapperWeightByKeyRef
  }
  get wrapperWeightsRevisionRef(): Readonly<Ref<number>> {
    return this._wrapperWeightsRevisionRef
  }
  get populatedWrapperWeightNamesSet(): ReadonlySet<string> {
    return this._populatedWrapperWeightNamesSet
  }
  setWrapperWeightValue(weightName: string, value: number): void {
    this._wrapperWeightByKeyRef.value[weightName] = value
    this._wrapperWeightsRevisionRef.value++
    this._populatedWrapperWeightNamesSet.add(weightName)
    triggerRef(this._wrapperWeightByKeyRef)
  }
  clearWrapperWeightValue(weightName: string): void {
    if (!this._populatedWrapperWeightNamesSet.delete(weightName)) return
    delete this._wrapperWeightByKeyRef.value[weightName]
    this._wrapperWeightsRevisionRef.value++
    triggerRef(this._wrapperWeightByKeyRef)
  }

  get tagValueByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, number>>>>> {
    return this._tagValueByKeyRef
  }
  get tagValuesRevisionRef(): Readonly<Ref<number>> {
    return this._tagValuesRevisionRef
  }
  get populatedTagValueNamesSet(): ReadonlySet<string> {
    return this._populatedTagValueNamesSet
  }
  setTagValueValue(tagName: string, value: number): void {
    this._tagValueByKeyRef.value[tagName] = value
    this._tagValuesRevisionRef.value++
    this._populatedTagValueNamesSet.add(tagName)
    triggerRef(this._tagValueByKeyRef)
  }
  clearTagValueValue(tagName: string): void {
    if (!this._populatedTagValueNamesSet.delete(tagName)) return
    delete this._tagValueByKeyRef.value[tagName]
    this._tagValuesRevisionRef.value++
    triggerRef(this._tagValueByKeyRef)
  }

  get entityTagByKeyRef(): Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>> {
    return this._entityTagByKeyRef
  }
  get entityTagsRevisionRef(): Readonly<Ref<number>> {
    return this._entityTagsRevisionRef
  }
  get populatedEntityTagNamesSet(): ReadonlySet<string> {
    return this._populatedEntityTagNamesSet
  }
  setEntityTagValue(tagName: string, value: boolean): void {
    this._entityTagByKeyRef.value[tagName] = value
    this._entityTagsRevisionRef.value++
    this._populatedEntityTagNamesSet.add(tagName)
    triggerRef(this._entityTagByKeyRef)
  }
  clearEntityTagValue(tagName: string): void {
    if (!this._populatedEntityTagNamesSet.delete(tagName)) return
    delete this._entityTagByKeyRef.value[tagName]
    this._entityTagsRevisionRef.value++
    triggerRef(this._entityTagByKeyRef)
  }
}