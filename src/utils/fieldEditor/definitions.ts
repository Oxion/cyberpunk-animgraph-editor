import type { FieldEditorOverlay } from './types'

/** Per-type field editor overlays (deep structs included). */
export const TYPE_FIELD_EDITOR_OVERLAYS: Record<
  string,
  Record<string, FieldEditorOverlay>
> = {
  animLookAtPartsDependency: {
    angle: { slider: { min: 0, max: 180, step: 1 } },
    speedToTargetFactor: { slider: { min: 0, max: 720, step: 1 } },
    verticalPullSpeedFactor: { slider: { min: 0, max: 720, step: 1 } },
    horizontalPullSpeedFactor: { slider: { min: 0, max: 720, step: 1 } },
    pullScaleBySquareSizeFactor: { slider: { min: 0, max: 2, step: 0.01 } },
    innerSquareScale: { slider: { min: 0, max: 1, step: 0.01 } },
  },
  animLookAtStateMachineSettings: {
    sphereRadius: { slider: { min: 0, max: 5, step: 0.01 } },
    followingSpeedFactor: { slider: { min: 0, max: 720, step: 1 } },
    transitionSpeedMultiplier: { slider: { min: 0, max: 10, step: 0.01 } },
    blendWeightPowFactor: { slider: { min: 0, max: 4, step: 0.01 } },
  },
  Color: {
    Red: { slider: { min: 0, max: 255, step: 1 } },
    Green: { slider: { min: 0, max: 255, step: 1 } },
    Blue: { slider: { min: 0, max: 255, step: 1 } },
    Alpha: { slider: { min: 0, max: 255, step: 1 } },
  },
  CurveKeyFloat: {
    Point: { slider: { min: 0, max: 180, step: 0.01 } },
    Value: { slider: { min: 0, max: 1, step: 0.01 } },
  },
}
