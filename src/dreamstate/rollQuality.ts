/**
 * DreamState fork: the in-game roll colours (green < blue < purple < gold), by how close a line is to
 * its best roll. The game does not publish where one colour ends; these cut-offs are an estimate to
 * tune against real screenshots, so they live here in one place.
 */
export type RollQuality = "gold" | "purple" | "blue" | "green"

export const rollQualityCutoffs = { gold: 0.85, purple: 0.7, blue: 0.55 } as const

export function rollQuality(fraction: number): RollQuality {
  switch (true) {
    case fraction >= rollQualityCutoffs.gold:
      return "gold"
    case fraction >= rollQualityCutoffs.purple:
      return "purple"
    case fraction >= rollQualityCutoffs.blue:
      return "blue"
    default:
      return "green"
  }
}
