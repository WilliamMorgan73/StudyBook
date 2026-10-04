import { NotebookText, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ApplyTopicsDialog } from '@/components/ApplyTopicsDialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listLectures, listSubmodulesIndex, setLecturesSubmodules, type Lecture } from '@/lib/api'
import { topicScopes, type TopicScope } from '@/lib/lectureSchedule'

type SubmoduleRef = { id: number; title: string }

/**
 * The Submodules a Lecture covered, each a link to its notes, plus a menu to change them: ticks are
 * staged, and Apply saves them, first asking which other lectures in the series get the same topics
 * (`ApplyTopicsDialog`) when there are any. Works on feed lectures too: the feed never touches them.
 */
export function LectureSubmodules({
  lecture,
  options,
  moduleLectures,
  onChanged,
  className = '',
}: {
  lecture: { id: number; module_id: number; submodules: SubmoduleRef[] }
  /** The Module's Submodules to pick from; fetched when the menu first opens if left out. */
  options?: SubmoduleRef[]
  /** The Module's lectures, which the Apply prompt's choices come from; fetched on Apply if left out. */
  moduleLectures?: Lecture[]
  onChanged: () => void | Promise<void>
  className?: string
}) {
  const [fetched, setFetched] = useState<SubmoduleRef[] | null>(null)
  // The ticks while the menu is open; closing it without Apply drops them.
  const [draft, setDraft] = useState<number[]>([])
  const [applying, setApplying] = useState<{ scopes: TopicScope[]; submoduleIds: number[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const choices = options ?? fetched
  const current = lecture.submodules.map((s) => s.id)
  const changed = draft.length !== current.length || draft.some((id) => !current.includes(id))

  function handleOpenChange(open: boolean) {
    if (!open) return
    setDraft(current)
    if (options || fetched) return
    listSubmodulesIndex()
      .then((all) => setFetched(all.filter((s) => s.module_id === lecture.module_id)))
      .catch(() => setError('Could not load the submodules.'))
  }

  function toggle(id: number, checked: boolean) {
    setDraft((d) => (checked ? [...d, id] : d.filter((s) => s !== id)))
  }

  async function apply() {
    const submoduleIds = draft
    setError(null)
    try {
      const all = moduleLectures ?? (await listLectures(lecture.module_id))
      const full = all.find((l) => l.id === lecture.id)
      const scopes = full ? topicScopes(full, all) : []
      if (scopes.length > 1) {
        setApplying({ scopes, submoduleIds })
        return
      }
      await setLecturesSubmodules([lecture.id], submoduleIds)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
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
                checked={draft.includes(s.id)}
                onCheckedChange={(checked) => toggle(s.id, checked)}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="truncate">{s.title}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
          {choices !== null && choices.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!changed} onSelect={() => void apply()} className="justify-center font-medium">
                Apply
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-xs text-destructive">{error}</span>}
      <ApplyTopicsDialog
        scopes={applying?.scopes ?? null}
        submoduleIds={applying?.submoduleIds ?? []}
        onOpenChange={(open) => {
          if (!open) setApplying(null)
        }}
        onApplied={onChanged}
      />
    </div>
  )
}
