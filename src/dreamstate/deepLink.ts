import type { PathId } from "@/application/contracts"
import { useGearStore } from "@/stores/gearStore"
import { useLoadoutStore } from "@/stores/loadoutStore"

/**
 * DreamState fork: opens a path and preset build from a Codex link such as
 * `/sim/#path=kite&preset=min`. `preset` (not `build`) keeps clear of the `#build=` share links.
 * Runs before the app mounts and goes through the stores' own actions, so the choice is saved
 * like a manual pick and the user's other saved selections stay as they were.
 */
type CodexBuild = "min" | "max"

const codexPaths: Record<string, { pathId: PathId; presets: Partial<Record<CodexBuild, string>> }> = {
  kite: { pathId: "bamboocutKite", presets: { min: "kite-fully-relayed-min-bp", max: "kite-fully-relayed-max-bp" } },
  strength: {
    pathId: "stonesplitStrength",
    presets: { min: "mixed-fully-relayed-min", max: "mixed-fully-relayed-max" },
  },
  draught: {
    pathId: "bamboocutDraught",
    presets: { min: "draught-fully-relayed-min", max: "draught-fully-relayed-max" },
  },
  dust: { pathId: "bamboocutDust", presets: { min: "dust-fully-relayed-min", max: "dust-fully-relayed-max" } },
  wings: { pathId: "silkbindWings", presets: { min: "wings-fully-relayed-min", max: "wings-max" } },
  wind: { pathId: "bamboocutWind", presets: { min: "wind-fully-relayed-min", max: "wind-fully-relayed-max" } },
  jade: { pathId: "silkbindJade", presets: { min: "jade-fully-relayed-min", max: "jade-fully-relayed-max" } },
  deluge: {
    pathId: "silkbindDeluge",
    presets: { min: "deluge-fully-relayed-min-ib", max: "deluge-fully-relayed-max-ib" },
  },
  splendor: { pathId: "bellstrikeSplendor", presets: { max: "splendor-fully-relayed" } },
  umbra: { pathId: "bellstrikeUmbra", presets: { max: "umbra-fully-relayed" } },
  might: { pathId: "stonesplitMight", presets: { max: "might-fully-relayed-max" } },
}

export function applyCodexDeepLink() {
  const params = new URLSearchParams(location.hash.slice(1))
  const entry = codexPaths[params.get("path") ?? ""]
  if (!entry) return
  const requested = params.get("preset")
  const presetId = requested === "min" || requested === "max" ? entry.presets[requested] : undefined
  useLoadoutStore.getState().setPath(entry.pathId)
  if (presetId) {
    useGearStore.getState().initialise(entry.pathId)
    useGearStore.getState().selectBuildForPath(presetId, entry.pathId)
  }
  history.replaceState(null, "", location.pathname + location.search)
}
