import { BookOpen, Info, Lightbulb, PencilLine, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { CalloutType } from '@/lib/markdownBlocks'

const CALLOUT_ICONS: Record<CalloutType, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  warning: TriangleAlert,
  definition: BookOpen,
  example: PencilLine,
}

export function CalloutIcon({ type }: { type: CalloutType }) {
  const Icon = CALLOUT_ICONS[type]
  return <Icon aria-hidden />
}
