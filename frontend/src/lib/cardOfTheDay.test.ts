import { describe, expect, it } from 'vitest'

import { CARD_OF_THE_DAY_CONFIG } from '@/lib/cardOfTheDay'

describe('CARD_OF_THE_DAY_CONFIG.normalize', () => {
  it('defaults to every module and keeps a module id', () => {
    expect(CARD_OF_THE_DAY_CONFIG.normalize(undefined)).toEqual({ moduleId: null })
    expect(CARD_OF_THE_DAY_CONFIG.normalize({ moduleId: 4 })).toEqual({ moduleId: 4 })
    expect(CARD_OF_THE_DAY_CONFIG.normalize({ moduleId: '4' })).toEqual({ moduleId: null })
    expect(CARD_OF_THE_DAY_CONFIG.normalize({ moduleId: -1 })).toEqual({ moduleId: null })
  })
})
