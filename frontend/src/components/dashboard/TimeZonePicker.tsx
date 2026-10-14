import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { filterTimeZones, systemTimeZone, timeZoneCity, timeZoneOptions } from '@/lib/clock'

/** Null stands for the system's zone, listed first. */
type Choice = string | null

/**
 * A searchable list of every IANA zone, with "System" first: ~400 zones is too many to scroll a
 * plain Select through. Type to filter ("new york", "tokyo"), ↑/↓ to move, Enter to pick.
 */
export function TimeZonePicker({ id, value, onChange }: { id?: string; value: string | null; onChange: (zone: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const system = systemTimeZone()
  const zones = useMemo(() => timeZoneOptions(), [])

  const choices: Choice[] = useMemo(() => {
    const matches = filterTimeZones(zones, query)
    const systemMatches = query.trim() === '' || filterTimeZones([`System ${system}`], query).length > 0
    return systemMatches ? [null, ...matches] : matches
  }, [zones, query, system])

  function pick(choice: Choice) {
    onChange(choice)
    setOpen(false)
  }

  function moveTo(index: number) {
    const next = Math.max(0, Math.min(choices.length - 1, index))
    setActive(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') moveTo(active + 1)
    else if (e.key === 'ArrowUp') moveTo(active - 1)
    else if (e.key === 'Enter' && choices[active] !== undefined) pick(choices[active])
    else return
    e.preventDefault()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuery('')
          setActive(0)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{value === null ? `System (${timeZoneCity(system)})` : value.replaceAll('_', ' ')}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-1.5">
        <Input
          autoFocus
          placeholder="Search cities or regions"
          aria-label="Search time zones"
          aria-controls="time-zone-list"
          aria-activedescendant={choices.length > 0 ? `time-zone-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            listRef.current?.scrollTo({ top: 0 })
          }}
          onKeyDown={onKeyDown}
        />
        <div ref={listRef} id="time-zone-list" role="listbox" aria-label="Time zones" className="max-h-60 overflow-y-auto">
          {choices.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matching time zone</p>}
          {choices.map((choice, index) => {
            const selected = choice === value
            return (
              <div
                key={choice ?? 'system'}
                id={`time-zone-${index}`}
                data-index={index}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(choice)}
                className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${index === active ? 'bg-accent text-accent-foreground' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {choice === null ? (
                    <>
                      System <span className="text-muted-foreground">({system.replaceAll('_', ' ')})</span>
                    </>
                  ) : (
                    choice.replaceAll('_', ' ')
                  )}
                </span>
                {selected && <Check className="size-4 shrink-0" aria-hidden />}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
