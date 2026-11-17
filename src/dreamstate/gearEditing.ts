import { nanoid } from "nanoid"
import type { SetStateAction } from "react"

import type { PathId } from "@/application/contracts"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { createGearId, normalizeDraftValue, type GearDraft } from "@/features/build/GearEditor"
import {
  affixOptionsForGearDefinition,
  attunementData,
  attunementsForGearDefinition,
  duplicateBuildState,
  gearData,
  gearDefinitionForSlot,
  gearItemSupportsSlot,
  gearSlots,
  type BuildEntry,
  type GearInventory,
  type GearItem,
  type GearLevel,
  type GearSlot,
} from "@/gear"
import { useGearStore } from "@/stores/gearStore"
import type { WeaponId } from "@/types"

/**
 * DreamState fork: storing gear from the simple page. These mirror the rules the full simulator's
 * gear workspace (`BuildManagement` and `updateInventory` in features/build/BuildTab.tsx) applies,
 * so an item saved here is the same record the full editor would save. They are copied rather than
 * extracted so the upstream file stays untouched and the daily merge stays clean; keep them in step
 * if upstream changes its save rules.
 */

/** The name a preset's editable copy gets on the simple page. */
export const ownBuildName = "My gear"

/** The active build when it is the player's own; otherwise an editable copy of the preset, made active. */
export function ensureOwnBuild(pathId: PathId, build: BuildEntry, gearTier: GearLevel): BuildEntry {
  if (!build.isDefault) return build
  const store = useGearStore.getState()
  const id = `build-${nanoid()}`
  // "My gear", then "My gear 2", … so several copies stay tellable apart in the Build row.
  const taken = new Set(store.buildState.entries.map(entry => entry.name))
  let name = ownBuildName
  for (let n = 2; taken.has(name); n += 1) name = `${ownBuildName} ${n}`
  store.updateBuildState(pathId, current => duplicateBuildState(current, build.id, { id, name }, gearTier))
  store.selectBuildForPath(id, pathId)
  const created = useGearStore.getState().buildState.entries.find(entry => entry.id === id)
  if (!created) throw new Error("Could not create an editable copy of the preset.")
  return created
}

/** Same as `updateInventory` in BuildTab: items are shared, `equipped` belongs to the build. */
export function updateBuildInventory(pathId: PathId, buildId: string, update: SetStateAction<GearInventory>) {
  useGearStore.getState().updateBuildState(pathId, current => {
    const currentEntry = current.entries.find(entry => entry.id === buildId)
    if (!currentEntry || currentEntry.isDefault) return current
    const currentInventory = { items: current.gearItems, equipped: currentEntry.equipped ?? {} }
    const nextInventory = typeof update === "function" ? update(currentInventory) : update
    const availableItems = new Map(nextInventory.items.map(item => [item.id, item]))
    return {
      ...current,
      gearItems: nextInventory.items,
      entries: current.entries.map(entry => {
        if (entry.isDefault) return entry
        const candidateEquipped = entry.id === buildId ? nextInventory.equipped : (entry.equipped ?? {})
        const equipped = Object.fromEntries(
          gearSlots.flatMap(slot => {
            const itemId = candidateEquipped[slot]
            const item = itemId ? availableItems.get(itemId) : undefined
            return item && gearItemSupportsSlot(item, slot) ? [[slot, itemId]] : []
          }),
        ) as Partial<Record<GearSlot, string>>
        const previous = entry.equipped ?? {}
        if (
          Object.keys(previous).length === Object.keys(equipped).length &&
          gearSlots.every(slot => previous[slot] === equipped[slot])
        )
          return entry
        return Object.assign({}, entry, { equipped })
      }),
    }
  })
}

