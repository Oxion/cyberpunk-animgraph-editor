/**
 * Collect diagram box `$type`s for header-color codegen.
 * Animgraph: catalog types that project to a box (!embedded).
 * Diagram-native: DiagramNodeDefinitionRegistry.
 */

import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { isProjectedEmbedded } from '../../projection'
import { DiagramNodeDefinitionRegistry } from '../DiagramNodeDefinition'

/**
 * Unique sorted list of types that appear as canvas boxes.
 */
export function collectNodeHeaderTypes(): string[] {
  const out = new Set<string>()

  for (const t of NodeDefinitionRegistry.getAllNodeTypes()) {
    if (!isProjectedEmbedded(t)) out.add(t)
  }

  for (const t of DiagramNodeDefinitionRegistry.getAllTypes()) out.add(t)

  return [...out].sort((a, b) => a.localeCompare(b))
}
