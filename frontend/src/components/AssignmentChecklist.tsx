import { ChevronRight, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { createTodo, deleteTodo, updateTodo, type Todo } from '@/lib/api'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'studybook.checklist.collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

/** An Assignment's steps as one bordered box: progress along the top, collapsible/scrollable rows, then an add-step field. */
export function AssignmentChecklist({
  assignmentId,
  todos,
  color,
  onChanged,
}: {
  assignmentId: number
  todos: Todo[]
  /** The Module's color, used for the progress bar. */
  color?: string
  onChanged: () => void
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Storage unavailable: toggle still works for this visit.
    }
  }

  const done = todos.filter((t) => t.done).length

  // Incomplete items at the top in original order; completed items sink to the bottom in original order.
  const sortedTodos = useMemo(() => {
    const incomplete = todos.filter((t) => !t.done)
    const completed = todos.filter((t) => t.done)
    return [...incomplete, ...completed]
  }, [todos])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      await createTodo(assignmentId, text.trim())
      setText('')
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          {todos.length > 0 ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              className="flex items-center gap-1.5 font-medium hover:text-foreground"
            >
              <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
              Checklist
            </button>
          ) : (
            <h2 className="font-medium">Checklist</h2>
          )}
          {todos.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {done} of {todos.length} done
            </span>
          )}
        </div>
        {todos.length > 0 && (
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuemin={0}
            aria-valuemax={todos.length}
            aria-valuenow={done}
          >
            <motion.div
              className="h-full rounded-full bg-primary"
              style={color ? { backgroundColor: color } : undefined}
              initial={false}
              animate={{ width: `${(done / todos.length) * 100}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {todos.length > 0 && !collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <ul className="max-h-44 divide-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
              {sortedTodos.map((todo) => (
                <motion.li
                  key={todo.id}
                  layout="position"
                  transition={{ duration: 0.2 }}
                  className="group flex items-center gap-3 px-4 py-1.5 hover:bg-muted/40"
                >
                  <Checkbox
                    id={`todo-${todo.id}`}
                    checked={todo.done}
                    onCheckedChange={async (checked) => {
                      await updateTodo(assignmentId, todo.id, { done: checked === true })
                      onChanged()
                    }}
                  />
                  <label
                    htmlFor={`todo-${todo.id}`}
                    className={cn(
                      'min-w-0 flex-1 cursor-pointer break-words text-sm transition-colors',
                      todo.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {todo.text}
                  </label>
                  <button
                    type="button"
                    aria-label={`Delete "${todo.text}"`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={async () => {
                      await deleteTodo(assignmentId, todo.id)
                      onChanged()
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-center gap-3 border-t px-4 py-2 focus-within:bg-muted/40">
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={todos.length === 0 ? 'Break the work into steps…' : 'Add a step'}
          aria-label="New step"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>
    </section>
  )
}

