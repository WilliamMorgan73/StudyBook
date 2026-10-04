import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { enter } from '@/lib/motion'
import { cn } from '@/lib/utils'

export interface ErrorAction {
  label: string
  to?: string
  onClick?: () => void
  icon?: LucideIcon
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
}

export interface ErrorStateProps {
  icon: LucideIcon
  iconVariant?: 'default' | 'destructive' | 'warning' | 'muted'
  badge?: string
  title: string
  description?: ReactNode
  primaryAction?: ErrorAction
  secondaryAction?: ErrorAction
  codeSnippet?: string
  details?: ReactNode
  className?: string
  compact?: boolean
}

const ICON_VARIANTS = {
  default: 'bg-primary/10 text-primary ring-primary/20',
  destructive: 'bg-destructive/10 text-destructive ring-destructive/20',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/25',
  muted: 'bg-muted text-muted-foreground ring-border',
}

export function ErrorState({
  icon: Icon,
  iconVariant = 'muted',
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  codeSnippet,
  details,
  className,
  compact = false,
}: ErrorStateProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopyCode() {
    if (!codeSnippet) return
    try {
      await navigator.clipboard.writeText(codeSnippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failure
    }
  }

  function renderActionButton(action: ErrorAction, isPrimary: boolean) {
    const ActionIcon = action.icon
    const defaultVariant = isPrimary ? 'default' : 'outline'
    const variant = action.variant ?? defaultVariant

    const content = (
      <>
        {ActionIcon && <ActionIcon className="size-4" />}
        <span>{action.label}</span>
      </>
    )

    if (action.to) {
      return (
        <Button key={action.label} asChild variant={variant} size={compact ? 'sm' : 'default'}>
          <Link to={action.to}>{content}</Link>
        </Button>
      )
    }

    return (
      <Button
        key={action.label}
        variant={variant}
        size={compact ? 'sm' : 'default'}
        onClick={action.onClick}
      >
        {content}
      </Button>
    )
  }

  return (
    <motion.div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-4' : 'mx-auto max-w-lg px-6 py-12',
        className,
      )}
      {...enter}
    >
      <div
        className={cn(
          'mb-4 flex items-center justify-center rounded-2xl ring-1 shadow-xs transition-colors',
          compact ? 'size-12 rounded-xl' : 'size-16',
          ICON_VARIANTS[iconVariant],
        )}
      >
        <Icon className={compact ? 'size-6' : 'size-8'} />
      </div>

      {badge && (
        <Badge variant="outline" className="mb-2.5 font-mono text-[0.7rem] uppercase tracking-wider">
          {badge}
        </Badge>
      )}

      <h2
        className={cn(
          'font-semibold tracking-tight text-foreground',
          compact ? 'text-base' : 'text-xl md:text-2xl',
        )}
      >
        {title}
      </h2>

      {description && (
        <div
          className={cn(
            'mt-2 text-muted-foreground leading-relaxed',
            compact ? 'text-xs max-w-xs' : 'text-sm max-w-md',
          )}
        >
          {typeof description === 'string' ? <p>{description}</p> : description}
        </div>
      )}

      {codeSnippet && (
        <div className="mt-4 flex w-full max-w-md items-center justify-between gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-left font-mono text-xs">
          <code className="min-w-0 flex-1 truncate text-foreground select-all">{codeSnippet}</code>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyCode}
            title={copied ? 'Copied' : 'Copy command'}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
          </Button>
        </div>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction && renderActionButton(primaryAction, true)}
          {secondaryAction && renderActionButton(secondaryAction, false)}
        </div>
      )}

      {details && (
        <details className="mt-6 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Error details
          </summary>
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs text-muted-foreground select-text whitespace-pre-wrap">
            {details}
          </div>
        </details>
      )}
    </motion.div>
  )
}
