import { useState } from "react"

import type { PathId } from "@/application/contracts"
import type { CodexPathEntry } from "@/dreamstate/codexBuilds"
import type { CodexBuild } from "@/dreamstate/deepLink"
import { useGearStore } from "@/stores/gearStore"

const advancedKey = "ds-advanced"

function loadAdvanced() {
  try {
    return localStorage.getItem(advancedKey) === "1"
  } catch {
    return false
  }
}

/**
 * DreamState fork: simple/full mode for the page, plus path and preset picks from the Codex view.
 * Paths go through the application's own `selectPath`; presets through the gear store's action.
 */
export function useDreamStateMode(input: {
  pathId: PathId
  activeBuildIdsByPath: Partial<Record<PathId, string>>
  selectPath: (pathId: PathId) => void
}) {
  const [advanced, setAdvancedState] = useState(loadAdvanced)
  const setAdvanced = (next: boolean) => {
    setAdvancedState(next)
    try {
      localStorage.setItem(advancedKey, next ? "1" : "0")
    } catch {
      // Private browsing: the choice lasts for this visit only.
    }
  }
  const selectCodexBuild = (entry: CodexPathEntry, build: CodexBuild) => {
    const presetId = entry.presets[build]
    if (presetId) useGearStore.getState().selectBuildForPath(presetId, entry.pathId)
  }
  const selectCodexPath = (entry: CodexPathEntry) => {
    if (entry.pathId === input.pathId) return
    input.selectPath(entry.pathId)
    // A first visit to a path opens on the Codex's stronger preset; a saved choice is kept.
    const saved = input.activeBuildIdsByPath[entry.pathId]
    if (!saved) selectCodexBuild(entry, entry.presets[entry.stronger] ? entry.stronger : "max")
  }
  return { advanced, setAdvanced, selectCodexPath, selectCodexBuild }
}
