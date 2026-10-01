import { Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { createQuickTodo, deleteQuickTodo, listQuickTodos, updateQuickTodo, type QuickTodo } from '@/lib/api'
import { listItem } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'

function TodoRow({ todo, onChanged }: { todo: QuickTodo; onChanged: () => void }) {
  return (
    // Padding lives on the inner row so the exit can collapse the <li> all the way to zero.
    <motion.li variants={listItem} initial="hidden" animate="shown" exit="exit">
      <div className="flex items-center gap-2 py-1.5">
        <Checkbox
          checked={todo.done}
          onCheckedChange={async (checked) => {
            await updateQuickTodo(todo.id, { done: checked === true })
            onChanged()
          }}
        />
        <span className={`flex-1 text-sm transition-colors ${todo.done ? 'text-muted-foreground' : ''}`}>
          {/* A background-drawn line rather than text-decoration, so it can grow left to right;
              box-decoration-clone repeats it on every wrapped line. */}
          <span
            className="box-decoration-clone bg-no-repeat transition-[background-size] duration-300 [background-image:linear-gradient(currentColor,currentColor)] [background-position:0_55%]"
            style={{ backgroundSize: `${todo.done ? 100 : 0}% 1px` }}
          >
            {todo.text}
          </span>
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete to-do"
          onClick={async () => {
            await deleteQuickTodo(todo.id)
            onChanged()
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </motion.li>
  )
}

export function QuickTodoList() {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const todos = useAsync(() => listQuickTodos(), [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await createQuickTodo(text.trim())
      setText('')
      todos.refetch()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" className="flex-1" />
        <Button type="submit" size="sm" disabled={submitting}>
          Add
        </Button>
      </form>
      {todos.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing on your list.</p>}
      {todos.data && todos.data.length > 0 && (
        <ul className="max-h-64 min-h-0 flex-1 divide-y overflow-y-auto lg:max-h-none">
          <AnimatePresence initial={false}>
            {todos.data.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onChanged={todos.refetch} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
