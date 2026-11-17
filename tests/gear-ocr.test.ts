import { existsSync } from "node:fs"

import { createWorker, OEM, PSM } from "tesseract.js"
import { assert, describe, it } from "vitest"

import { gearRarityFromTitleColor, inferGearLevelAndRarity, parseGearOcrTsv } from "@/gearOcr"
import type { GearOcrResult } from "@/gearOcr"

// Ported from script/probe/check-gear-ocr.mjs. Screenshot recognition needs
// the gitignored local/OCR fixtures; the pure parsing checks always run.
const moBladeImage = "local/OCR/mo blade.png"
const helmetImage = "local/OCR/helmet.png"
const screenshotsPresent = existsSync(moBladeImage) && existsSync(helmetImage)

const tsvOf = (page: { tsv: string | null }) => {
  assert(page.tsv, "Tesseract was asked for TSV and must return it.")
  return page.tsv
}
const baseAffixOf = (result: GearOcrResult) => {
  assert(result.baseAffix, "The recognized gear must carry a base affix.")
  return result.baseAffix
}
const attunementOf = (result: GearOcrResult) => {
  assert(result.attunement, "The recognized gear must carry an attunement.")
  return result.attunement
}

describe("gear-ocr", () => {
  it("uses datamined item names ahead of the editor slot", () => {
    const tsv = "5\t1\t1\t1\t1\t1\t28\t20\t200\t40\t95\tMirage Ward"
    const result = parseGearOcrTsv(tsv, "Mirage Ward\nTier 96", 564, 811, "helmet")
    assert.equal(result.definitionId, "pendant")
    const weapon = parseGearOcrTsv(tsv, "Mirage Keening\nTier 96", 564, 811, "sword")
    assert.equal(weapon.definitionId, "moBlade")
    const purple = parseGearOcrTsv(tsv, "Mirage Ward\nTier 96", 564, 811, "helmet", "Purple")
    assert.equal(purple.rarity, "Purple", "Title color supplies rarity without visible fixed base stats.")
  })

  it("reads only the colored marker beside the title at different scales", () => {
    for (const scale of [1, 2]) {
      const width = 100 * scale
      const height = 200 * scale
      const tsv = [5, 1, 1, 1, 1, 1, 25 * scale, 10 * scale, 60 * scale, 20 * scale, 95, "Item Name"].join("\t")
      const pixels = new Uint8ClampedArray(width * height * 4)
      const paint = (left: number, top: number, right: number, bottom: number, rgb: number[]) => {
        for (let y = top * scale; y < bottom * scale; y++) {
          for (let x = left * scale; x < right * scale; x++) pixels.set([...rgb, 255], (y * width + x) * 4)
        }
      }
      paint(10, 10, 15, 30, [190, 160, 100])
      paint(10, 60, 90, 80, [170, 140, 200])
      assert.equal(gearRarityFromTitleColor(pixels, width, height, tsv), "Gold")
      paint(10, 10, 15, 30, [170, 140, 200])
      assert.equal(gearRarityFromTitleColor(pixels, width, height, tsv), "Purple")
      paint(10, 10, 15, 30, [180, 180, 180])
      assert.equal(gearRarityFromTitleColor(pixels, width, height, tsv), undefined)
    }
  })

  it.skipIf(!screenshotsPresent)("recognizes gear screenshots", async () => {
    // Tesseract's Node adapter writes its decompressed model to cachePath; keep that cache in ignored local/.
    const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath: "public/ocr", cachePath: "local" })
    try {
      const recognize = async (path: string, width: number, height: number) => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" })
        const metadata = await worker.recognize(path, {}, { text: true, tsv: true })
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" })
        const positioned = await worker.recognize(path, {}, { text: true, tsv: true })
        return parseGearOcrTsv(tsvOf(positioned.data), `${metadata.data.text}\n${positioned.data.text}`, width, height)
      }

      const moBlade = await recognize("local/OCR/mo blade.png", 583, 797)
      assert(
        moBlade.definitionId === "moBlade" && moBlade.level === 96 && moBlade.rarity === "Gold" && !moBlade.relayed,
        "Mo Blade metadata was not recognized.",
      )
      assert(
        baseAffixOf(moBlade).key === "maxPhys" && baseAffixOf(moBlade).value === 55,
        "Mo Blade base affix was not recognized.",
      )
      assert(
        moBlade.additionalAffixes.map(affix => affix.key).join(",") === "moBladeDmgBoost,maxPhys,crit,maxVoidAttack",
        "Mo Blade additional affixes were not recognized in order.",
      )
      assert(
        Math.abs(moBlade.additionalAffixes[0].value - 0.06) < 1e-9 &&
          Math.abs(moBlade.additionalAffixes[2].value - 0.088) < 1e-9,
        "Mo Blade percentage values were not converted to ratios.",
      )
      assert(
        attunementOf(moBlade).key === "physicalPenetration" && attunementOf(moBlade).value === 10,
        "Mo Blade attunement was not recognized.",
      )

      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" })
      const moBladeBlock = await worker.recognize("local/OCR/mo blade.png", {}, { text: true, tsv: true })
      const moBladeFallback = parseGearOcrTsv(tsvOf(moBladeBlock.data), moBladeBlock.data.text, 583, 797)
      assert(
        moBladeFallback.additionalAffixes.length === 4 && attunementOf(moBladeFallback).key === "physicalPenetration",
        "The block-layout fallback must recognize all six Mo Blade rows.",
      )
      const moBladeDifferentCrop = parseGearOcrTsv(tsvOf(moBladeBlock.data), moBladeBlock.data.text, 583, 2000)
      assert(
        moBladeDifferentCrop.additionalAffixes.map(affix => affix.key).join(",") ===
          "moBladeDmgBoost,maxPhys,crit,maxVoidAttack" &&
          attunementOf(moBladeDifferentCrop).key === "physicalPenetration",
        "Affix row recognition must not depend on the screenshot height.",
      )

      const helmet = await recognize("local/OCR/helmet.png", 564, 811)
      assert(
        helmet.definitionId === "helmet" && helmet.level === 96 && helmet.rarity === "Purple" && helmet.relayed,
        "Helmet metadata was not recognized.",
      )
      assert(
        baseAffixOf(helmet).key === "precision" && Math.abs(baseAffixOf(helmet).value - 0.075) < 1e-9,
        "Helmet base affix was not recognized.",
      )
      assert(
        helmet.additionalAffixes.map(affix => affix.key).join(",") === "minPhys,agility,crit,maxStonesplit",
        "Helmet additional affixes were not recognized in order.",
      )
      assert(
        helmet.additionalAffixes[0].value === 73.1 && helmet.additionalAffixes[1].value === 46.4,
        "Helmet numeric values were not recognized.",
      )
      assert(
        attunementOf(helmet).key === "phalanxbaneChargedBoost" && Math.abs(attunementOf(helmet).value - 0.054) < 1e-9,
        "Helmet attunement was not recognized.",
      )
    } finally {
      await worker.terminate()
    }
  })

  it("reads inline progression rows, including split values and repeated base labels", () => {
    const lines = [
      [328, "Max Physical Attack", "+49.3"],
      [461, "Agility", "+40.1"],
      [598, "[Turn]Max Physical Attack", "+6", "3.8"],
      [730, "Precision Rate", "+6.5%"],
      [866, "Min Bellstrike Attack", "+35.7"],
      [1014, "Physical Resistance", "+7.2"],
    ] as const
    const tsv = lines
      .flatMap(([top, label, ...values], index) =>
        [label, ...values].map((text, word) =>
          [5, 1, 1, 1, index + 1, word + 1, word === 0 ? 225 : 490 + word * 30, top, 25, 24, 90, text].join("\t"),
        ),
      )
      .join("\n")
    const result = parseGearOcrTsv(tsv, "Vanguard Ward\nTier91", 891, 1143, "moBlade")
    assert.deepEqual(result.baseAffix, { key: "maxPhys", value: 49.3 })
    assert.deepEqual(result.additionalAffixes, [
      { key: "agility", value: 40.1 },
      { key: "maxPhys", value: 63.8 },
      { key: "precision", value: 0.065 },
      { key: "minBellstrike", value: 35.7 },
    ])
    assert.equal(result.level, 91)
    assert.equal(result.turnedAffixIndex, 1, "The [Turn] prefix must identify the additional affix already retuned.")
    assert.equal(result.definitionId, "pendant", "The item name overrides an incorrect editor slot.")
    assert.equal(result.attunement, undefined, "Unavailable attunements still require manual correction.")
  })

  it("infers rarity and tolerates unclear OCR fields without screenshots", () => {
    const inferredPurple = inferGearLevelAndRarity("helmet", "Gear Tier 96 Max HP 5196 Physical Defense 20")
    assert(inferredPurple.level === 96 && inferredPurple.rarity === "Purple", "Fixed base stats must determine rarity.")
    const defaultMetadata = inferGearLevelAndRarity("helmet", "unreadable metadata")
    assert(
      defaultMetadata.level === 96 && defaultMetadata.rarity === "Gold",
      "Unclear metadata must default to 96 Gold.",
    )
    const partial = parseGearOcrTsv(
      "5\t1\t1\t1\t1\t1\t10\t10\t100\t20\t90\tUnreadable",
      "Unreadable",
      500,
      500,
      "moBlade",
    )
    assert(
      partial.definitionId === "moBlade" &&
        partial.level === 96 &&
        partial.rarity === "Gold" &&
        !partial.baseAffix &&
        partial.additionalAffixes.length === 0 &&
        !partial.attunement,
      "Unclear OCR fields must use the editor gear type and leave attribute rows empty.",
    )
  })

  // DreamState fork: lines players reported the scan missing.
  const inlineTsv = (lines: ReadonlyArray<readonly [number, string, string]>) =>
    lines
      .map(([top, label, value], index) =>
        [label, value]
          .map((text, word) =>
            [5, 1, 1, 1, index + 1, word + 1, word === 0 ? 225 : 520, top, 25, 24, 90, text].join("\t"),
          )
          .join("\n"),
      )
      .join("\n")

  it("reads the game's wording of the boss line and Tier 100 mystic lines without a tier banner", () => {
    const tsv = inlineTsv([
      [300, "Critical Rate", "+10.4%"],
      [430, "Min Physical Attack", "+90.6"],
      [560, "Agility", "+57.4"],
      [690, "Precision Rate", "+9.4%"],
      [820, "All Mystic Skill DMG Boost", "+11.4%"],
      [950, "Physical Resistance", "+7.2"],
    ])
    // No "Tier" text; the T100 Gold armor base stats (6879 HP, 25 defense) are visible instead.
    const result = parseGearOcrTsv(tsv, "Helmet\nMax HP 6879\nPhysical Defense 25", 891, 1143, "helmet")
    assert.equal(result.level, 100, "Base stats that only match Tier 100 must set the tier.")
    assert.deepEqual(
      result.additionalAffixes.map(affix => affix.key),
      ["minPhys", "agility", "precision", "allMysticDmgBoost"],
      "The six-row card: one main line, four extra lines, one attunement.",
    )
  })

  it("reads the game's wording of the boss line", () => {
    const tsv = inlineTsv([
      [300, "Critical Rate", "+10.4%"],
      [430, "Min Physical Attack", "+90.6"],
      [560, "Agility", "+57.4"],
      [690, "DMG Boost Vs. Boss Units", "+3.8%"],
      [820, "Max Bamboocut Attack", "+51.4"],
      [950, "Physical Resistance", "+7.2"],
    ])
    const result = parseGearOcrTsv(tsv, "Bracers\nTier 100", 891, 1143, "bracer")
    assert(
      result.additionalAffixes.some(affix => affix.key === "vsBossDmg"),
      JSON.stringify(result.additionalAffixes),
    )
  })

  it("matches weapon art lines with a plural or one misread letter", () => {
    const tsv = inlineTsv([
      [300, "Min Physical Attack", "+90.6"],
      [430, "Min Physical Attack", "+90.6"],
      [560, "Agility", "+57.4"],
      [690, "Art of Gauntiets DMG Boost", "+7.0%"],
      [820, "Critical Rate", "+10.4%"],
      [950, "Physical Penetration", "+12.8"],
    ])
    const result = parseGearOcrTsv(tsv, "Gauntlet\nTier 100", 891, 1143, "gauntlet")
    assert(
      result.additionalAffixes.some(affix => affix.key === "gauntletDmgBoost"),
      `Expected Art of Gauntlet, got ${JSON.stringify(result.additionalAffixes)}`,
    )
  })
})
