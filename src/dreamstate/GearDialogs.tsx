import { useEffect, useMemo, useRef, useState } from "react"

import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { editorOptions, itemFromDraft, updateBuildInventory } from "@/dreamstate/gearEditing"
import { PieceForm } from "@/dreamstate/PieceForm"
import { itemToDraft, newDraft, type GearDraft } from "@/features/build/GearEditor"
import { GearSuggestions } from "@/features/build/GearSuggestions"
import { officialImportForPath, officialImportPaths } from "@/features/build/officialImportReview"
import { gearDefinitionForSlot, mergeImportedBuildState, type BuildEntry, type GearItem, type GearSlot } from "@/gear"
import { gameText, t } from "@/i18n"
import { createOfficialGearBookmarklet } from "@/officialGearBookmarklet"
import { useGearStore } from "@/stores/gearStore"
import type { WeaponId } from "@/types"
import { Dialog } from "@/ui/Dialog"

/**
 * DreamState fork: the gear dialogs of the simple page. The piece editor is the full simulator's
 * own `GearEditor` (with its screenshot scan and retune suggestions); the official-site import uses
 * the same bookmarklet, parser and merge as the full simulator, in a shorter Codex-style dialog.
 */
const copy = {
  editTitle: "Edit",
  otherPiece: "That screenshot shows a different piece. Close this and tap that piece instead.",
  importKicker: "Official site",
  importTitle: "Import your equipped gear",
  importStep1: "Drag this button to your bookmarks bar:",
  importStep2: "Open the official Where Winds Meet dashboard and log in:",
  importStep3: "Click the bookmark there. It copies your equipped gear.",
  importStep4: "Come back here and paste it below.",
  importPhone:
    'On a phone, bookmarks are awkward: close this, tap each piece and use "Scan a screenshot" instead. Gear is saved per browser, so an import on a computer stays on that computer.',
  importButton: "Import gear",
  notGear:
    "That doesn't look like the copied gear. Click the bookmark on the dashboard again, then paste the whole thing here.",
  cancel: "Cancel",
  wrongPath: "This gear is for {path}. Pick that path above, then import again.",
  noPath: "These weapons don't match any path the simulator supports yet.",
  imported: "Imported {count} pieces from {name}.",
  privacy: "The bookmark only runs on the official dashboard and copies to your clipboard. Nothing is sent anywhere.",
}

type EditorProps = {
  open: { slot: GearSlot; item: GearItem | undefined; buildId: string } | undefined
  pathId: PathId
  weapons: [WeaponId, WeaponId]
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
  slotLabel: string
  onClose: () => void
}

export function PieceEditorDialog(props: EditorProps) {
  const { open } = props
  const definition = open ? gearDefinitionForSlot(open.slot, props.weapons).definition : undefined
  return (
    <Dialog
      open={Boolean(open && definition)}
      onClose={props.onClose}
      className="ds-dialog ds-piece-dialog"
      label={`${copy.editTitle} ${gameText(definition?.name)}`}
    >
      {open && definition ? (
        <PieceEditor key={`${open.buildId}-${open.slot}-${open.item?.id ?? "new"}`} {...props} open={open} />
      ) : null}
    </Dialog>
  )
}

/** The editor for one piece; keyed by the piece, so opening another one starts from a fresh draft. */
function PieceEditor(props: EditorProps & { open: NonNullable<EditorProps["open"]> }) {
  const { open, pathId, weapons, build, gearItems, context, rotation, onClose } = props
  const { slot, item: editedItem, buildId } = open
  const [draft, setDraft] = useState<GearDraft>(() => (editedItem ? itemToDraft(editedItem) : newDraft()))
  const [error, setError] = useState("")
  const options = editorOptions({ slot, weapons, pathId, draft })
  const definition = options.definition
  const definitionId = gearDefinitionForSlot(slot, weapons).definitionId
  const editingItemId = editedItem?.id
  const suggestions = useMemo(
    () => (
      <GearSuggestions
        draft={draft}
        definitionId={definitionId}
        slot={slot}
        build={build}
        gearItems={gearItems}
        context={context}
        rotation={rotation}
        editingItemId={editingItemId}
      />
    ),
    [draft, definitionId, slot, build, gearItems, context, rotation, editingItemId],
  )
  if (!definition) return null
  const save = () => {
    const result = itemFromDraft({ draft, slot, editingItemId: editingItemId ?? null, options })
    if ("error" in result) {
      setError(result.error)
      return
    }
    const { item } = result
    updateBuildInventory(pathId, buildId, current => ({
      items: editedItem
        ? current.items.map(candidate => (candidate.id === item.id ? item : candidate))
        : [...current.items, item],
      equipped: Object.assign({}, current.equipped, { [slot]: item.id }),
    }))
    onClose()
  }
  return (
    <PieceForm
      slotLabel={props.slotLabel}
      definition={definition}
      definitionId={definitionId}
      draft={draft}
      setDraft={setDraft}
      baseAffixOptions={options.baseAffixOptions}
      additionalAffixOptions={options.additionalAffixOptions}
      attunementOptions={options.attunementOptions}
      error={error}
      onScanOtherPiece={() => setError(copy.otherPiece)}
      onCancel={onClose}
      onSave={save}
      suggestions={suggestions}
    />
  )
}

