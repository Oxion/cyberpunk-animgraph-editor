export const mergeSets = <T>(
  set: Set<T>,
  outputSet: Set<T>
) => {
  for (const item of set) {
    outputSet.add(item)
  }
}

export const mergeUniqueStrings = (
  seenStringsSet: Set<string>,
  strings: string[],
  outputStrings: string[]
) => {
  for (const item of strings) {
    if (seenStringsSet.has(item)) continue
    seenStringsSet.add(item)
    outputStrings.push(item)
  }
}