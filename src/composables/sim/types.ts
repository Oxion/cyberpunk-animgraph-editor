import { SimVec4 } from "@/utils/sim"
import { Ref } from "vue"

export interface IDraftBoard {
  readonly id: string

  readonly numericFeatureByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, number>>>>>
  readonly stringFeatureByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, string>>>>>
  readonly booleanFeatureByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>>
  readonly vectorFeatureByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>>
  readonly quatFeatureByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>>

  readonly numericFeaturesRevisionRef: Readonly<Ref<number>>
  readonly stringFeaturesRevisionRef: Readonly<Ref<number>>
  readonly booleanFeaturesRevisionRef: Readonly<Ref<number>>
  readonly vectorFeaturesRevisionRef: Readonly<Ref<number>>
  readonly quatFeaturesRevisionRef: Readonly<Ref<number>>

  readonly populatedNumericFeatureKeyToFeatureMap: ReadonlyMap<string, { feature: string; property: string }>
  readonly populatedStringFeatureKeyToFeatureMap: ReadonlyMap<string, { feature: string; property: string }>
  readonly populatedBooleanFeatureKeyToFeatureMap: ReadonlyMap<string, { feature: string; property: string }>
  readonly populatedVectorFeatureKeyToFeatureMap: ReadonlyMap<string, { feature: string; property: string }>
  readonly populatedQuatFeatureKeyToFeatureMap: ReadonlyMap<string, { feature: string; property: string }>

  setNumericFeatureValue(feature: string, property: string, value: number): void
  setStringFeatureValue(feature: string, property: string, value: string): void
  setBooleanFeatureValue(feature: string, property: string, value: boolean): void
  setVectorFeatureValue(feature: string, property: string, value: SimVec4): void
  setVectorFeatureAxisValue(feature: string, property: string, axis: keyof SimVec4, value: number): void
  setQuatFeatureValue(feature: string, property: string, value: SimVec4): void
  setQuatFeatureAxisValue(feature: string, property: string, axis: keyof SimVec4, value: number): void

  readonly floatVarByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, number>>>>>
  readonly intVarByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, number>>>>>
  readonly boolVarByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>>
  readonly vectorVarByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>>
  readonly quatVarByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, SimVec4>>>>>

  readonly floatVarsRevisionRef: Readonly<Ref<number>>
  readonly intVarsRevisionRef: Readonly<Ref<number>>
  readonly boolVarsRevisionRef: Readonly<Ref<number>>
  readonly vectorVarsRevisionRef: Readonly<Ref<number>>
  readonly quatVarsRevisionRef: Readonly<Ref<number>>

  readonly populatedFloatVarNamesSet: ReadonlySet<string>
  readonly populatedIntVarNamesSet: ReadonlySet<string>
  readonly populatedBoolVarNamesSet: ReadonlySet<string>
  readonly populatedVectorVarNamesSet: ReadonlySet<string>
  readonly populatedQuatVarNamesSet: ReadonlySet<string>

  setFloatVarValue(varName: string, value: number): void
  setIntVarValue(varName: string, value: number): void
  setBoolVarValue(varName: string, value: boolean): void
  setVectorVarValue(varName: string, value: SimVec4): void
  setVectorVarAxisValue(varName: string, axis: keyof SimVec4, value: number): void
  setQuatVarValue(varName: string, value: SimVec4): void
  setQuatVarAxisValue(varName: string, axis: keyof SimVec4, value: number): void

  readonly wrapperWeightByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, number>>>>>

  readonly wrapperWeightsRevisionRef: Readonly<Ref<number>>

  readonly populatedWrapperWeightNamesSet: ReadonlySet<string>

  setWrapperWeightValue(weightName: string, value: number): void

  readonly tagValueByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, number>>>>>

  readonly tagValuesRevisionRef: Readonly<Ref<number>>

  readonly populatedTagValueNamesSet: ReadonlySet<string>

  setTagValueValue(tagName: string, value: number): void

  readonly entityTagByKeyRef: Readonly<Ref<Readonly<Partial<Record<string, boolean>>>>>

  readonly entityTagsRevisionRef: Readonly<Ref<number>>

  readonly populatedEntityTagNamesSet: ReadonlySet<string>

  setEntityTagValue(tagName: string, value: boolean): void
}