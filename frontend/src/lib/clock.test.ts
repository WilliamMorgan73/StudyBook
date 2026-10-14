import { describe, expect, it } from 'vitest'

import { CLOCK_CONFIG, CLOCK_LABEL_MAX, clockParts, filterTimeZones, handAngles, nextTickDelay, timeZoneCity, timeZoneOptions } from '@/lib/clock'

// 2026-10-13 20:05:30 UTC: 21:05 in London (BST), 01:35 the next day in Kolkata (+5:30).
const NOW = new Date(Date.UTC(2026, 9, 13, 20, 5, 30))

describe('CLOCK_CONFIG.normalize', () => {
  it('gives the defaults for anything unusable', () => {
    for (const raw of [undefined, null, 'clock', 3, []]) {
      const cfg = CLOCK_CONFIG.normalize(raw)
      expect(cfg).toMatchObject({ style: 'digital', timeZone: null, label: '', showDate: true, showSeconds: false })
      expect(typeof cfg.hour12).toBe('boolean')
    }
  })

  it('keeps valid settings and drops invalid ones', () => {
    expect(
      CLOCK_CONFIG.normalize({ style: 'analog', timeZone: 'Asia/Tokyo', label: 'Home', showDate: false, showSeconds: true, hour12: false }),
    ).toEqual({ style: 'analog', timeZone: 'Asia/Tokyo', label: 'Home', showDate: false, showSeconds: true, hour12: false })
    const cfg = CLOCK_CONFIG.normalize({ style: 'sundial', timeZone: 'Mars/Olympus_Mons', label: 7, showDate: 'yes' })
    expect(cfg).toMatchObject({ style: 'digital', timeZone: null, label: '', showDate: true })
  })

  it('caps the label', () => {
    expect(CLOCK_CONFIG.normalize({ label: 'x'.repeat(100) }).label).toHaveLength(CLOCK_LABEL_MAX)
  })

  it('is stable: normalizing twice changes nothing', () => {
    const once = CLOCK_CONFIG.normalize({ timeZone: 'Europe/London', hour12: true })
    expect(CLOCK_CONFIG.normalize(once)).toEqual(once)
  })
})

describe('clockParts', () => {
  it('shows the time in the chosen zone, 24-hour', () => {
    const london = clockParts(NOW, { timeZone: 'Europe/London', showSeconds: false, hour12: false }, 'en-GB')
    expect(london).toMatchObject({ time: '21:05', period: '', hours: 21, minutes: 5, seconds: 30 })
    const kolkata = clockParts(NOW, { timeZone: 'Asia/Kolkata', showSeconds: true, hour12: false }, 'en-GB')
    expect(kolkata).toMatchObject({ time: '01:35:30', hours: 1, minutes: 35 })
    expect(kolkata.date).toBe('Wed 14 Oct')
  })

  it('splits off AM/PM in 12-hour mode', () => {
    const parts = clockParts(NOW, { timeZone: 'America/New_York', showSeconds: false, hour12: true }, 'en-US')
    expect(parts.time).toBe('4:05')
    expect(parts.period).toBe('PM')
    expect(parts.hours).toBe(16)
  })
})

describe('nextTickDelay', () => {
  it('waits for the next whole second or minute', () => {
    const t = new Date(Date.UTC(2026, 9, 13, 20, 5, 30, 250))
    expect(nextTickDelay(t, true)).toBe(750)
    expect(nextTickDelay(t, false)).toBe(29_750)
  })
})

describe('handAngles', () => {
  it('moves the hour hand between the hours', () => {
    expect(handAngles({ hours: 15, minutes: 30, seconds: 0 })).toEqual({ hour: 105, minute: 180, second: 0 })
  })
})

describe('time zone search', () => {
  it('lists zones including UTC', () => {
    const zones = timeZoneOptions()
    expect(zones).toContain('UTC')
    expect(zones).toContain('Asia/Tokyo')
  })

  it('matches words in any order, reading _ and / as spaces', () => {
    const zones = ['America/New_York', 'Asia/Tokyo', 'Europe/London']
    expect(filterTimeZones(zones, 'new york')).toEqual(['America/New_York'])
    expect(filterTimeZones(zones, 'TOKYO asia')).toEqual(['Asia/Tokyo'])
    expect(filterTimeZones(zones, '  ')).toEqual(zones)
  })

  it('names a zone by its city', () => {
    expect(timeZoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
  })
})
