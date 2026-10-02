// Enough of mdast's shape for this plugin; @types/mdast isn't a direct dependency.
interface MdNode {
  type: string
  children?: MdNode[]
  position?: { start: { offset?: number } }
  data?: { hProperties?: Record<string, unknown> }
}

/**
 * remark plugin: `$$…$$` written within a line renders as display math, as MarkdownEditor does.
 * remark-math only treats `$$` as display when the delimiters sit on their own lines, and parses
 * the one-line form as inline math; this retags those nodes so rehype-katex renders display mode.
 */
export function remarkDisplayMath() {
  return (tree: MdNode, file: { value: unknown }) => transform(tree, String(file.value))
}

function transform(node: MdNode, source: string) {
  for (const child of node.children ?? []) transform(child, source)
  const offset = node.position?.start.offset
  if (node.type !== 'inlineMath' || offset === undefined || !source.startsWith('$$', offset)) return
  node.data = { ...node.data, hProperties: { className: ['language-math', 'math-display'] } }
}
