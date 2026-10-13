import { createContext, useContext } from 'react'

import type { Direction } from '@/lib/dashboardLayout'

/** A widget the "Swap with…" menu offers, and whether swapping with it fits the board. */
export interface SwapOption {
  id: string
  title: string
  fits: boolean
}

/**
 * What a widget on an editable board can do to itself without a pointer: the keyboard on its grip
 * and its "Swap with…" menu. `DashboardGrid` provides one per widget; null anywhere else (stacked
 * on narrow screens, or not editing).
 */
export interface TileControls {
  /** An arrow key: swap with the neighbour that way, or move one column into free space. */
  move: (dir: Direction) => void
  /** Shift + an arrow key: move the right edge (left/right) or bottom edge (up/down) one cell. */
  resize: (dir: Direction) => void
  swapOptions: () => SwapOption[]
  swapWith: (id: string) => void
}

export const TileControlsContext = createContext<TileControls | null>(null)

export function useTileControls(): TileControls | null {
  return useContext(TileControlsContext)
}
