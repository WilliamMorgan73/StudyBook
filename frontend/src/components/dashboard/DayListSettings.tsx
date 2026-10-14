import { useModuleData } from '@/components/dashboard/moduleContext'
import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DAY_LIST_CONFIG, DAY_LIST_SIZES, type DayListSize } from '@/lib/dayList'

/**
 * The ⚙ form for the selected day's list under the Calendar or beside the Schedule. It only
 * applies while the Day agenda widget isn't placed, and says so when it is.
 */
function DayListSettings({ agendaPlaced, where }: { agendaPlaced: boolean; where: 'under' | 'beside' }) {
  const [cfg, setCfg] = useWidgetConfig(DAY_LIST_CONFIG)
  return (
    <div className="flex flex-col gap-3">
      {agendaPlaced && (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          The Day agenda widget is on this board, so the selected day shows there instead and these settings have no effect.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Checkbox id="day-list-show" checked={cfg.dayList} onCheckedChange={(v) => setCfg({ ...cfg, dayList: v === true })} />
        <Label htmlFor="day-list-show" className="font-normal">
          Show the selected day {where} the {where === 'under' ? 'month' : 'fortnight'}
        </Label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className={cfg.dayList ? '' : 'opacity-50'}>Day list size</Label>
        <Tabs value={cfg.dayListSize} onValueChange={(v) => setCfg({ ...cfg, dayListSize: v as DayListSize })}>
          <TabsList className="w-full">
            {DAY_LIST_SIZES.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} disabled={!cfg.dayList}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}

export function CalendarSettings() {
  const { agendaPlaced } = useOverview()
  return <DayListSettings agendaPlaced={agendaPlaced} where="under" />
}

export function ScheduleSettings() {
  const { dayAgendaPlaced } = useModuleData()
  return <DayListSettings agendaPlaced={dayAgendaPlaced} where="beside" />
}
