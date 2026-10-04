import { createContext, useContext } from 'react'

import type {
  Assignment,
  CalendarEvent,
  Flashcard,
  FlashcardDue,
  Lecture,
  ModuleDetail,
  ModuleSummary,
  QuickNote,
  QuickTodo,
  RevisionSession,
  Submodule,
} from '@/lib/api'

/**
 * Made-up data for the setup page's layout previews: one full module and a semester around it,
 * dated relative to `now` so the week view, countdowns and due counts look live. Widgets that
 * fetch their own data read it from `SampleDataContext` instead of the API when it's provided.
 */
export interface SampleData {
  /** The module the module-page preview shows; also `modules[0]`. */
  module: ModuleDetail
  modules: ModuleSummary[]
  upcomingAssignments: Assignment[]
  revisionSessions: RevisionSession[]
  dueFlashcards: FlashcardDue[]
  calendar: CalendarEvent[]
  quickTodos: QuickTodo[]
  quickNote: QuickNote
}

export const SampleDataContext = createContext<SampleData | null>(null)

/** The sample data when rendering a preview, else null (fetch from the API as usual). */
export function useSampleData(): SampleData | null {
  return useContext(SampleDataContext)
}

const DAY = 24 * 60 * 60 * 1000

function iso(date: Date): string {
  // Naive local wall-clock time, as the API sends it.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

export function buildSampleData(now: Date, accent: string): SampleData {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const at = (days: number, hour: number, minute = 0) =>
    new Date(today.getTime() + days * DAY + (hour * 60 + minute) * 60 * 1000)
  // Monday of this week, so lectures fall on the same weekdays every week.
  const monday = (today.getDay() + 6) % 7

  const MODULE_ID = 9001
  const others = [
    { id: 9002, name: 'Computer Networks', code: 'COMP2021', color: accent === '#0ea5e9' ? '#14b8a6' : '#0ea5e9' },
    { id: 9003, name: 'Databases', code: 'COMP2041', color: accent === '#f59e0b' ? '#f43f5e' : '#f59e0b' },
  ]

  const topics: Submodule[] = [
    ['Sorting', 3],
    ['Graph algorithms', 1],
    ['Dynamic programming', 0],
    ['Hashing', 6],
    ['Complexity classes', 9],
  ].map(([title, daysAgo], i) => ({
    id: 9101 + i,
    module_id: MODULE_ID,
    title: title as string,
    content_markdown: '',
    created_at: iso(at(-30, 9)),
    updated_at: iso(at(-(daysAgo as number), 16)),
    attachments: [],
  }))
  const topic = (i: number) => ({ id: topics[i].id, title: topics[i].title })

  // Lectures on Monday and Thursday, last week to the week after next.
  const lectures: Lecture[] = []
  for (let week = -1; week <= 2; week++) {
    for (const [weekday, hour, title] of [
      [0, 10, 'Lecture'],
      [3, 14, 'Tutorial'],
    ] as const) {
      const day = week * 7 + weekday - monday
      lectures.push({
        id: 9200 + lectures.length,
        module_id: MODULE_ID,
        title: `${title} ${week + 7}`,
        scheduled_at: iso(at(day, hour)),
        duration_minutes: 60,
        location: weekday === 0 ? 'Lecture Theatre 2' : 'Room 1.14',
        week_number: week + 7,
        feed_id: null,
        submodules: day < 0 ? [topic(lectures.length % topics.length)] : [],
      })
    }
  }

  const exam: Assignment = {
    id: 9303,
    module_id: MODULE_ID,
    title: 'Final exam',
    description: null,
    due_at: iso(at(18, 9, 30)),
    status: 'not_started',
    weight_percent: 50,
    grade_earned: null,
    grade_max: null,
    notes_markdown: '',
    kind: 'exam',
    duration_minutes: 120,
    location: 'Sports Hall',
    attachments: [],
    todos: [],
    covered_submodules: [topic(0), topic(1), topic(2)],
  }
  const assignments: Assignment[] = [
    {
      id: 9301,
      module_id: MODULE_ID,
      title: 'Sorting algorithms report',
      description: null,
      due_at: iso(at(-10, 12)),
      status: 'graded',
      weight_percent: 20,
      grade_earned: 68,
      grade_max: 100,
      notes_markdown: '',
      kind: 'coursework',
      duration_minutes: null,
      location: null,
      attachments: [],
      todos: [],
      covered_submodules: [],
    },
    {
      id: 9302,
      module_id: MODULE_ID,
      title: 'Graph search implementation',
      description: null,
      due_at: iso(at(6, 17)),
      status: 'in_progress',
      weight_percent: 30,
      grade_earned: null,
      grade_max: null,
      notes_markdown: '',
      kind: 'coursework',
      duration_minutes: null,
      location: null,
      attachments: [],
      todos: [
        ['Read the brief', true],
        ['Implement BFS and DFS', true],
        ['Add Dijkstra with a binary heap', false],
        ['Write up the complexity analysis', false],
      ].map(([text, done], i) => ({
        id: 9400 + i,
        assignment_id: 9302,
        text: text as string,
        done: done as boolean,
        created_at: iso(at(-7, 9)),
      })),
      covered_submodules: [],
    },
    exam,
  ]

  // Cards at every stage, a few due now.
  const cards: [string, string, number, number, number | null][] = [
    // front, back, topic, interval days, days since review (null = new)
    ['Average case of quicksort?', 'Θ(n log n)', 0, 32, 4],
    ['Which sorts are stable?', 'Merge, insertion and counting sort', 0, 14, 3],
    ['Heapsort worst case?', 'O(n log n)', 0, 6, 6],
    ['Lower bound for comparison sorts?', 'Ω(n log n)', 0, 25, 2],
    ['Dijkstra fails with…?', 'Negative edge weights', 1, 1, 1],
    ['BFS on an unweighted graph finds…?', 'Shortest paths by edge count', 1, 3, 3],
    ['Topological sort exists iff…?', 'The graph is a DAG', 1, 0, null],
    ['Prim vs Kruskal?', 'Grow one tree vs merge forests', 1, 0, null],
    ['Two conditions for DP?', 'Optimal substructure and overlapping subproblems', 2, 2, 2],
    ['0/1 knapsack runs in…?', 'O(nW): pseudo-polynomial', 2, 0, null],
    ['Load factor of a hash table?', 'Entries ÷ buckets', 3, 40, 10],
    ['Open addressing vs chaining?', 'Probe within the table vs lists per bucket', 3, 9, 5],
    ['P vs NP in one line?', 'Solvable vs checkable in polynomial time', 4, 21, 8],
    ['A problem is NP-complete when…?', 'It is in NP and NP-hard', 4, 4, 4],
  ]
  const flashcards: Flashcard[] = cards.map(([front, back, t, interval, ago], i) => ({
    id: 9500 + i,
    module_id: MODULE_ID,
    submodule_id: topics[t].id,
    front,
    back,
    source: 'manual',
    ease_factor: 2.5,
    interval_days: interval,
    repetitions: ago === null ? 0 : Math.max(1, Math.round(interval / 6)),
    due_at: iso(ago === null ? at(-1, 9) : at(interval - ago, 9)),
    last_reviewed_at: ago === null ? null : iso(at(-ago, 20)),
  }))

  const revisionSessions: RevisionSession[] = [
    [0, 10, true, [0]],
    [0, 15, false, [1]],
    [2, 11, false, [2]],
    [5, 10, false, [0, 1]],
    [9, 14, false, [2]],
  ].map(([day, hour, done, ts], i) => ({
    id: 9600 + i,
    assignment_id: exam.id,
    module_id: MODULE_ID,
    exam_title: exam.title,
    starts_at: iso(at(day as number, hour as number)),
    ends_at: iso(at(day as number, (hour as number) + 1)),
    duration_minutes: 60,
    done: done as boolean,
    guidance_markdown: null,
    submodules: (ts as number[]).map(topic),
  }))

  const summary: ModuleSummary = {
    id: MODULE_ID,
    name: 'Algorithms and Data Structures',
    code: 'COMP2011',
    color: accent,
    term: 'Autumn',
    credits: 20,
    current_grade: 68,
    next_lecture_at: lectures.find((l) => new Date(l.scheduled_at) > now)?.scheduled_at ?? null,
    assignment_progress: { graded: 1, in_progress: 1, not_started: 1, total: 3 },
    completion_progress: { completed_fraction: 0.2, achieved_fraction: 0.136 },
  }
  const module: ModuleDetail = {
    ...summary,
    lectures,
    assignments,
    submodules: topics,
    flashcards,
    related_modules: others.map(({ id, name }) => ({ id, name })),
    dashboard_layout: null,
    notes: 'Office hours moved to Thursday 3pm.\n\nAsk about the heap question from tutorial 6.',
    banner: null,
  }

  const otherSummaries: ModuleSummary[] = [
    {
      ...others[0],
      term: 'Autumn',
      credits: 20,
      current_grade: 74,
      next_lecture_at: iso(at(1, 11)),
      assignment_progress: { graded: 2, in_progress: 1, not_started: 1, total: 4 },
      completion_progress: { completed_fraction: 0.45, achieved_fraction: 0.33 },
    },
    {
      ...others[1],
      term: 'Autumn',
      credits: 20,
      current_grade: null,
      next_lecture_at: iso(at(2, 9)),
      assignment_progress: { graded: 0, in_progress: 1, not_started: 2, total: 3 },
      completion_progress: { completed_fraction: 0, achieved_fraction: 0 },
    },
  ]

  const otherAssignment = (id: number, moduleId: number, title: string, days: number, weight: number): Assignment => ({
    ...assignments[1],
    id,
    module_id: moduleId,
    title,
    due_at: iso(at(days, 17)),
    status: 'not_started',
    weight_percent: weight,
    todos: [],
  })
  const upcomingAssignments = [
    otherAssignment(9701, others[0].id, 'Lab 3: routing tables', 2, 10),
    assignments[1],
    otherAssignment(9702, others[1].id, 'Schema design coursework', 9, 25),
    exam,
  ]

  const due = (moduleId: number, count: number, from = 0): FlashcardDue[] =>
    Array.from({ length: count }, (_, i) => ({
      ...flashcards[(from + i) % flashcards.length],
      id: 9800 + moduleId * 10 + i,
      module_id: moduleId,
      next_intervals: { 1: 1, 3: 3, 4: 6, 5: 9 },
    }))
  const dueFlashcards = [...due(MODULE_ID, 5), ...due(others[0].id, 3, 5), ...due(others[1].id, 4, 9)]

  const event = (e: Partial<CalendarEvent> & Pick<CalendarEvent, 'kind' | 'id' | 'title' | 'starts_at'>): CalendarEvent => ({
    module_id: MODULE_ID,
    ends_at: null,
    location: null,
    url: null,
    done: null,
    feed_id: null,
    color: null,
    all_day: false,
    submodules: [],
    ...e,
  })
  const calendar: CalendarEvent[] = []
  for (let day = -35; day <= 42; day++) {
    const weekday = (((today.getDay() + day) % 7) + 7) % 7 // 0 = Sunday
    if (weekday === 1) calendar.push(event({ kind: 'lecture', id: 10000 + day, title: summary.name, starts_at: iso(at(day, 10)), ends_at: iso(at(day, 11)) }))
    if (weekday === 2)
      calendar.push(event({ kind: 'lecture', id: 10100 + day, module_id: others[0].id, title: others[0].name, starts_at: iso(at(day, 11)), ends_at: iso(at(day, 12)) }))
    if (weekday === 4)
      calendar.push(event({ kind: 'lecture', id: 10200 + day, module_id: others[1].id, title: others[1].name, starts_at: iso(at(day, 9)), ends_at: iso(at(day, 10)) }))
  }
  for (const a of upcomingAssignments) {
    calendar.push(
      event({
        kind: a.kind === 'exam' ? 'exam' : 'assignment_due',
        id: a.id,
        module_id: a.module_id,
        title: a.title,
        starts_at: a.due_at!,
        location: a.location,
      }),
    )
  }
  for (const s of revisionSessions) {
    calendar.push(event({ kind: 'revision', id: s.id, title: `Revision: ${s.exam_title}`, starts_at: s.starts_at, ends_at: s.ends_at, done: s.done }))
  }

  const quickTodos: QuickTodo[] = [
    ['Email tutor about the extension', null, false],
    ['Print lecture 6 slides', MODULE_ID, true],
    ['Finish Dijkstra implementation', MODULE_ID, false],
    ['Revise subnetting', others[0].id, false],
    ['Book a library study room', null, false],
  ].map(([text, moduleId, done], i) => ({
    id: 9900 + i,
    text: text as string,
    done: done as boolean,
    module_id: moduleId as number | null,
    created_at: iso(at(-2, 9)),
  }))

  return {
    module,
    modules: [summary, ...otherSummaries],
    upcomingAssignments,
    revisionSessions,
    dueFlashcards,
    calendar,
    quickTodos,
    quickNote: { content: 'Group meeting Thursday after the tutorial.\n\nExam timetable comes out next week.' },
  }
}
