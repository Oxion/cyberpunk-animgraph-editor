/**
 * Test file for the new DOM-like render structure
 */

import type { RenderData } from './graph/diagramTypes'
import { AnimgraphParser } from './AnimgraphParser'
import { RenderExample } from './RenderExample'

// Mock animgraph data for testing
const mockAnimgraphData = {
  nodesToInit: [
    {
      HandleId: 'root_1',
      Data: {
        $type: 'animAnimNode_StateMachine',
        stateNodes: [
          { HandleRefId: 'state_1' },
          { HandleRefId: 'state_2' }
        ],
        transitionNodes: [
          { HandleRefId: 'transition_1' }
        ]
      }
    },
    {
      HandleId: 'state_1',
      Data: {
        $type: 'animAnimNode_SkAnim',
        AnimationName: 'Idle',
        inputNode: { HandleRefId: 'input_1' }
      }
    },
    {
      HandleId: 'state_2',
      Data: {
        $type: 'animAnimNode_SkAnim',
        AnimationName: 'Walk',
        inputNode: { HandleRefId: 'input_2' }
      }
    },
    {
      HandleId: 'transition_1',
      Data: {
        $type: 'animAnimNode_Transition',
        fromState: { HandleRefId: 'state_1' },
        toState: { HandleRefId: 'state_2' }
      }
    },
    {
      HandleId: 'input_1',
      Data: {
        $type: 'animAnimNode_FloatInput',
        inputFloatTrack: { HandleRefId: 'track_1' }
      }
    },
    {
      HandleId: 'input_2',
      Data: {
        $type: 'animAnimNode_FloatInput',
        inputFloatTrack: { HandleRefId: 'track_2' }
      }
    },
    {
      HandleId: 'track_1',
      Data: {
        $type: 'animAnimNode_FloatTrack',
        trackName: 'Speed'
      }
    },
    {
      HandleId: 'track_2',
      Data: {
        $type: 'animAnimNode_FloatTrack',
        trackName: 'Direction'
      }
    }
  ]
}

export function testRenderStructure(): void {
  console.log('=== Testing DOM-like Render Structure ===')
  
  try {
    const parser = new AnimgraphParser()
    const renderExample = new RenderExample()
    
    // Parse the mock data
    console.log('Parsing mock animgraph data...')
    const renderData = parser.parseForRender(mockAnimgraphData)
    
    // Display the structure
    console.log('\nRender structure:')
    renderExample.debugRender(renderData)
    
    // Test various queries
    console.log('\n=== Query Tests ===')
    
    // Get all visible nodes
    const visibleNodes = renderExample.getVisibleNodes(renderData)
    console.log(`Visible nodes: ${visibleNodes.length}`)
    
    // Get nodes by type
    const stateMachineNodes = renderExample.getNodesByType(renderData, 'animAnimNode_StateMachine')
    console.log(`State machine nodes: ${stateMachineNodes.length}`)
    
    const skAnimNodes = renderExample.getNodesByType(renderData, 'animAnimNode_SkAnim')
    console.log(`SkAnim nodes: ${skAnimNodes.length}`)
    
    // Get groups
    const groups = renderExample.getGroups(renderData)
    console.log(`Groups: ${groups.length}`)
    
    // Calculate area
    const totalArea = renderExample.calculateTotalArea(renderData)
    console.log(`Total area: ${totalArea} pixels`)
    
    // Test coordinate lookup
    const nodeAtOrigin = renderExample.findNodeAt(renderData, 50, 50)
    console.log(`Node at (50, 50): ${nodeAtOrigin?.id || 'none'}`)
    
    console.log('\n=== Render Structure Test Completed Successfully ===')
    
  } catch (error) {
    console.error('Error testing render structure:', error)
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRenderStructure()
}
