import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  Code,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Library,
  Link as LinkIcon,
  Mail,
  Plus,
  Settings,
  Video,
  X,
} from 'lucide-react'

import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { EventMarker } from '@/components/EventMarker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getModule, listAssignments, listSubmodulesIndex } from '@/lib/api'
import {
  addTile,
  isMissing,
  MAX_TILES,
  MAX_TITLE,
  moveTile,
  normalizeUrl,
  PIN_ICONS,
  PINNED_CONFIG,
  removeTile,
  TILE_GAP,
  TILE_MIN_H,
  tileGrid,
  tileHref,
  type Existing,
  type PinIcon,
  type PinnedTile,
} from '@/lib/pinned'
import { useSampleData } from '@/lib/sampleData'
import { useAsync } from '@/lib/useAsync'
import { useElementSize } from '@/lib/useElementSize'

const ICONS: Record<PinIcon, ComponentType<{ className?: string }>> = {
  link: LinkIcon,
  globe: Globe,
  book: BookOpen,
  library: Library,
  calendar: Calendar,
  graduation: GraduationCap,
  mail: Mail,
  video: Video,
  file: FileText,
  code: Code,
}

const KIND_LABEL: Record<PinnedTile['kind'], string> = { module: 'Module', topic: 'Topic', assignment: 'Assignment', link: 'Link' }

/** Which pinned app items still exist. Only fetches the lists the tiles need. */
function useExisting(tiles: readonly PinnedTile[]): Existing {
  const { modules } = useOverview()
  const sample = useSampleData()
  const needTopics = !sample && tiles.some((t) => t.kind === 'topic')
  const needAssignments = !sample && tiles.some((t) => t.kind === 'assignment')
  const topics = useAsync(() => (needTopics ? listSubmodulesIndex() : Promise.resolve(null)), [needTopics])
  const assignments = useAsync(() => (needAssignments ? listAssignments() : Promise.resolve(null)), [needAssignments])
  return useMemo(
    () =>
      sample
        ? {}
        : {
            modules: modules.data ? new Set(modules.data.map((m) => m.id)) : undefined,
            topics: topics.data ? new Set(topics.data.map((t) => t.id)) : undefined,
            assignments: assignments.data ? new Set(assignments.data.map((a) => a.id)) : undefined,
          },
    [sample, modules.data, topics.data, assignments.data],
  )
}

function TileIcon({ tile, color, large }: { tile: PinnedTile; color: string; large: boolean }) {
  if (tile.kind === 'link') {
    const Icon = ICONS[tile.icon]
    return <Icon className={`${large ? 'size-5' : 'size-4'} shrink-0 text-muted-foreground`} />
  }
  if (tile.kind === 'assignment') return <EventMarker kind="assignment_due" color={color} className={`shrink-0 ${large ? 'scale-150' : ''}`} />
  return (
    <span
      className={`${large ? 'size-3.5' : 'size-2.5'} shrink-0 ${tile.kind === 'topic' ? 'rounded-sm' : 'rounded-full'}`}
      style={{ backgroundColor: color }}
    />
  )
}

/**
 * Quick-launch tiles that share the whole widget (`tileGrid`): one tile fills it, more split it,
 * and only when they no longer fit do they drop to their minimum size and scroll.
 */
