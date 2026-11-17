import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"

import { Meter } from "@/dreamstate/Meter"
import {
  blankValue,
  capAndFilterGearDraft,
  capGearDraft,
  formatNumber,
  savedValueToDraft,
  type GearDraft,
  type GearValueDraft,
} from "@/features/build/GearEditor"
import { GearOcrModal } from "@/features/build/GearOcrModal"
import {
  attunementData,
  gearData,
  maxGearRoll,
  type GearDefinition,
  type GearLevel,
  type GearRarity,
  type GearValueDefinition,
} from "@/gear"
import type { GearOcrResult } from "@/gearOcr"
import { gameText } from "@/i18n"

/**
 * DreamState fork: the Codex-style form for one piece of gear. It edits the same `GearDraft` the
 * full simulator's `GearEditor` does, with that editor's own helpers for caps, level changes and the
 * screenshot scan, so a piece saved here is the record the full editor would save.
 */
const copy = {
  scan: "Scan a screenshot",
  scanHint: "Fills every line from a screenshot of the piece's tooltip",
  tier: "Tier",
  rarity: "Rarity",
  gold: "Gold",
  purple: "Purple",
  relayed: "Relayed",
  max: "Set all to best roll",
  main: "Main line",
  lines: "Extra lines",
  retunable: "Retunable",
  retunableHint: "The one extra line the game lets you retune on this piece",
  attunement: "Attunement",
  choose: "Choose a line",
  none: "None",
  best: "best",
  suggestions: "Best retunes for this piece",
  cancel: "Cancel",
  save: "Save piece",
}

/** Tiers players have now; a piece already at a higher tier keeps its own in the list. */
const shownLevels: GearLevel[] = [91, 96, 100]

type Props = {
  slotLabel: string
  definition: GearDefinition
  definitionId: string
  draft: GearDraft
  setDraft: Dispatch<SetStateAction<GearDraft>>
  baseAffixOptions: string[]
  additionalAffixOptions: string[]
  attunementOptions: string[]
  error: string
  onScanOtherPiece: () => void
  onCancel: () => void
  onSave: () => void
  suggestions: ReactNode
}

function bestRoll(
  key: string,
  definitions: Record<string, GearValueDefinition>,
  category: "affix" | "attunement",
  relayed: boolean,
  level: GearLevel,
) {
  const roll = maxGearRoll(key, category, relayed, level)
  if (typeof roll !== "number") return undefined
  return definitions[key]?.percentage ? roll * 100 : roll
}

