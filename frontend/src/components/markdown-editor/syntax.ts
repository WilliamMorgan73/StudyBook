import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

const CODE_NODE_NAMES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

// Matches enough of SyntaxNode's shape to walk parents without importing the type from
// @lezer/common directly (not resolvable as a direct import under this project's pnpm layout).
export interface WalkableNode {
  type: { name: string }
  parent: WalkableNode | null
}

export function isInsideCode(state: EditorState, pos: number): boolean {
  let node: WalkableNode | null = syntaxTree(state).resolveInner(pos, 1)
  while (node) {
    if (CODE_NODE_NAMES.has(node.type.name)) return true
    node = node.parent
  }
  return false
}
