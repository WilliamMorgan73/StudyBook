import { describe, expect, it } from 'vitest'

import { RATINGS, studyKeyAction } from './study'

describe('RATINGS', () => {
  it('maps Again/Hard/Good/Easy onto SM-2 quality, with only Again counting as a lapse', () => {
    expect(RATINGS.map((r) => [r.label, r.quality])).toEqual([
      ['Again', 1],
      ['Hard', 3],
      ['Good', 4],
      ['Easy', 5],
    ])
  })
})

describe('studyKeyAction', () => {
  it('reveals with Space or Enter while the front is showing', () => {
    expect(studyKeyAction(' ', false)).toEqual({ type: 'reveal' })
    expect(studyKeyAction('Enter', false)).toEqual({ type: 'reveal' })
  })

  it('ignores rating keys until the back is revealed', () => {
    expect(studyKeyAction('3', false)).toBeNull()
  })

  it('rates with 1–4 once revealed', () => {
    expect(studyKeyAction('1', true)).toEqual({ type: 'rate', quality: 1 })
    expect(studyKeyAction('4', true)).toEqual({ type: 'rate', quality: 5 })
  })

  it('ignores reveal keys and unknown keys once revealed', () => {
    expect(studyKeyAction(' ', true)).toBeNull()
    expect(studyKeyAction('x', true)).toBeNull()
  })
})