export function PinnedWidget() {
  const [cfg] = useWidgetConfig(PINNED_CONFIG)
  const { moduleColor, moduleName } = useOverview()
  const existing = useExisting(cfg.tiles)
  const [sizeRef, size] = useElementSize<HTMLDivElement>()

  if (cfg.tiles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing pinned yet. Edit the layout and use <Settings className="inline size-3.5 align-[-2px]" aria-label="settings" /> to pin
        modules, topics, assignments or links.
      </p>
    )
  }

  const grid = tileGrid(cfg.tiles.length, size.width, size.height)
  const tileW = (size.width - (grid.cols - 1) * TILE_GAP) / grid.cols
  const tileH = grid.fill ? (size.height - (grid.rows - 1) * TILE_GAP) / grid.rows : TILE_MIN_H
  // Roomy tiles get a bigger icon and title, centred.
  const large = tileW >= 200 && tileH >= 96

  return (
    <div ref={sizeRef} className="flex min-h-0 flex-1 flex-col">
      {size.width > 0 && (
        <ul
          className="grid min-h-0 flex-1 overflow-y-auto"
          style={{
            gap: TILE_GAP,
            gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
            gridTemplateRows: grid.fill ? `repeat(${grid.rows}, minmax(0, 1fr))` : undefined,
            gridAutoRows: grid.fill ? undefined : TILE_MIN_H,
          }}
        >
          {cfg.tiles.map((tile, index) => {
            const missing = isMissing(tile, existing)
            const color = tile.kind === 'link' ? '' : moduleColor(tile.moduleId)
            const subtitle = missing
              ? 'Missing'
              : tile.kind === 'link'
                ? new URL(tile.url).hostname
                : tile.kind === 'module'
                  ? KIND_LABEL.module
                  : `${KIND_LABEL[tile.kind]} · ${moduleName(tile.moduleId)}`
            const body = (
              <>
                <span className={`flex max-w-full min-w-0 items-center ${large ? 'gap-2.5' : 'gap-2'}`}>
                  <TileIcon tile={tile} color={color} large={large} />
                  <span className={`truncate font-medium ${large ? 'text-lg' : ''}`}>{tile.title}</span>
                  {tile.kind === 'link' && <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                </span>
                <span className={`max-w-full truncate ${large ? 'text-sm' : 'text-xs'} ${missing ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {subtitle}
                </span>
              </>
            )
            const className = `flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-lg border px-2.5 py-2 text-sm transition-colors ${large ? 'items-center text-center' : ''}`
            return (
              <li key={`${index}-${tileHref(tile)}`} className="min-h-0">
                {missing ? (
                  <div className={`${className} opacity-60`} title="This item has been deleted. Remove it in the widget's settings.">
                    {body}
                  </div>
                ) : tile.kind === 'link' ? (
                  <a href={tile.url} target="_blank" rel="noreferrer" className={`${className} hover:bg-muted`}>
                    {body}
                  </a>
                ) : (
                  <Link to={tileHref(tile)} className={`${className} hover:bg-muted`}>
                    {body}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Pick a module, then the module page itself or one of its topics or assignments. */
function AddAppItem({ onAdd }: { onAdd: (tile: PinnedTile) => void }) {
  const { modules } = useOverview()
  const [moduleId, setModuleId] = useState<string>('')
  const [item, setItem] = useState<string>('module')
  const detail = useAsync(() => (moduleId ? getModule(Number(moduleId)) : Promise.resolve(null)), [moduleId])
  const mod = modules.data?.find((m) => String(m.id) === moduleId)

  function add() {
    if (!mod) return
    const [kind, id] = item.split(':')
    if (kind === 'topic') {
      const s = detail.data?.submodules.find((x) => String(x.id) === id)
      if (s) onAdd({ kind: 'topic', moduleId: mod.id, submoduleId: s.id, title: s.title })
    } else if (kind === 'assignment') {
      const a = detail.data?.assignments.find((x) => String(x.id) === id)
      if (a) onAdd({ kind: 'assignment', moduleId: mod.id, assignmentId: a.id, title: a.title })
    } else {
      onAdd({ kind: 'module', moduleId: mod.id, title: mod.name })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={moduleId}
        onValueChange={(v) => {
          setModuleId(v)
          setItem('module')
        }}
      >
        <SelectTrigger className="w-full" aria-label="Module">
          <SelectValue placeholder="Choose a module" />
        </SelectTrigger>
        <SelectContent>
          {(modules.data ?? []).map((m) => (
            <SelectItem key={m.id} value={String(m.id)}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mod && (
        <Select value={item} onValueChange={setItem}>
          <SelectTrigger className="w-full" aria-label="What to pin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="module">The module page</SelectItem>
            {(detail.data?.submodules.length ?? 0) > 0 && (
              <SelectGroup>
                <SelectLabel>Topics</SelectLabel>
                {detail.data!.submodules.map((s) => (
                  <SelectItem key={s.id} value={`topic:${s.id}`}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {(detail.data?.assignments.length ?? 0) > 0 && (
              <SelectGroup>
                <SelectLabel>Assignments</SelectLabel>
                {detail.data!.assignments.map((a) => (
                  <SelectItem key={a.id} value={`assignment:${a.id}`}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      )}
      <Button size="sm" variant="secondary" disabled={!mod} onClick={add}>
        <Plus /> Pin
      </Button>
    </div>
  )
}

function AddLink({ onAdd }: { onAdd: (tile: PinnedTile) => void }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState<PinIcon>('link')
  const valid = normalizeUrl(url)

  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Link address" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Input aria-label="Link title" placeholder="Title (e.g. Timetable)" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
        {PIN_ICONS.map((id) => {
          const Icon = ICONS[id]
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={icon === id}
              aria-label={id}
              onClick={() => setIcon(id)}
              className={`rounded-md p-1.5 transition-colors hover:bg-muted ${icon === id ? 'bg-muted ring-1 ring-ring' : ''}`}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={!valid}
        onClick={() => {
          if (!valid) return
          onAdd({ kind: 'link', url: valid, title: title.trim() || new URL(valid).hostname, icon })
          setTitle('')
          setUrl('')
        }}
      >
        <Plus /> Pin link
      </Button>
    </div>
  )
}

/** The ⚙ form: the pinned tiles in order (move up/down, remove), then a form to pin more. */
export function PinnedSettings() {
  const [cfg, setCfg] = useWidgetConfig(PINNED_CONFIG)
  const [adding, setAdding] = useState<'app' | 'link'>('app')
  const setTiles = (tiles: PinnedTile[]) => setCfg({ tiles })
  const full = cfg.tiles.length >= MAX_TILES

  return (
    <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3 overflow-y-auto pr-1">
      {cfg.tiles.length > 0 && (
        <ul className="flex flex-col gap-1">
          {cfg.tiles.map((tile, index) => (
            <li key={`${index}-${tileHref(tile)}`} className="flex items-center gap-1 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {tile.title} <span className="text-xs text-muted-foreground">{KIND_LABEL[tile.kind]}</span>
              </span>
              <Button size="icon-sm" variant="ghost" aria-label={`Move ${tile.title} up`} disabled={index === 0} onClick={() => setTiles(moveTile(cfg.tiles, index, -1))}>
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${tile.title} down`}
                disabled={index === cfg.tiles.length - 1}
                onClick={() => setTiles(moveTile(cfg.tiles, index, 1))}
              >
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Unpin ${tile.title}`} onClick={() => setTiles(removeTile(cfg.tiles, index))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-xs text-muted-foreground">That’s the most this widget holds ({MAX_TILES}).</p>
      ) : (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Label>Pin</Label>
          <Tabs value={adding} onValueChange={(v) => setAdding(v as 'app' | 'link')}>
            <TabsList className="w-full">
              <TabsTrigger value="app">From StudyBook</TabsTrigger>
              <TabsTrigger value="link">A link</TabsTrigger>
            </TabsList>
          </Tabs>
          {adding === 'app' ? (
            <AddAppItem onAdd={(tile) => setTiles(addTile(cfg.tiles, tile))} />
          ) : (
            <AddLink onAdd={(tile) => setTiles(addTile(cfg.tiles, tile))} />
          )}
        </div>
      )}
    </div>
  )
}
