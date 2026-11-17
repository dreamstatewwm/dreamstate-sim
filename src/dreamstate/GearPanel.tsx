import { useEffect, useMemo, useRef, useState } from "react"

import type { PathId } from "@/application/contracts"
import { formatNumber } from "@/application/formatting"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { OfficialImportDialog, PieceEditorDialog } from "@/dreamstate/GearDialogs"
import { ensureOwnBuild } from "@/dreamstate/gearEditing"
import { Meter } from "@/dreamstate/Meter"
import { rollQuality } from "@/dreamstate/rollQuality"
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
import { useGearStore } from "@/stores/gearStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { WeaponId } from "@/types"

/**
 * DreamState fork: the equipped gear as cards (each line against its best roll) and a retune plan.
 * The plan uses the full simulator's own retune suggestion pieces — the same candidates, the same
 * measured rotations and the same ranking the gear editor shows for one item — over every piece.
 */
const copy = {
  step: "Your gear",
  lead: "Bars show each line against its best possible roll, coloured like the game:",
  legend: [
    ["gold", "Gold"],
    ["purple", "Purple"],
    ["blue", "Blue"],
    ["green", "Green"],
  ] as const,
  importOfficial: "Import from official site",
  importOfficialHint: "One bookmark, all 8 pieces",
  tapToEdit: "Tap a piece to type it in or scan a screenshot of it.",
  fromPreset: "Start from the preset",
  fromPresetHint: "Then change the pieces you have",
  backToPreset: "Compare with the preset",
  backToPresetHint: "Your gear stays saved under Build",
  presetNote: "Showing the preset's gear. Import yours, or tap a piece to start your own copy.",
  ownNote: "Your gear is saved in this browser only.",
  empty: "Nothing equipped",
  relayed: "Relayed",
  groupWeapons: "Weapons and accessories",
  groupArmor: "Armor",
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

/** The in-game equipment screen: weapons with Disc and Pendant below them, then the armor block. */
const inGameOrder: GearSlot[] = [
  "leftWeapon",
  "rightWeapon",
  "disc",
  "pendant",
  "helmet",
  "chestpiece",
  "bracer",
  "greaves",
]

/** The card each block of the grid starts with, and its heading. */
const groupStarts: Partial<Record<GearSlot, string>> = { leftWeapon: copy.groupWeapons, helmet: copy.groupArmor }

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
  onUsePreset: () => void
}

