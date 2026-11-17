import { useMemo } from "react"

/** DreamState fork: a bar filled to `fraction` (0–1) of its width; `low` turns it amber. */
export function Meter({ fraction, thick = false, low = false }: { fraction: number; thick?: boolean; low?: boolean }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`
  const style = useMemo(() => ({ width }), [width])
  return (
    <span className={`ds-meter${thick ? " ds-thick" : ""}${low ? " ds-low" : ""}`}>
      <i style={style} />
    </span>
  )
}
