/** Describes a Data field mutation for side-effect handlers. */
export type OwnerFieldChange = {
  field: string
  /** Array indices removed (HandleRef membership). Process high→low. */
  removedIndices?: readonly number[]
  removedIds?: readonly string[]
  addedIds?: readonly string[]
}
