import { useMemo, useState } from "react"

import type { PathId } from "@/application/contracts"
import { formatNumber } from "@/application/formatting"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { Meter } from "@/dreamstate/Meter"
import { gearSuggestionTargets, rankRetuneSuggestions } from "@/features/build/gearSuggestionItems"
import { useBuildThroughputs, type ThroughputTarget } from "@/features/build/useBuildThroughputs"
import {
  attunementData,
  gearData,
  gearSlots,
  maxGearRoll,
  resolveBuildInventory,
  type BuildEntry,
  type GearItem,
  type GearLevel,
  type GearSlot,
} from "@/gear"
import { retuneCandidates } from "@/gearRetuning"
import { dataText, gameText } from "@/i18n"
import type { WeaponId } from "@/types"

/**
 * DreamState fork: the equipped gear as cards (each line against its best roll) and a retune plan.
 * The plan uses the full simulator's own retune suggestion pieces — the same candidates, the same
 * measured rotations and the same ranking the gear editor shows for one item — over every piece.
 */
const copy = {
  step: "Your gear",
  lead: "Bars show each line against its best possible roll.",
  edit: "Import or edit gear",
  editHint: "Official-site import, screenshot scan and the editor are in the full simulator",
  empty: "Nothing equipped",
  relayed: "Relayed",
  attunement: "Attunement",
  plan: "Retune plan",
  planLead: "Measures every possible retune on each piece and lists the best first.",
  planRun: "Find the best retunes",
  planWorking: "Measuring retunes…",
  planPreset: "Presets are fully relayed, so there is nothing to retune. Import your own gear to get a plan for it.",
  planNone: "No retune would raise DPS on this gear.",
  planRelay: "then relay",
  planRelayOnly: "relay it",
  planNote: "Gains assume the top roll, so treat them as a ceiling.",
}

const slotLabel = (slot: GearSlot) => dataText(`system.gearSlot.${slot}`, gearData.slots[slot])
const affixName = (key: string) => gameText(gearData.affixes[key]?.name ?? key)

function displayValue(key: string, value: number) {
  return gearData.affixes[key]?.percentage ? `${formatNumber(Math.round(value * 1000) / 10)}%` : formatNumber(value)
}

function lineRows(item: GearItem) {
  const lines = [
    { id: `base-${item.baseAffix.key}`, affix: item.baseAffix },
    ...item.additionalAffixes.map(affix => ({ id: `extra-${affix.key}`, affix })),
  ]
  return lines.map(({ id, affix }) => {
    const best = maxGearRoll(affix.key, "affix", item.relayed, item.level)
    return {
      id,
      key: affix.key,
      label: affixName(affix.key),
      value: displayValue(affix.key, affix.value),
      fraction: best ? affix.value / best : undefined,
    }
  })
}

type Props = {
  pathId: PathId
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
  weapons: [WeaponId, WeaponId]
  gearTier: GearLevel
  onEditGear: () => void
}

export function GearPanel(props: Props) {
  const { build, gearItems, weapons, gearTier } = props
  // Presets carry their gear per tier; the application's own resolver picks the tier in use.
  const inventory = useMemo(
    () => (build ? resolveBuildInventory(build, gearItems, weapons, gearTier) : undefined),
    [build, gearItems, weapons, gearTier],
  )
  const equipped = gearSlots.map(slot => {
    const id = inventory?.equipped[slot]
    return { slot, item: id ? inventory?.items.find(candidate => candidate.id === id) : undefined }
  })
  return (
    <section className="ds-panel ds-gear">
      <div className="ds-split ds-wrap">
        <h2>
          <span className="ds-step">{"2"}</span>
          {copy.step}
        </h2>
        <button type="button" className="ds-pill on" title={copy.editHint} onClick={props.onEditGear}>
          {copy.edit}
        </button>
      </div>
      <span className="ds-muted">{copy.lead}</span>
      <div className="ds-gearcards">
        {equipped.map(({ slot, item }) => (
          <GearPieceCard key={slot} slot={slot} item={item} />
        ))}
      </div>
    </section>
  )
}

function GearPieceCard({ slot, item }: { slot: GearSlot; item: GearItem | undefined }) {
  const rows = item ? lineRows(item) : []
  const measured = rows.filter(row => row.fraction !== undefined)
  const grade = measured.length
    ? Math.round((measured.reduce((sum, row) => sum + Math.min(1, row.fraction ?? 0), 0) / measured.length) * 100)
    : undefined
  const attunement = item?.attunement
  return (
    <article className="ds-piece">
      <header>
        <div>
          <b>{slotLabel(slot)}</b>
          <span className="ds-muted">
            {item ? gameText(gearData.gear[item.definitionId]?.name) : copy.empty}
            {item?.relayed ? ` · ${copy.relayed}` : ""}
          </span>
        </div>
        {grade !== undefined ? <span className={`ds-grade ${gradeClass(grade)}`}>{grade}%</span> : null}
      </header>
      {rows.map(row => (
        <div className="ds-line" key={row.id}>
          <span>{row.label}</span>
          <span className="ds-num">{row.value}</span>
          <Meter fraction={row.fraction ?? 0} low={(row.fraction ?? 1) < 0.85} />
        </div>
      ))}
      {attunement ? (
        <span className="ds-muted">
          {copy.attunement}:{" "}
          <b>
            {gameText(attunementData[attunement.key]?.name ?? attunement.key)}{" "}
            {attunementData[attunement.key]?.percentage
              ? `${formatNumber(Math.round(attunement.value * 1000) / 10)}%`
              : formatNumber(attunement.value)}
          </b>
        </span>
      ) : null}
    </article>
  )
}

