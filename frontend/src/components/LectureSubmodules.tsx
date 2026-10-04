import { NotebookText, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listSubmodulesIndex, updateLecture } from '@/lib/api'

type SubmoduleRef = { id: number; title: string }

/**
 * The Submodules a Lecture covered, each a link to its notes, plus a menu that ticks them on and off
 * (each tick saves straight away). Works on feed lectures too: the feed never touches their Submodules.
 */
export function LectureSubmodules({
  lecture,
  options,
  onChanged,
  className = '',
}: {
  lecture: { id: number; module_id: number; submodules: SubmoduleRef[] }
  /** The Module's Submodules to pick from; fetched when the menu first opens if left out. */
  options?: SubmoduleRef[]
  onChanged: () => void | Promise<void>
  className?: string
}) {
  const [fetched, setFetched] = useState<SubmoduleRef[] | null>(null)
  // The ticks since the last save landed, so the menu doesn't flick back while it refetches.
  const [pending, setPending] = useState<number[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const choices = options ?? fetched
  const selected = pending ?? lecture.submodules.map((s) => s.id)

  function handleOpenChange(open: boolean) {
    if (!open || options || fetched) return
    listSubmodulesIndex()
      .then((all) => setFetched(all.filter((s) => s.module_id === lecture.module_id)))
      .catch(() => setError('Could not load the submodules.'))
  }

  async function toggle(id: number, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((s) => s !== id)
    setPending(next)
    setError(null)
    try {
      await updateLecture(lecture.id, { submodule_ids: next })
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {lecture.submodules.map((s) => (
        <Link
          key={s.id}
          to={`/modules/${lecture.module_id}/submodules/${s.id}`}
          title={`Open notes: ${s.title}`}
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <NotebookText className="size-3 shrink-0" />
          <span className="truncate">{s.title}</span>
        </Link>
      ))}
      <DropdownMenu onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {lecture.submodules.length === 0 ? (
              'Link notes'
            ) : (
              <>
                <Pencil className="size-3" />
                <span className="sr-only">Change covered submodules</span>
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>Covered submodules</DropdownMenuLabel>
          {choices === null ? (
            <p className="px-1.5 py-1 text-sm text-muted-foreground">Loading…</p>
          ) : choices.length === 0 ? (
            <p className="px-1.5 py-1 text-sm text-muted-foreground">This module has no submodules yet.</p>
          ) : (
            choices.map((s) => (
              <DropdownMenuCheckboxItem
                key={s.id}
                checked={selected.includes(s.id)}
                onCheckedChange={(checked) => toggle(s.id, checked)}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="truncate">{s.title}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