export function GearPanel(props: Props) {
  const { build, gearItems, weapons, gearTier, pathId } = props
  const devMode = useSettingsStore(state => state.devMode)
  const [editing, setEditing] = useState<{ slot: GearSlot; item: GearItem | undefined; buildId: string }>()
  const [importing, setImporting] = useState(false)
  const editPiece = (slot: GearSlot) => {
    if (!build) return
    const own = ensureOwnBuild(pathId, build, gearTier)
    const state = useGearStore.getState().buildState
    const itemId = state.entries.find(entry => entry.id === own.id)?.equipped?.[slot]
    setEditing({ slot, item: state.gearItems.find(item => item.id === itemId), buildId: own.id })
  }
  // Presets carry their gear per tier; the application's own resolver picks the tier in use.
  const inventory = useMemo(
    () => (build ? resolveBuildInventory(build, gearItems, weapons, gearTier) : undefined),
    [build, gearItems, weapons, gearTier],
  )
  const equipped = inGameOrder.map(slot => {
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
      </div>
      <div className="ds-importrow">
        <button type="button" className="ds-bigbtn on" onClick={() => setImporting(true)}>
          <span>{copy.importOfficial}</span>
          <small>{copy.importOfficialHint}</small>
        </button>
        {build?.isDefault ? (
          <button type="button" className="ds-bigbtn" onClick={() => ensureOwnBuild(pathId, build, gearTier)}>
            <span>{copy.fromPreset}</span>
            <small>{copy.fromPresetHint}</small>
          </button>
        ) : (
          <button type="button" className="ds-bigbtn" onClick={props.onUsePreset}>
            <span>{copy.backToPreset}</span>
            <small>{copy.backToPresetHint}</small>
          </button>
        )}
      </div>
      <span className="ds-muted">
        {build?.isDefault ? copy.presetNote : copy.ownNote} {copy.tapToEdit} {copy.lead}{" "}
        <span className="ds-legend">
          {copy.legend.map(([quality, label]) => (
            <span key={quality} className={`ds-q-${quality}`}>
              <i />
              {label}
            </span>
          ))}
        </span>
      </span>
      <div className="ds-gearcards">
        {equipped.map(({ slot, item }) => (
          <GearPieceCard key={slot} slot={slot} item={item} onEdit={editPiece} group={groupStarts[slot]} />
        ))}
      </div>
      <PieceEditorDialog
        open={editing}
        slotLabel={editing ? slotLabel(editing.slot) : ""}
        pathId={pathId}
        weapons={weapons}
        build={build}
        gearItems={gearItems}
        context={props.context}
        rotation={props.rotation}
        onClose={() => setEditing(undefined)}
      />
      <OfficialImportDialog
        open={importing}
        pathId={pathId}
        weapons={weapons}
        devMode={devMode}
        onClose={() => setImporting(false)}
        onImported={() => setImporting(false)}
      />
    </section>
  )
}

function GearPieceCard(props: {
  slot: GearSlot
  item: GearItem | undefined
  onEdit: (slot: GearSlot) => void
  group?: string
}) {
  const { slot, item } = props
  const rows = item ? lineRows(item) : []
  const measured = rows.filter(row => row.fraction !== undefined)
  const grade = measured.length
    ? Math.round((measured.reduce((sum, row) => sum + Math.min(1, row.fraction ?? 0), 0) / measured.length) * 100)
    : undefined
  const attunement = item?.attunement
  return (
    <>
      {props.group ? <span className="ds-label ds-gear-group">{props.group}</span> : null}
      <button type="button" className="ds-piece" onClick={() => props.onEdit(slot)}>
        <span className="ds-piece-head">
          <span className="ds-piece-name">
            <b>{slotLabel(slot)}</b>
            <span className="ds-muted">
              {item ? gameText(gearData.gear[item.definitionId]?.name) : copy.empty}
              {item?.relayed ? ` · ${copy.relayed}` : ""}
            </span>
          </span>
          {grade !== undefined ? <span className={`ds-grade ds-q-${rollQuality(grade / 100)}`}>{grade}%</span> : null}
        </span>
        {rows.map(row => (
          <span className="ds-line" key={row.id}>
            <span>{row.label}</span>
            <span className="ds-num">{row.value}</span>
            <Meter
              fraction={row.fraction ?? 0}
              quality={row.fraction === undefined ? undefined : rollQuality(row.fraction)}
            />
          </span>
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
      </button>
    </>
  )
}

/** One plan step: the best retune for one piece, measured by the engine. */
type PlanStep = { slot: GearSlot; action: string; gain: number; relayed: boolean }

export function RetunePlan(props: Props) {
  const { build, gearItems, pathId, context, rotation } = props
  const [requested, setRequested] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
    // `attempt` is read so a stalled sweep can be asked again with fresh targets.
    void attempt
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
  }, [requested, build, pieces, gearItems, pathId, attempt])
  const readings = useBuildThroughputs({ targets, gearItems, context, rotation, editorSweep: true })
  const measuredCount = Object.values(readings).filter(Boolean).length
  // A reading cancelled mid-sweep (the main numbers recalculating supersedes it) is never asked for
  // again by the sweep, so a plan waiting on it would wait forever. When nothing new arrives for a
  // while, start the sweep again: readings already held are reused, only the missing ones run.
  const lastCount = useRef({ count: -1, at: 0 })
  useEffect(() => {
    if (!targets.length || measuredCount >= targets.length) return
    const timer = setInterval(() => {
      const now = Date.now()
      if (lastCount.current.count !== measuredCount) lastCount.current = { count: measuredCount, at: now }
      else if (now - lastCount.current.at > 6000) {
        lastCount.current = { count: measuredCount, at: now }
        setAttempt(current => current + 1)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [targets.length, measuredCount])
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
        return (
          <>
            <span className="ds-muted">
              {copy.planWorking} {measuredCount} / {targets.length}
            </span>
            <Meter fraction={targets.length ? measuredCount / targets.length : 0} />
          </>
        )
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