export function PieceForm(props: Props) {
  const { definition, draft, setDraft } = props
  const [scanning, setScanning] = useState(false)
  // Start keyboard focus on the form itself, so opening it doesn't ring the scan button.
  const formRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The dialog opens (and focuses and scrolls to its first button) after this effect runs, so
    // wait a frame, then move focus to the form and start at the top.
    const frame = requestAnimationFrame(() => {
      formRef.current?.focus({ preventScroll: true })
      const dialog = formRef.current?.closest("dialog")
      if (dialog) dialog.scrollTop = 0
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  const levels = shownLevels.includes(draft.level) ? shownLevels : [...shownLevels, draft.level]
  const takenExtras = new Set(draft.additionalAffixes.map(affix => affix.key).filter(Boolean))
  const setLevel = (level: GearLevel) =>
    setDraft(current => capAndFilterGearDraft(Object.assign({}, current, { level }), definition))
  const setRelayed = (relayed: boolean) => setDraft(current => capAndFilterGearDraft(current, definition, relayed))
  const setRarity = (rarity: GearRarity) => setDraft(current => Object.assign({}, current, { rarity }))
  const toBest = (
    value: GearValueDraft,
    definitions: Record<string, GearValueDefinition>,
    category: "affix" | "attunement",
  ) => {
    const roll = maxGearRoll(value.key, category, draft.relayed, draft.level)
    return typeof roll === "number" ? savedValueToDraft({ key: value.key, value: roll }, definitions) : value
  }
  const setAllToBest = () =>
    setDraft(current =>
      Object.assign({}, current, {
        baseAffix: toBest(current.baseAffix, gearData.affixes, "affix"),
        additionalAffixes: current.additionalAffixes.map(affix => toBest(affix, gearData.affixes, "affix")),
        attunement: toBest(current.attunement, attunementData, "attunement"),
      }),
    )
  // Same as GearEditor's importOcrResult.
  const importScan = (result: GearOcrResult) => {
    if (result.definitionId !== props.definitionId) {
      props.onScanOtherPiece()
      return
    }
    const extras = result.additionalAffixes.slice(0, 4).map(affix => savedValueToDraft(affix, gearData.affixes))
    setDraft(current =>
      capGearDraft(
        Object.assign({}, current, {
          level: result.level,
          rarity: result.rarity,
          relayed: result.relayed,
          turnedAffixIndex: result.turnedAffixIndex,
          baseAffix: result.baseAffix ? savedValueToDraft(result.baseAffix, gearData.affixes) : blankValue(),
          additionalAffixes: [...extras, ...Array.from({ length: 4 - extras.length }, blankValue)],
          attunement: result.attunement ? savedValueToDraft(result.attunement, attunementData) : blankValue(),
        }),
      ),
    )
  }
  const lineEditor = (input: {
    label: string
    value: GearValueDraft
    options: string[]
    definitions: Record<string, GearValueDefinition>
    category: "affix" | "attunement"
    taken?: Set<string>
    emptyLabel: string
    onChange: (next: GearValueDraft) => void
    extra?: ReactNode
  }) => {
    const best = input.value.key
      ? bestRoll(input.value.key, input.definitions, input.category, draft.relayed, draft.level)
      : undefined
    const numeric = Number(input.value.value)
    const percentage = input.definitions[input.value.key]?.percentage === true
    // A typed value is kept within the best roll, as the full editor's capDraftValue does.
    const change = (next: GearValueDraft) => {
      const cap = next.key
        ? bestRoll(next.key, input.definitions, input.category, draft.relayed, draft.level)
        : undefined
      const typed = Number(next.value)
      const within =
        cap !== undefined && next.value.trim() && Number.isFinite(typed) && typed > cap
          ? Object.assign({}, next, { value: formatNumber(cap) })
          : next
      input.onChange(within)
    }
    return (
      <div className="ds-field">
        <div className="ds-field-row">
          <select
            aria-label={input.label}
            value={input.value.key}
            onChange={event => change(Object.assign({}, input.value, { key: event.target.value }))}
          >
            <option value="">{input.emptyLabel}</option>
            {input.options
              .filter(key => input.definitions[key]?.pickable !== false)
              .map(key => (
                <option key={key} value={key} disabled={key !== input.value.key && (input.taken?.has(key) ?? false)}>
                  {gameText(input.definitions[key]?.name ?? key)}
                </option>
              ))}
          </select>
          <span className="ds-number">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={best}
              step="0.01"
              aria-label={`${input.label} value`}
              value={input.value.value}
              disabled={!input.value.key}
              onChange={event => change(Object.assign({}, input.value, { value: event.target.value }))}
            />
            {percentage ? <i>%</i> : null}
          </span>
        </div>
        {input.value.key && best !== undefined ? (
          <div className="ds-field-meta">
            <Meter fraction={Number.isFinite(numeric) ? numeric / best : 0} low={numeric / best < 0.85} />
            <button
              type="button"
              className="ds-linkbtn"
              onClick={() => input.onChange(toBest(input.value, input.definitions, input.category))}
            >
              {copy.best} {Math.round(best * 100) / 100}
              {percentage ? "%" : ""}
            </button>
            {input.extra}
          </div>
        ) : (
          input.extra
        )}
      </div>
    )
  }
  return (
    <div className="ds-form" ref={formRef} tabIndex={-1}>
      <div className="ds-form-head">
        <div>
          {props.slotLabel !== gameText(definition.name) ? <span className="ds-label">{props.slotLabel}</span> : null}
          <h2>{gameText(definition.name)}</h2>
        </div>
        <button type="button" className="ds-bigbtn on" title={copy.scanHint} onClick={() => setScanning(true)}>
          <span>{copy.scan}</span>
        </button>
      </div>

      <div className="ds-form-opts">
        <div className="ds-pills">
          <span className="ds-label">{copy.tier}</span>
          {levels.map(level => (
            <button
              key={level}
              type="button"
              aria-pressed={draft.level === level}
              className={`ds-pill ${draft.level === level ? "on" : ""}`}
              onClick={() => setLevel(level)}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="ds-pills">
          {(["Gold", "Purple"] as const).map(rarity => (
            <button
              key={rarity}
              type="button"
              aria-pressed={draft.rarity === rarity}
              className={`ds-pill ${draft.rarity === rarity ? "on" : ""}`}
              onClick={() => setRarity(rarity)}
            >
              {rarity === "Gold" ? copy.gold : copy.purple}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={draft.relayed}
            className={`ds-pill ${draft.relayed ? "on" : ""}`}
            onClick={() => setRelayed(!draft.relayed)}
          >
            {copy.relayed}
          </button>
        </div>
      </div>

      <section className="ds-form-group">
        <span className="ds-label">{copy.main}</span>
        {lineEditor({
          label: copy.main,
          value: draft.baseAffix,
          options: props.baseAffixOptions,
          definitions: gearData.affixes,
          category: "affix",
          emptyLabel: copy.choose,
          onChange: next => setDraft(current => Object.assign({}, current, { baseAffix: next })),
        })}
      </section>

      <section className="ds-form-group">
        <span className="ds-label">{copy.lines}</span>
        {draft.additionalAffixes.map((affix, index) =>
          lineEditor({
            label: `${copy.lines} ${index + 1}`,
            value: affix,
            options: props.additionalAffixOptions,
            definitions: gearData.affixes,
            category: "affix",
            taken: takenExtras,
            emptyLabel: copy.choose,
            onChange: next =>
              setDraft(current =>
                Object.assign({}, current, {
                  additionalAffixes: current.additionalAffixes.map((existing, position) =>
                    position === index ? next : existing,
                  ),
                }),
              ),
            extra: affix.key ? (
              <button
                type="button"
                title={copy.retunableHint}
                aria-pressed={draft.turnedAffixIndex === index}
                className={`ds-tag ${draft.turnedAffixIndex === index ? "on" : ""}`}
                onClick={() =>
                  setDraft(current =>
                    Object.assign({}, current, {
                      turnedAffixIndex: current.turnedAffixIndex === index ? undefined : index,
                    }),
                  )
                }
              >
                {copy.retunable}
              </button>
            ) : undefined,
          }),
        )}
      </section>

      <section className="ds-form-group">
        <span className="ds-label">{copy.attunement}</span>
        {lineEditor({
          label: copy.attunement,
          value: draft.attunement,
          options: props.attunementOptions,
          definitions: attunementData,
          category: "attunement",
          emptyLabel: copy.none,
          onChange: next => setDraft(current => Object.assign({}, current, { attunement: next })),
        })}
      </section>

      <button type="button" className="ds-pill ds-self-start" onClick={setAllToBest}>
        {copy.max}
      </button>

      <details className="ds-form-suggest">
        <summary>{copy.suggestions}</summary>
        {props.suggestions}
      </details>

      {props.error ? <p className="ds-warn">{props.error}</p> : null}
      <div className="ds-actions">
        <button type="button" className="ds-pill" onClick={props.onCancel}>
          {copy.cancel}
        </button>
        <button type="button" className="ds-pill on" onClick={props.onSave}>
          {copy.save}
        </button>
      </div>

      <GearOcrModal
        open={scanning}
        definitionId={props.definitionId}
        definitionName={gameText(definition.name)}
        onClose={() => setScanning(false)}
        onImport={importScan}
      />
    </div>
  )
}
