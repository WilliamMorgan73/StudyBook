import { CALLOUT_LABELS, parseCalloutHeader } from '@/lib/markdownBlocks'

// Enough of mdast's shape for this plugin; @types/mdast isn't a direct dependency.
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

/**
 * remark plugin: a blockquote opening with `[!type] Title` becomes
 * `<aside class="callout callout-type">` led by `<p class="callout-title" data-callout-type>`,
 * the same syntax MarkdownEditor renders. The title defaults to the type's label.
 */
export function remarkCallouts() {
  return (tree: MdNode) => transform(tree)
}

function transform(node: MdNode) {
  for (const child of node.children ?? []) transform(child)
  if (node.type === 'blockquote') toCallout(node)
}

function toCallout(quote: MdNode) {
  const paragraph = quote.children?.[0]
  const first = paragraph?.type === 'paragraph' ? paragraph.children?.[0] : undefined
  if (!paragraph?.children || first?.type !== 'text' || first.value === undefined) return

  const newline = first.value.indexOf('\n')
  const firstLine = newline === -1 ? first.value : first.value.slice(0, newline)
  const header = parseCalloutHeader(`> ${firstLine}`)
  if (!header) return

  // The title is the rest of the header line, which may continue past this text node
  // (`[!note] **Bold** title`): move inline siblings up to the first line break into it.
  // Untrimmed (unlike header.title), so "The " keeps its space before a following **bold**.
  const titleText = firstLine.slice(header.markerTo - 2) // markerTo counts the "> " added above
  const title: MdNode[] = titleText.trim() ? [{ type: 'text', value: titleText }] : []
  const body = paragraph.children.slice(1)
  if (newline === -1) {
    while (body.length > 0) {
      const next = body[0]
      const breakAt = next.type === 'text' && next.value !== undefined ? next.value.indexOf('\n') : -1
      if (breakAt !== -1) {
        if (breakAt > 0) title.push({ type: 'text', value: next.value!.slice(0, breakAt) })
        body[0] = { type: 'text', value: next.value!.slice(breakAt + 1) }
        break
      }
      title.push(body.shift()!)
    }
  } else {
    body.unshift({ type: 'text', value: first.value.slice(newline + 1) })
  }

  const hasBody = body.some((n) => n.type !== 'text' || n.value?.trim())
  const rest = quote.children!.slice(1)
  quote.children = [
    {
      type: 'paragraph',
      data: { hName: 'p', hProperties: { className: ['callout-title'], dataCalloutType: header.type } },
      children: title.length > 0 ? title : [{ type: 'text', value: CALLOUT_LABELS[header.type] }],
    },
    ...(hasBody ? [{ ...paragraph, children: body }] : []),
    ...rest,
  ]
  quote.data = { ...quote.data, hName: 'aside', hProperties: { className: ['callout', `callout-${header.type}`] } }
}
