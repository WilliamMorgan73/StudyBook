import { Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { createTodo, deleteTodo, updateTodo, type Todo } from '@/lib/api'
import { listItem } from '@/lib/motion'

/** An Assignment's steps as one bordered box: progress along the top, rows, then an add-step field. */
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
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const done = todos.filter((t) => t.done).length

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
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Checklist</h2>
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

      <ul>
        <AnimatePresence initial={false}>
          {todos.map((todo) => (
            <motion.li key={todo.id} variants={listItem} initial="hidden" animate="shown" exit="exit">
              <div className="group flex items-center gap-3 px-4 py-1.5 hover:bg-muted/40">
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
                  className={`flex-1 cursor-pointer text-sm transition-colors ${todo.done ? 'text-muted-foreground line-through' : ''}`}
                >
                  {todo.text}
                </label>
                <button
                  type="button"
                  aria-label={`Delete "${todo.text}"`}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={async () => {
                    await deleteTodo(assignmentId, todo.id)
                    onChanged()
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

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