function gradeClass(grade: number) {
  switch (true) {
    case grade >= 95:
      return "top"
    case grade >= 85:
      return ""
    default:
      return "low"
  }
}

/** One plan step: the best retune for one piece, measured by the engine. */
type PlanStep = { slot: GearSlot; action: string; gain: number; relayed: boolean }

export function RetunePlan(props: Props) {
  const { build, gearItems, pathId, context, rotation } = props
  const [requested, setRequested] = useState(false)
  const pieces = useMemo(
    () =>
      gearSlots.flatMap(slot => {
        const id = build?.equipped?.[slot]
        const item = id ? gearItems.find(candidate => candidate.id === id) : undefined
        if (!item || item.relayed || retuneCandidates(item, pathId).length === 0) return []
        return [{ slot, item }]
      }),
    [build, gearItems, pathId],
  )
  const targets = useMemo<ThroughputTarget[]>(() => {
    if (!requested || !build || build.isDefault) return []
    return pieces.flatMap(({ slot, item }) =>
      gearSuggestionTargets({
        build,
        // A fresh id, as the editor's draft has: the inventory already holds the original under its own.
        item: Object.assign({}, item, { id: "gear-suggestion-draft" }),
        slot,
        gearItems,
        editingItemId: item.id,
        pathId,
      }).map(target => ({ key: `${slot}|${target.key}`, build: target.build, gearItems: target.gearItems })),
    )
  }, [requested, build, pieces, gearItems, pathId])
  const readings = useBuildThroughputs({ targets, gearItems, context, rotation, editorSweep: true })
  const steps = useMemo(() => {
    if (!targets.length) return undefined
    const collected: PlanStep[] = []
    for (const { slot, item } of pieces) {
      const own: Record<string, ThroughputReading | undefined> = {}
      for (const [key, reading] of Object.entries(readings))
        if (key.startsWith(`${slot}|`)) own[key.slice(slot.length + 1)] = reading
      const current = own["gear-suggestion-current"]
      const relay = own["gear-suggestion-relay"]
      const ranked = rankRetuneSuggestions(retuneCandidates(item, pathId), own)
      if (!current || !relay || !ranked) return undefined
      const best = ranked[0]
      // Each piece gets its single best move against how it is now: a retune (relayed or not), or
      // only relaying it when no retune beats that.
      if (best && best.reading.dps > relay.dps && best.reading.dps > current.dps) {
        const source = item.additionalAffixes[best.index]
        collected.push({
          slot,
          action: `${affixName(source.key)} ${displayValue(source.key, source.value)} → ${affixName(best.key)} ${displayValue(best.key, best.max)}`,
          gain: (best.reading.dps / current.dps - 1) * 100,
          relayed: best.relayed,
        })
      } else if (relay.dps > current.dps) {
        collected.push({ slot, action: copy.planRelayOnly, gain: (relay.dps / current.dps - 1) * 100, relayed: false })
      }
    }
    // Gains under 0.05% would print as +0% and are not worth a trip to the retune NPC.
    return collected.filter(step => step.gain >= 0.05).toSorted((a, b) => b.gain - a.gain)
  }, [targets, pieces, readings, pathId])
  const total = steps?.reduce((sum, step) => sum + step.gain, 0) ?? 0
  const state = planState()
  function planState() {
    switch (true) {
      case build?.isDefault:
        return "preset"
      case !requested:
        return "idle"
      case steps === undefined:
        return "working"
      case (steps?.length ?? 0) > 0:
        return "done"
      default:
        return "none"
    }
  }
  function planBody() {
    switch (state) {
      case "preset":
        return <span className="ds-muted">{copy.planPreset}</span>
      case "idle":
        return (
          <>
            <span className="ds-muted">{copy.planLead}</span>
            <button type="button" className="ds-pill on ds-self-start" onClick={() => setRequested(true)}>
              {copy.planRun}
            </button>
          </>
        )
      case "working":
        return <span className="ds-muted">{copy.planWorking}</span>
      case "none":
        return <span className="ds-muted">{copy.planNone}</span>
      case "done":
        return (
          <>
            <ol className="ds-prio">
              {steps?.map((step, index) => (
                <li key={step.slot}>
                  <span className="ds-n">{index + 1}</span>
                  <span>
                    <b>{slotLabel(step.slot)}:</b> {step.action}
                    {step.relayed ? ` (${copy.planRelay})` : ""}
                  </span>
                  <span className="ds-gain">+{formatNumber(Math.round(step.gain * 10) / 10)}%</span>
                </li>
              ))}
            </ol>
            <span className="ds-muted">{copy.planNote}</span>
          </>
        )
    }
  }
  return (
    <section className="ds-panel">
      <div className="ds-split">
        <span className="ds-label">{copy.plan}</span>
        {steps?.length ? <span className="ds-gain">+{formatNumber(Math.round(total * 10) / 10)}%</span> : null}
      </div>
      {planBody()}
    </section>
  )
}
