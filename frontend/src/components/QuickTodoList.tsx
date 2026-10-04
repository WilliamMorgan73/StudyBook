import { ListFilter, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  createQuickTodo,
  deleteQuickTodo,
  listQuickTodos,
  updateQuickTodo,
  type ModuleSummary,
  type QuickTodo,
} from '@/lib/api'
import { listItem } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'
import { useSampleData } from '@/lib/sampleData'

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

/** A category in the Overview's filter: 'general', or a module id. */
type Category = 'general' | number

const HIDDEN_KEY = 'studybook.todoFilter.hidden'

/** The categories the Overview's filter hides, remembered per browser. */
function readHidden(): Category[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((c) => c === 'general' || typeof c === 'number') : []
  } catch {
    return []
  }
}

function writeHidden(hidden: Category[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
  } catch {
    // Storage blocked: the filter just won't be remembered.
  }
}

/**
 * A to-do list. With `moduleId` it's that module's own list. Without, it's the Overview's: new
 * to-dos are General, and given `modules` it shows every module's to-dos too, under a heading per
 * module, with a filter to hide categories.
 */
export function QuickTodoList({ moduleId, modules = [] }: { moduleId?: number; modules?: ModuleSummary[] }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hidden, setHidden] = useState<Category[]>(() => (moduleId === undefined ? readHidden() : []))
  const sample = useSampleData()
  const todos = useAsync(
    () =>
      sample
        ? Promise.resolve(sample.quickTodos.filter((t) => moduleId === undefined || t.module_id === moduleId))
        : listQuickTodos({ moduleId }),
    [moduleId],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await createQuickTodo(text.trim(), moduleId ?? null)
      setText('')
      todos.refetch()
    } finally {
      setSubmitting(false)
    }
  }

  function toggleCategory(category: Category, shown: boolean) {
    const next = shown ? hidden.filter((c) => c !== category) : [...hidden, category]
    setHidden(next)
    writeHidden(next)
  }

  // On the Overview: General first, then each module's list in the modules' order. Modules without
  // to-dos get no heading; General gets one only when a module's heading would follow it.
  const groups: { category: Category; module?: ModuleSummary; todos: QuickTodo[] }[] =
    moduleId !== undefined
      ? [{ category: moduleId, todos: todos.data ?? [] }]
      : [
          { category: 'general' as const, todos: (todos.data ?? []).filter((t) => t.module_id === null) },
          ...modules.map((m) => ({
            category: m.id,
            module: m,
            todos: (todos.data ?? []).filter((t) => t.module_id === m.id),
          })),
        ].filter((g) => g.todos.length > 0 && !hidden.includes(g.category))
  const showHeadings = groups.some((g) => g.module !== undefined)
  const filterable = moduleId === undefined && modules.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" className="flex-1" />
        <Button type="submit" size="sm" disabled={submitting}>
          Add
        </Button>
        {filterable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant={hidden.length > 0 ? 'secondary' : 'ghost'}
                aria-label="Filter to-dos"
                title="Filter to-dos"
                className="self-center"
              >
                <ListFilter />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Show to-dos from</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={!hidden.includes('general')}
                onCheckedChange={(shown) => toggleCategory('general', shown)}
                onSelect={(e) => e.preventDefault()}
              >
                General
              </DropdownMenuCheckboxItem>
              {modules.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.id}
                  checked={!hidden.includes(m.id)}
                  onCheckedChange={(shown) => toggleCategory(m.id, shown)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                  <span className="truncate">{m.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </form>
      {todos.data && groups.every((g) => g.todos.length === 0) && (
        <p className="text-sm text-muted-foreground">
          {todos.data.length > 0 ? 'Everything here is filtered out.' : 'Nothing on your list.'}
        </p>
      )}
      {groups.some((g) => g.todos.length > 0) && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.category}>
              {showHeadings && (
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {group.module && (
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.module.color }} aria-hidden />
                  )}
                  {group.module ? (
                    <Link to={`/modules/${group.module.id}`} className="truncate hover:underline">
                      {group.module.name}
                    </Link>
                  ) : (
                    'General'
                  )}
                </h3>
              )}
              <ul className="divide-y">
                <AnimatePresence initial={false}>
                  {group.todos.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} onChanged={todos.refetch} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
