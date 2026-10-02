import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

import { CalloutIcon } from '@/components/CalloutIcon'
import type { CalloutType } from '@/lib/markdownBlocks'
import { remarkCallouts } from '@/lib/remarkCallouts'
import { remarkDisplayMath } from '@/lib/remarkDisplayMath'
import { cn } from '@/lib/utils'

const components: Components = {
  // remarkCallouts tags a callout's title paragraph with its type, so the icon can lead it.
  p({ node, children, ...props }) {
    const calloutType = node?.properties?.dataCalloutType
    return (
      <p {...props}>
        {typeof calloutType === 'string' && <CalloutIcon type={calloutType as CalloutType} />}
        {children}
      </p>
    )
  },
}

/**
 * Read-only markdown for content shown outside the editor: GFM (tables, checklists), `$inline$`
 * and `$$display$$` math (one-line or fenced, as in the editor), and `> [!type]` callouts.
 */
export function MarkdownView({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkDisplayMath, remarkCallouts]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
