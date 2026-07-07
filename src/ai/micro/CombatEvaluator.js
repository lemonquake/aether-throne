/**
 * CombatEvaluator — shared strength heuristics for the AI.
 *
 * Both the MacroBrain (assault timing, defense triggers, threat stamping) and
 * the MicroBrain (retreat decisions) need to answer "how strong is this
 * unit / army / local fight?". Centralizing the math here guarantees that
 * macro and micro agree — an AI that thinks it is winning at the macro level
 * but retreating at the micro level would look schizophrenic.
 *
 * The heuristic is intentionally simple and legible:
 *
 *   power = sqrt(dps × effectiveHp) × reachBonus
 *
 * - dps          = average damage / attack period (buildings → ~0, they still
 *                  score a small presence value through the 0.5 dps floor).
 * - effectiveHp  = CURRENT hp inflated by armor using the same WC3 armor
 *                  constant the combat system uses, so a wounded unit is
 *                  correctly worth less than a fresh one.
 * - sqrt         = keeps power roughly linear in "unit count" rather than
 *                  quadratic (5 grunts ≈ 5× one grunt, not 25×).
 * - reachBonus   = tiny premium for attack range; ranged units project force
 *                  before melee can answer.
 *
 * These are pure functions (no class) — they hold no state and allocate
 * nothing, so they are safe to call from hot micro ticks.
 */
import { GAME_CONFIG } from '../../config/GameConfig.js';

/** Minimum dps floor so zero-attack entities (buildings) still register. */
const DPS_FLOOR = 0.5;

/** Divisor converting attackRange into a small multiplicative bonus. */
const REACH_SCALE = 60;

/**
 * Estimate the combat value of a single entity (unit or building).
 * Uses CURRENT hp, so damaged entities are worth proportionally less.
 *
 * @param {import('../../entities/Entity.js').Entity} entity - Any Entity with a `type` stat block.
 * @returns {number} Power score (0 for dead/typeless entities).
 */
export function unitPower(entity) {
  if (!entity || entity.isDead || !entity.type) return 0;
  const t = entity.type;

  // Average rolled damage per swing → damage per second.
  const avgDamage = (t.damage[0] + t.damage[1]) * 0.5;
  const dps = t.attackSpeed > 0 ? avgDamage / t.attackSpeed : 0;

  // Effective hp: the armor formula reduces incoming damage by
  // (armor*k)/(1+armor*k), which is equivalent to multiplying hp by
  // (1 + armor*k). We use the shared ARMOR_FACTOR so this tracks balance.
  const k = GAME_CONFIG.COMBAT.ARMOR_FACTOR;
  const effectiveHp = Math.max(0, entity.hp) * (1 + t.armor * k);

  // Slight premium for reach — ranged units get free hits while closing.
  const reach = 1 + t.attackRange / REACH_SCALE;

  return Math.sqrt(Math.max(dps, DPS_FLOOR) * effectiveHp) * reach;
}

/**
 * Sum of unitPower over a collection. Consumes the array immediately (safe
 * to pass EntityManager's shared scratch array from getUnitsInRadius).
 *
 * @param {Array<import('../../entities/Entity.js').Entity>} units
 * @returns {number} Total power of the group.
 */
export function armyPower(units) {
  let total = 0;
  for (let i = 0; i < units.length; i++) {
    total += unitPower(units[i]);
  }
  return total;
}

/**
 * Ally-vs-enemy power ratio in the neighborhood of a unit.
 *
 * > 1 → the local fight favors the unit's side; < 1 → it is outnumbered.
 * Returns Number.POSITIVE_INFINITY when no hostiles are nearby (callers use
 * `localBalance(...) < 1` checks, so Infinity means "definitely safe").
 *
 * NOTE: `entities.getUnitsInRadius` returns a SHARED scratch array — this
 * function consumes it in a single pass and does not retain it, and callers
 * must likewise not hold results of their own spatial queries across a call
 * to this function.
 *
 * @param {object} engine - Injected engine reference (uses engine.entities).
 * @param {import('../../entities/Unit.js').Unit} unit - The unit at the center of the evaluation.
 * @param {number} [radius=14] - Neighborhood radius in world units.
 * @returns {number} Ally/enemy power ratio.
 */
export function localBalance(engine, unit, radius = 14) {
  const nearby = engine.entities.getUnitsInRadius(unit.position, radius);
  let allyPower = 0;
  let enemyPower = 0;

  for (let i = 0; i < nearby.length; i++) {
    const other = nearby[i];
    if (other.isDead || !other.player) continue; // skip corpses + neutral
    if (other.player === unit.player || other.player.isAlliedWith(unit.player)) {
      allyPower += unitPower(other);
    } else {
      enemyPower += unitPower(other);
    }
  }

  // Defensive: if the spatial query somehow excluded the unit itself, count
  // it — the ratio should never read "0 allies" while the unit stands there.
  if (allyPower <= 0) allyPower = unitPower(unit);

  if (enemyPower <= 0) return Number.POSITIVE_INFINITY;
  return allyPower / enemyPower;
}
