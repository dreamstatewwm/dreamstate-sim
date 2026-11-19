import type { PathId } from "@/application/contracts"
import { formatNumber, formatThroughput } from "@/application/formatting"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { CalculationStatus } from "@/application/results/CalculationStatus"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationMetrics } from "@/calculations/rotationMetrics"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { codexBuildOf, codexPathList, type CodexPathEntry } from "@/dreamstate/codexBuilds"
import type { CodexBuild } from "@/dreamstate/deepLink"
import { GearPanel, RetunePlan } from "@/dreamstate/GearPanel"
import { Meter } from "@/dreamstate/Meter"
import type { BuildEntry, GearItem, GearLevel } from "@/gear"
import { gameText } from "@/i18n"
import { statPriorityDisplayRows } from "@/statPriorityDisplay"
import type { WeaponId } from "@/types"

import "./view.css"

/**
 * DreamState fork: the simple Codex-style page on top of the engine. It only reads the
 * application's own results (rotation metrics, graduation DPS, derived stats) and selects paths
 * and presets through the same actions the full simulator uses, so no numbers are computed here.
 * The Codex is English-only, so its copy lives in this object rather than the translation table.
 */
const copy = {
  title: "PvE Simulator · Test your build",
  lead: "Pick a path and build to see its damage against a boss, how close the gear is to the best rolls, and which stats are worth the most. PvE only: PvP damage against players isn't simulated.",
  step1: "Path and build",
  pathGroup: "Path",
  build: "Build",
  maxAtk: "Max Atk",
  minAtk: "Min Atk",
  onlyBuild: "only build",
  custom: "Your own build",
  preset: "Preset",
  rotation: "Rotation",
  dps: "Solo DPS",
  vsBest: "vs best rolls",
  graduation: "Gear graduation",
  graduationNote: "How close this gear is to the best gear for the build.",
  hitRates: "Hit rates",
  precision: "Precision",
  crit: "Crit",
  affinity: "Affinity",
  capsNote: "Crit counts up to 80% and Affinity up to 40%; anything above is wasted.",
  priority: "Best stats to add",
  priorityNote: "DPS gained from one best roll of each line.",
  advancedOn: "Hide full simulator",
  advancedOff: "Full simulator",
  advancedHint: "Edit gear, rotations and every setting",
  credit: "Calculations by",
  creditName: "Where Builds Meet",
  creditTail: "by Greydust (GPL-3), kept in sync daily.",
}

/** The engine's own caps (effectiveStats.ts clamps Crit at 80% and Affinity at 40%); display only. */
const rateCaps = { precision: 1, crit: 0.8, affinity: 0.4 }

type Props = {
  pathId: PathId
  activeBuildId: string | undefined
  buildName: string
  rotationName: string
  metrics: RotationMetrics | undefined
  graduationDps: number | undefined
  precision: number
  crit: number
  affinity: number
  advanced: boolean
  onAdvancedChange: (advanced: boolean) => void
  onSelectPath: (entry: CodexPathEntry) => void
  onSelectBuild: (entry: CodexPathEntry, build: CodexBuild) => void
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
  weapons: [WeaponId, WeaponId]
  gearTier: GearLevel
  ownBuilds: { id: string; name: string }[]
  onSelectOwnBuild: (id: string) => void
}