/** A paste that isn't JSON at all is almost always a partial or wrong clipboard. */
function importErrorMessage(error: unknown) {
  switch (true) {
    case error instanceof SyntaxError:
      return copy.notGear
    case error instanceof Error:
      return error.message
    default:
      return t("ui.buildTab.dashboardImportError")
  }
}

type ImportProps = {
  open: boolean
  pathId: PathId
  weapons: [WeaponId, WeaponId]
  devMode: boolean
  onClose: () => void
  onImported: (buildId: string) => void
}

export function OfficialImportDialog(props: ImportProps) {
  const [text, setText] = useState("")
  const [message, setMessage] = useState("")
  const bookmarkletRef = useRef<HTMLAnchorElement>(null)
  const bookmarklet = useMemo(
    () =>
      createOfficialGearBookmarklet({
        noGearData: t("ui.buildTab.bookmarkletNoGearData"),
        copyPrompt: t("ui.buildTab.bookmarkletCopyPrompt"),
        copySuccess: t("ui.buildTab.bookmarkletCopySuccess"),
        notLoggedIn: t("ui.buildTab.bookmarkletNotLoggedIn"),
        unreadableData: t("ui.buildTab.bookmarkletUnreadableData"),
        dashboardUnreachable: t("ui.buildTab.bookmarkletDashboardUnreachable"),
      }),
    [],
  )
  // React strips javascript: hrefs; the generated bookmarklet is trusted, as in the full simulator.
  useEffect(() => {
    bookmarkletRef.current?.setAttribute("href", bookmarklet)
  })
  const close = () => {
    setText("")
    setMessage("")
    props.onClose()
  }
  const importGear = async () => {
    try {
      const { parseOfficialGearExport } = await import("@/officialGearImport")
      const official = parseOfficialGearExport(JSON.parse(text), props.weapons)
      const paths = officialImportPaths(official.weapons, props.devMode)
      if (!paths.length) {
        setMessage(copy.noPath)
        return
      }
      if (!paths.includes(props.pathId)) {
        setMessage(copy.wrongPath.replace("{path}", gameText(typedPathDefinitions[paths[0]].name)))
        return
      }
      const reviewed = officialImportForPath(official.exportValue, props.pathId)
      const result = mergeImportedBuildState(
        useGearStore.getState().buildState,
        Object.assign({}, reviewed, {
          builds: reviewed.builds.map(build =>
            Object.assign({}, build, { name: build.name.trim() || official.roleName }),
          ),
        }),
        { reuseIdenticalGear: true },
      )
      if (result.importedGearCount + result.reusedGearCount !== official.gearCount || result.importedBuildCount !== 1)
        throw new Error(t("ui.buildTab.dashboardValidationError"))
      useGearStore.getState().updateBuildState(props.pathId, () => result.state)
      useGearStore.getState().selectBuildForPath(result.importedBuildIds[0], props.pathId)
      props.onImported(result.importedBuildIds[0])
      close()
    } catch (error) {
      setMessage(importErrorMessage(error))
    }
  }
  return (
    <Dialog open={props.open} onClose={close} className="ds-dialog" label={copy.importTitle}>
      <span className="ds-label">{copy.importKicker}</span>
      <h2>{copy.importTitle}</h2>
      <ol className="ds-steps">
        <li>
          {copy.importStep1}{" "}
          {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- The effect assigns the trusted bookmarklet href. */}
          <a className="ds-pill on ds-bookmarklet" ref={bookmarkletRef}>
            {t("ui.buildTab.exportWwmGear")}
          </a>
        </li>
        <li>
          {copy.importStep2}{" "}
          <a href="https://www.wherewindsmeetgame.com/m/2025h5sjgj/en/" target="_blank" rel="noreferrer">
            {t("ui.buildTab.officialWhereWindsMeetDashboard")}
          </a>
        </li>
        <li>{copy.importStep3}</li>
        <li>{copy.importStep4}</li>
      </ol>
      <textarea
        className="ds-paste"
        aria-label={t("ui.buildTab.officialDashboardGearJson")}
        placeholder={t("ui.buildTab.pasteTheCopiedDashboardJsonHere")}
        value={text}
        onChange={event => {
          setText(event.target.value)
          setMessage("")
        }}
      />
      {message ? <p className="ds-warn">{message}</p> : null}
      <div className="ds-actions">
        <button type="button" className="ds-pill" onClick={close}>
          {copy.cancel}
        </button>
        <button type="button" className="ds-pill on" disabled={!text.trim()} onClick={() => void importGear()}>
          {copy.importButton}
        </button>
      </div>
      <p className="ds-muted">{copy.importPhone}</p>
      <p className="ds-muted">{copy.privacy}</p>
    </Dialog>
  )
}
