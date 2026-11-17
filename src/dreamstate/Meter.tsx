import { useMemo } from "react"

import type { RollQuality } from "@/dreamstate/rollQuality"

/** DreamState fork: a bar filled to `fraction` (0–1) of its width; `quality` colours it like the game. */
export function Meter({
  fraction,
  thick = false,
  quality,
}: {
  fraction: number
  thick?: boolean
  quality?: RollQuality
}) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`
  const style = useMemo(() => ({ width }), [width])
  return (
    <span className={`ds-meter${thick ? " ds-thick" : ""}${quality ? ` ds-q-${quality}` : ""}`}>
      <i style={style} />
    </span>
  )
}