/** The options the editor offers for one slot, as BuildManagement computes them. */
export function editorOptions(input: {
  slot: GearSlot
  weapons: [WeaponId, WeaponId]
  pathId: PathId
  draft: GearDraft
}) {
  const selected = gearDefinitionForSlot(input.slot, input.weapons)
  const definition = selected.definition
  const pathTag = input.pathId === "mixed" ? undefined : typedPathDefinitions[input.pathId].tag
  const martialArtTags = input.weapons.map(weapon => martialArtDefinitions[weapon].tag)
  const attunementOptions = (definition ? attunementsForGearDefinition(definition) : []).filter(key => {
    const tags = attunementData[key]?.tags ?? []
    if (tags.includes("Weapon")) return true
    return (!pathTag || tags.includes(pathTag)) && martialArtTags.some(tag => tags.includes(tag))
  })
  return {
    definitionId: selected.definitionId,
    definition,
    baseAffixOptions: definition
      ? affixOptionsForGearDefinition(definition, "baseAffixes", input.draft.level, input.draft.relayed)
      : [],
    additionalAffixOptions: definition
      ? affixOptionsForGearDefinition(definition, "additionalAffixes", input.draft.level, input.draft.relayed)
      : [],
    attunementOptions,
  }
}

/** The full editor's checks, worded for the Codex form ("main line" and "extra lines"). */
const formErrors = {
  main: "Choose the main line and enter its value.",
  mainAvailability: "That main line can't roll on this piece.",
  incomplete: "Each line you fill in needs both a stat and a value.",
  attunement: "That attunement can't roll on this piece for this path.",
  extra: "One of the extra lines can't roll on this piece.",
  duplicate: "Two extra lines can't be the same stat.",
}

/** The draft as a saved item, or the error the full editor would show for it. */
export function itemFromDraft(input: {
  draft: GearDraft
  slot: GearSlot
  editingItemId: string | null
  options: ReturnType<typeof editorOptions>
}): { item: GearItem } | { error: string } {
  const { draft, slot, editingItemId, options } = input
  const definition = options.definition
  if (!definition) return { error: formErrors.mainAvailability }
  const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes, "affix", draft.relayed, draft.level)
  const additionalAffixDrafts = draft.additionalAffixes.filter(affix => affix.key || affix.value.trim())
  const additionalAffixes = additionalAffixDrafts.map(affix =>
    normalizeDraftValue(affix, gearData.affixes, "affix", draft.relayed, draft.level),
  )
  const hasAttunementDraft = Boolean(draft.attunement.key || draft.attunement.value.trim())
  const attunement = hasAttunementDraft
    ? normalizeDraftValue(draft.attunement, attunementData, "attunement", draft.relayed, draft.level)
    : undefined
  if (!baseAffix) return { error: formErrors.main }
  if (!options.baseAffixOptions.includes(baseAffix.key)) return { error: formErrors.mainAvailability }
  if (additionalAffixes.some(affix => !affix) || (hasAttunementDraft && !attunement))
    return { error: formErrors.incomplete }
  if (attunement && !options.attunementOptions.includes(attunement.key)) return { error: formErrors.attunement }
  const normalizedAdditional = additionalAffixes.filter((affix): affix is { key: string; value: number } =>
    Boolean(affix),
  )
  if (normalizedAdditional.some(affix => !options.additionalAffixOptions.includes(affix.key)))
    return { error: formErrors.extra }
  if (new Set(normalizedAdditional.map(affix => affix.key)).size !== normalizedAdditional.length)
    return { error: formErrors.duplicate }
  const turned =
    draft.turnedAffixIndex !== undefined && draft.additionalAffixes[draft.turnedAffixIndex]?.key
      ? additionalAffixDrafts.indexOf(draft.additionalAffixes[draft.turnedAffixIndex])
      : undefined
  const item: GearItem = {
    id: editingItemId ?? createGearId(),
    definitionId: options.definitionId,
    level: draft.level,
    rarity: draft.rarity,
    baseAffix,
    additionalAffixes: normalizedAdditional,
  }
  if (!definition.weapon) item.slot = slot
  if (draft.relayed) item.relayed = true
  if (turned !== undefined) item.turnedAffixIndex = turned
  if (attunement) item.attunement = attunement
  return { item }
}
