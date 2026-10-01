import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { createQuickTodo, deleteQuickTodo, listQuickTodos, updateQuickTodo, type QuickTodo } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

function TodoRow({ todo, onChanged }: { todo: QuickTodo; onChanged: () => void }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Checkbox
        checked={todo.done}
        onCheckedChange={async (checked) => {
          await updateQuickTodo(todo.id, { done: checked === true })
          onChanged()
        }}
      />
      <span className={`flex-1 text-sm ${todo.done ? 'text-muted-foreground line-through' : ''}`}>{todo.text}</span>
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
    </li>
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
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" className="flex-1" />
        <Button type="submit" size="sm" disabled={submitting}>
          Add
        </Button>
      </form>
      {todos.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing on your list.</p>}
      {todos.data && todos.data.length > 0 && (
        <ul className="divide-y">
          {todos.data.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onChanged={todos.refetch} />
          ))}
        </ul>
      )}
    </div>
  )
}
