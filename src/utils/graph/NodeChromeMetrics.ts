/**
 * Shared chrome metrics — no imports from DiagramConversion / NodeRowModel
 * (breaks circular init between those modules).
 */

export const SM_NODE_HEADER_HEIGHT = 40
/** Inner padding for stacked children in PropertyGroup (matches AnimgraphParser column layout). */
export const PROPERTY_GROUP_INNER_PADDING = 12
/** Outer content inset on PropertyGroup containers (matches AnimgraphParser nodePadding). */
export const PROPERTY_GROUP_OUTER_PADDING = 20
export const STATE_OVERVIEW_WIDTH = 240
export const STATE_OVERVIEW_BODY_HEIGHT = 36
export const SM_INPUT_CHAIN_OVERVIEW_WIDTH = 240
export const SM_INPUT_CHAIN_OVERVIEW_BODY_HEIGHT = 36
export const SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT = 13
export const SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y = 10
/** Top offset of first property row text inside the node (below header). */
export const PROPERTY_ROW_BODY_TOP = 8
/** Must match overview/typed-data body Text style fontSize. */
export const PROPERTY_ROW_FONT_SIZE = 10
/** Preferred max width for row-composed node content (load-time grow cap). */
export const NODE_CONTENT_MAX_WIDTH = 420
/** Open-scope button size in node header (matches PixiGraphRenderer). */
export const NODE_OPEN_SCOPE_BTN_SIZE = 22
