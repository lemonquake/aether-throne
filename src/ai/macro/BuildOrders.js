/**
 * BuildOrders — data-only opening build orders per race × difficulty.
 *
 * A build order is an ordered list of Steps the MacroBrain walks through at the
 * start of a match before it switches to reactive rules. Steps reference
 * abstract ROLES ('worker'|'melee'|'ranged'|'hall'|'barracks'|'supply'), not
 * concrete unit ids, so the same order works for any race (the MacroBrain
 * resolves roles via getRaceTypeId).
 *
 * Step shape:
 *   {
 *     action: 'TRAIN' | 'BUILD' | 'EXPAND',
 *     role:   role string (for TRAIN/BUILD),
 *     count:  how many (TRAIN only; default 1),
 *     supplyTrigger: optional — don't start this step until the player's used
 *                    supply reaches this value (paces the order to the economy).
 *   }
 *
 * Difficulty shapes the whole curve:
 *   EASY   — worker-light, slow, minimal army (a passive practice opponent).
 *   MEDIUM — a clean standard macro opening.
 *   INSANE — a tight, army-heavy order tuned around its income cheat.
 */
import { AI_LEVELS, normalizeAILevel } from '../../config/GameConfig.js';

/** @type {Record<string, Array<object>>} */
const ORDERS = {
  [AI_LEVELS.NOOB]: [
    { action: 'TRAIN', role: 'worker', count: 3 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 7 },
    { action: 'BUILD', role: 'barracks' },
    { action: 'TRAIN', role: 'melee', count: 2 },
    { action: 'TRAIN', role: 'worker', count: 2 },
  ],

  [AI_LEVELS.CASUAL]: [
    { action: 'TRAIN', role: 'worker', count: 4 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 9 },
    { action: 'BUILD', role: 'barracks' },
    { action: 'TRAIN', role: 'worker', count: 2 },
    { action: 'TRAIN', role: 'melee', count: 2 },
    { action: 'TRAIN', role: 'ranged', count: 2 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 18 },
    { action: 'TRAIN', role: 'melee', count: 2 },
  ],

  [AI_LEVELS.PRO]: [
    { action: 'TRAIN', role: 'worker', count: 5 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 9 },
    { action: 'BUILD', role: 'barracks' },
    { action: 'TRAIN', role: 'melee', count: 2 },
    { action: 'BUILD', role: 'barracks' }, // double production early (cheat economy)
    { action: 'TRAIN', role: 'ranged', count: 3 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 16 },
    { action: 'TRAIN', role: 'melee', count: 3 },
    { action: 'TRAIN', role: 'ranged', count: 3 },
    { action: 'BUILD', role: 'supply', supplyTrigger: 30 },
  ],
};

/**
 * Get a COPY of the opening build order for a race/difficulty. The MacroBrain
 * mutates its own progress cursor, so it gets fresh step objects (the order
 * data itself stays immutable). Race is currently only used to future-proof
 * race-specific openings; the roles are race-agnostic today.
 * @param {string} raceId
 * @param {string} difficulty
 * @returns {Array<object>}
 */
export function getOrder(raceId, difficulty) {
  const key = normalizeAILevel(difficulty);
  const src = ORDERS[key] ?? ORDERS[AI_LEVELS.CASUAL];
  // TODO(phase-5): race-flavored openings (e.g. Void Stalkers rush, Core turtle).
  return src.map((step) => ({ ...step }));
}
