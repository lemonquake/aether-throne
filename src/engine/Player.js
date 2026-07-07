/**
 * Player — per-player economy, allegiance, and defeat state.
 *
 * One Player is created per entry in MatchConfig.players (both humans and AI).
 * It owns nothing on the battlefield directly; entities reference their owning
 * Player, and systems query it for affordability, alliances, and resources.
 *
 * Every resource/supply mutation emits EVENTS.RESOURCES_CHANGED so the HUD
 * (for the local player) and any AI listeners stay in sync without polling.
 *
 * Supply model (WC3-style, kept consistent across the codebase):
 *   - `supplyUsed` is authoritative = the summed supply cost of this player's
 *     living units. EntityManager.spawnUnit adds it; Unit.die subtracts it.
 *   - `supplyCap` is granted by halls/supply buildings (their `providesSupply`)
 *     and clamped to GAME_CONFIG.ECONOMY.SUPPLY_CAP_MAX.
 *   - `spend()` deducts gold/aether only — supply is *occupied* by living units,
 *     not spent — while `canAfford()` additionally checks supply headroom.
 */
import * as THREE from 'three';
import { GAME_CONFIG, TEAMS, resolveAIProfile, AI_PERSONALITIES, normalizeAILevel } from '../config/GameConfig.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

/** Clamp helper (local to avoid importing MathUtils for two call sites). */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class Player {
  /**
   * @param {object} config - One frozen entry from MatchConfig.players:
   *   { id, name, type, race, team, difficulty, color, isLocal }.
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    /** @type {'HUMAN'|'AI'} */
    this.type = config.type;
    this.race = config.race;
    this.team = config.team;
    this.startLocationId = Number.isInteger(config.startLocationId) ? config.startLocationId : config.id;
    /** @type {string|null} */
    this.difficulty = config.difficulty ? normalizeAILevel(config.difficulty) : null;
    this.personality = config.personality ?? AI_PERSONALITIES.BALANCED;
    this.aiProfile = this.type === 'AI'
      ? resolveAIProfile(this.difficulty, this.personality)
      : null;
    this.isLocal = !!config.isLocal;
    this.isNeutralHostile = !!config.isNeutralHostile;

    /** @type {THREE.Color} Player color (unit tints, selection rings). */
    this.color = new THREE.Color(config.color);
    /** @type {string} '#rrggbb' — cache key for shared materials / HUD swatches. */
    this.colorHex = config.color;

    /**
     * Income multiplier applied to every worker deposit. Humans always 1.0;
     * AI players inherit their difficulty profile's cheat/handicap (EASY 0.75,
     * MEDIUM 1.0, INSANE 1.5) — this is where the resource cheat lives.
     */
    this.incomeMultiplier =
      this.type === 'AI' ? (this.aiProfile?.incomeMultiplier ?? 1.0) : 1.0;

    /** Live economy — mirrored into the HUD store for the local player. */
    this.resources = {
      gold: GAME_CONFIG.ECONOMY.STARTING_GOLD,
      aether: GAME_CONFIG.ECONOMY.STARTING_AETHER,
      supplyUsed: 0,
      supplyCap: 0, // granted by the starting hall at spawn
    };

    /** @type {THREE.Vector3} Set by the engine from the terrain start location. */
    this.basePosition = new THREE.Vector3();

    /** True once the player has no units and no buildings. */
    this.isDefeated = false;

    /** @type {Set<string>} Track researched upgrade ids. */
    this.researchedUpgrades = new Set();
  }

  /**
   * Are two players on the same side? Self always counts as an ally; FFA
   * players ally with no one but themselves.
   * @param {Player|null} other
   * @returns {boolean}
   */
  isAlliedWith(other) {
    if (!other) return false;
    if (other === this) return true;
    if (this.isNeutralHostile || other.isNeutralHostile) return false;
    if (this.team === TEAMS.FFA) return false;
    return this.team === other.team;
  }

  /**
   * Can this player afford a cost right now (including supply headroom)?
   * @param {{gold?:number, aether?:number, supply?:number}} cost
   * @returns {boolean}
   */
  canAfford(cost) {
    const gold = cost.gold ?? 0;
    const aether = cost.aether ?? 0;
    const supply = cost.supply ?? 0;
    // Only gate on supply headroom when the purchase actually costs supply.
    // A zero-supply purchase (buildings, upgrades) must remain affordable even
    // while over cap — otherwise a supply-blocked player could never build the
    // very supply structure that would unblock them (a hard deadlock).
    const supplyOk = supply <= 0 || this.resources.supplyUsed + supply <= this.resources.supplyCap;
    return gold <= this.resources.gold && aether <= this.resources.aether && supplyOk;
  }

  /**
   * Which resource (if any) blocks a purchase — the first unmet requirement,
   * checked gold → aether → supply, mirroring canAfford's rules exactly
   * (a zero-supply cost never trips the SUPPLY check). Non-mutating; used to
   * drive the spoken/visual "Not enough X" feedback (PHASE5_PROMPT.md §3.3).
   * @param {{gold?:number, aether?:number, supply?:number}} cost
   * @returns {'GOLD'|'AETHER'|'SUPPLY'|null} null when affordable.
   */
  affordShortfall(cost) {
    const gold = cost.gold ?? 0;
    const aether = cost.aether ?? 0;
    const supply = cost.supply ?? 0;
    if (gold > this.resources.gold) return 'GOLD';
    if (aether > this.resources.aether) return 'AETHER';
    if (supply > 0 && this.resources.supplyUsed + supply > this.resources.supplyCap) return 'SUPPLY';
    return null;
  }

  /**
   * Deduct gold/aether for a purchase. Supply is NOT deducted here (it is
   * occupied by living units, tracked via addSupplyUsed). No-op + false when
   * unaffordable.
   * @param {{gold?:number, aether?:number, supply?:number}} cost
   * @returns {boolean} true if the spend succeeded.
   */
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.resources.gold -= cost.gold ?? 0;
    this.resources.aether -= cost.aether ?? 0;
    this._emitChange();
    return true;
  }

  /**
   * Credit gathered resources. The player's income multiplier (AI cheat /
   * handicap) is applied here, so callers just hand over the raw carried
   * amount — the economy asymmetry stays centralized.
   * @param {{gold?:number, aether?:number}} payload
   * @param {number} [multiplier=1] - Extra situational multiplier (rare).
   */
  deposit(payload, multiplier = 1) {
    const m = this.incomeMultiplier * multiplier;
    if (payload.gold) this.resources.gold += Math.round(payload.gold * m);
    if (payload.aether) this.resources.aether += Math.round(payload.aether * m);
    this._emitChange();
  }

  grantBounty(payload) {
    if (payload.gold) this.resources.gold += Math.round(payload.gold);
    if (payload.aether) this.resources.aether += Math.round(payload.aether);
    this._emitChange();
  }

  /**
   * Adjust the supply cap (buildings grant it; destruction removes it).
   * @param {number} n - Signed delta.
   */
  addSupplyCap(n) {
    this.resources.supplyCap = clamp(
      this.resources.supplyCap + n,
      0,
      GAME_CONFIG.ECONOMY.SUPPLY_CAP_MAX
    );
    this._emitChange();
  }

  /**
   * Adjust used supply (unit spawned = +cost.supply; unit died = −cost.supply).
   * @param {number} n - Signed delta.
   */
  addSupplyUsed(n) {
    // Never clamp below 0; cap at the hard maximum as a safety rail.
    this.resources.supplyUsed = clamp(
      this.resources.supplyUsed + n,
      0,
      GAME_CONFIG.ECONOMY.SUPPLY_CAP_MAX
    );
    this._emitChange();
  }

  /**
   * Check if the player has researched a specific upgrade.
   * @param {string} upgradeId
   * @returns {boolean}
   */
  hasUpgrade(upgradeId) {
    return this.researchedUpgrades.has(upgradeId);
  }

  /**
   * Add an upgrade to the researched list and trigger a state sync.
   * @param {string} upgradeId
   */
  researchUpgrade(upgradeId) {
    this.researchedUpgrades.add(upgradeId);
    this._emitChange();
  }

  /** @private Emit the change event that drives HUD/AI economy sync. */
  _emitChange() {
    eventBus.emit(EVENTS.RESOURCES_CHANGED, { player: this });
  }
}
