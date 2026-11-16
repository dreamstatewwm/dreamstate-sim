import { codexPaths, type CodexBuild } from "@/dreamstate/deepLink"

/** The Codex's pick where a path has both builds (★ on the Codex). */
const strongerBuild: Record<string, CodexBuild> = {
  kite: "min",
  strength: "min",
  draught: "min",
  dust: "min",
  wings: "min",
  wind: "min",
  jade: "max",
  deluge: "max",
}

export type CodexPathEntry = {
  codexId: string
  pathId: (typeof codexPaths)[string]["pathId"]
  presets: (typeof codexPaths)[string]["presets"]
  stronger: CodexBuild
}

export const codexPathList: CodexPathEntry[] = Object.entries(codexPaths).map(([codexId, entry]) => ({
  codexId,
  pathId: entry.pathId,
  presets: entry.presets,
  stronger: strongerBuild[codexId] ?? "max",
}))

/** Which Codex build a build id is, if it is one of the path's presets. */
export function codexBuildOf(entry: CodexPathEntry | undefined, buildId: string | undefined): CodexBuild | undefined {
  if (!entry || !buildId) return undefined
  if (entry.presets.min === buildId) return "min"
  if (entry.presets.max === buildId) return "max"
  return undefined
}