export function DreamStateView(props: Props) {
  const { pathId, activeBuildId, metrics, graduationDps } = props
  const current = codexPathList.find(entry => entry.pathId === pathId)
  const currentBuild = codexBuildOf(current, activeBuildId)
  const graduation = metrics && graduationDps && graduationDps > 0 ? (metrics.dps / graduationDps) * 100 : undefined
  const priority = statPriorityDisplayRows(metrics?.statPriority ?? [], "max")
    .filter(row => row.increase > 0)
    .slice(0, 5)
  const topIncrease = priority[0]?.increase ?? 0
  const usePreset = () => {
    if (current) props.onSelectBuild(current, current.presets[current.stronger] ? current.stronger : "max")
  }
  const buildButton = (entry: CodexPathEntry, build: CodexBuild) => {
    const label = build === "max" ? copy.maxAtk : copy.minAtk
    const only = !entry.presets.min
    return (
      <button
        type="button"
        className={`ds-pill ${currentBuild === build ? "on" : ""}`}
        aria-pressed={currentBuild === build}
        onClick={() => props.onSelectBuild(entry, build)}
      >
        {label}
        {only ? ` (${copy.onlyBuild})` : entry.stronger === build ? " ★" : ""}
      </button>
    )
  }
  const rateRow = (name: string, value: number, cap: number) => (
    <div className="ds-rate" key={name}>
      <span>{name}</span>
      <Meter fraction={value / cap} />
      <span className="ds-num">
        {formatNumber(Math.round(value * 1000) / 10)}%{cap < 1 ? ` / ${formatNumber(cap * 100)}%` : ""}
      </span>
    </div>
  )
  return (
    <section className="ds-view">
      <div className="ds-head">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
        <button
          type="button"
          className={`ds-advanced ${props.advanced ? "on" : ""}`}
          aria-pressed={props.advanced}
          title={copy.advancedHint}
          onClick={() => props.onAdvancedChange(!props.advanced)}
        >
          {props.advanced ? copy.advancedOn : copy.advancedOff}
        </button>
      </div>

      <section className="ds-panel ds-pick">
        <h2>
          <span className="ds-step">{"1"}</span>
          {copy.step1}
        </h2>
        <fieldset className="ds-paths">
          <legend className="visually-hidden">{copy.pathGroup}</legend>
          {codexPathList.map(entry => (
            <button
              type="button"
              key={entry.codexId}
              className={`ds-chip ${entry.pathId === pathId ? "on" : ""}`}
              aria-pressed={entry.pathId === pathId}
              onClick={() => props.onSelectPath(entry)}
            >
              {gameText(typedPathDefinitions[entry.pathId].name)}
            </button>
          ))}
        </fieldset>
        {current ? (
          <div className="ds-buildrow">
            <span className="ds-label">{copy.build}</span>
            <div className="ds-pills">
              {buildButton(current, "max")}
              {current.presets.min ? buildButton(current, "min") : null}
              {props.ownBuilds.map(own => (
                <button
                  type="button"
                  key={own.id}
                  className={`ds-pill ${own.id === activeBuildId ? "on" : ""}`}
                  aria-pressed={own.id === activeBuildId}
                  onClick={() => props.onSelectOwnBuild(own.id)}
                >
                  {own.name}
                </button>
              ))}
            </div>
            <span className="ds-muted">
              {currentBuild ? copy.preset : copy.custom}: <b>{props.buildName}</b> · {copy.rotation}:{" "}
              <b>{props.rotationName}</b>
            </span>
          </div>
        ) : null}
      </section>

      <div className="ds-main">
        <GearPanel
          pathId={pathId}
          build={props.build}
          gearItems={props.gearItems}
          context={props.context}
          rotation={props.rotation}
          weapons={props.weapons}
          gearTier={props.gearTier}
          onUsePreset={usePreset}
        />
        <aside className="ds-results">
          <section className="ds-panel ds-dps">
            <span className="ds-label">{copy.dps}</span>
            <div className="ds-dpsrow">
              <b>{metrics ? formatThroughput(metrics.dps, 0) : "—"}</b>
              {graduation !== undefined && graduation < 99.95 ? (
                <span className="ds-warn">
                  {formatNumber(Math.round((graduation - 100) * 10) / 10)}% {copy.vsBest}
                </span>
              ) : null}
            </div>
            <CalculationStatus category="baseline" className="ds-status" />
          </section>

          <section className="ds-panel">
            <div className="ds-split">
              <span className="ds-label">{copy.graduation}</span>
              <b className="ds-big">{graduation === undefined ? "—" : `${formatNumber(Math.round(graduation))}%`}</b>
            </div>
            <Meter fraction={(graduation ?? 0) / 100} thick />
            <span className="ds-muted">{copy.graduationNote}</span>
          </section>

          <section className="ds-panel">
            <span className="ds-label">{copy.hitRates}</span>
            {rateRow(copy.precision, props.precision, rateCaps.precision)}
            {rateRow(copy.crit, props.crit, rateCaps.crit)}
            {rateRow(copy.affinity, props.affinity, rateCaps.affinity)}
            <span className="ds-muted">{copy.capsNote}</span>
          </section>

          <section className="ds-panel">
            <div className="ds-split">
              <span className="ds-label">{copy.priority}</span>
              <CalculationStatus category="statPriority" className="ds-status" />
            </div>
            <ol className="ds-prio">
              {priority.map((row, index) => (
                <li key={row.label}>
                  <span className="ds-n">{index + 1}</span>
                  <span className="ds-prio-name">
                    {gameText(row.label)}
                    <Meter fraction={topIncrease > 0 ? row.increase / topIncrease : 0} />
                  </span>
                  <span className="ds-gain">+{formatNumber(Math.round(row.increase * 100) / 100)}%</span>
                </li>
              ))}
            </ol>
            <span className="ds-muted">{copy.priorityNote}</span>
          </section>
          <RetunePlan
            pathId={pathId}
            build={props.build}
            gearItems={props.gearItems}
            context={props.context}
            rotation={props.rotation}
            weapons={props.weapons}
            gearTier={props.gearTier}
            onUsePreset={usePreset}
          />
        </aside>
      </div>

      <p className="ds-credit">
        {copy.credit}{" "}
        <a href="https://greydust.github.io/where-builds-meet/" target="_blank" rel="noreferrer">
          {copy.creditName}
        </a>{" "}
        {copy.creditTail}
      </p>
    </section>
  )
}
