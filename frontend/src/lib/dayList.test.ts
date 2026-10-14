import { describe, expect, it } from 'vitest'

import { DAY_LIST_CONFIG, DAY_LIST_DEFAULT } from '@/lib/dayList'

describe('DAY_LIST_CONFIG.normalize', () => {
  it('gives layouts saved before the setting the old look: shown, medium', () => {
    for (const raw of [undefined, null, 'x', {}]) expect(DAY_LIST_CONFIG.normalize(raw)).toEqual(DAY_LIST_DEFAULT)
  })

  it('keeps valid settings and replaces invalid ones', () => {
    expect(DAY_LIST_CONFIG.normalize({ dayList: false, dayListSize: 'lg' })).toEqual({ dayList: false, dayListSize: 'lg' })
    expect(DAY_LIST_CONFIG.normalize({ dayList: 'no', dayListSize: 'xl' })).toEqual(DAY_LIST_DEFAULT)
  })
})
