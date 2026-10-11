import { StateKey } from '../TypedStore'

/** Engine TAnimInstanceSharedVar tag/name: fppCamera / sharedVar (= pitchFinal). */
export const FPP_CAMERA_PITCH = new StateKey<number>('fppCamera.sharedVar')

/** Engine AnimNode_FPPCamera::SetupAdditionalFloatTracks — MarkExtraFloatTrack names. */
export const FPP_CAMERA_EXTRA_TRACKS = [
  'YawInput',
  'YawRef',
  'PitchInput',
  'PitchRef',
] as const
