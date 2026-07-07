/**
 * MacroBrain — an AI player's economy & production brain (a small FSM).
 *
 * States:
 *   BOOTSTRAP     — follow the opening BuildOrders step by step.
 *   GROW_ECONOMY  — top up workers, get a barracks, keep supply ahead.
 *   BUILD_ARMY    — pump army units; watch for the assault window.
 *   EXPAND        — drop a second hall at a safe resource spot, then resume.
 *   ASSAULT       — hand the army an attack objective (weakest enemy base).
 *   DEFEND        — pull the army home when the base is threatened.
 *
 * Cross-cutting rules run every think regardless of state: a universal
 * supply-block rule (never get supply-blocked) and the EconomyPlanner worker
 * rebalance. Difficulty flavors everything through `profile` (think cadence,
 * aggression, income cheat) — the FSM itself is shared.
 *
 * All world mutations go through sanctioned APIs: player.canAfford/spend,
 * building.queueUnit, entities.spawnBuilding, and micro.setAttackObjective.
 */
import * as THREE from 'three';
import { getRaceTypeId } from '../../config/Races.js';
import { getUnitType, ARCHETYPE } from '../../config/UnitTypes.js';
import { UNIT_STATES } from '../../entities/Unit.js';
import { eventBus, EVENTS } from '../../engine/EventBus.js';
import { getProducersForUnit, getResearchSitesForUpgrade, getUpgradeRequirements } from '../../config/TechTree.js';
import { ThreatMap } from './ThreatMap.js';
import { EconomyPlanner } from './EconomyPlanner.js';
import { getOrder } from './BuildOrders.js';
import { armyPower } from '../micro/CombatEvaluator.js';
import {
  getRaceKnowledge,
  completedBuildingIds,
  typeRequirementsMet,
  upgradeRequirementsMet,
} from './AIKnowledge.js';

/** Supply headroom below which we urgently build a supply structure. */
const SUPPLY_BUFFER = 4;
/** Per-difficulty target worker count (capped by node capacity in practice). */
const WORKER_TARGET = { EASY: 8, MEDIUM: 14, INSANE: 20, NOOB: 8, CASUAL: 14, PRO: 20 };
/** Minimum army unit count before an assault is even considered. */
const MIN_ASSAULT_ARMY = 4;
/** Enemy-power floor so the very first push isn't blocked by an empty threat map. */
const ENEMY_ESTIMATE_FLOOR = 40;

function choosePersonalityCombo(knowledge, player, profile) {
  const combos = knowledge.combos;
  if (combos.length === 0) return null;
  const byName = (patterns) => combos.find((combo) => patterns.some((p) => p.test(combo.name)));
  if ((profile.siegeBias ?? 0) > 0.5) {
    return byName([/siege/i, /apex/i, /hammer/i]) ?? combos[combos.length - 1];
  }
  if ((profile.techBias ?? 0) > 0.45 || (profile.defenseBias ?? 0) > 0.5) {
    return combos[combos.length - 1];
  }
  if (profile.rush || (profile.cheapUnitBias ?? 0) > 0.45 || (profile.harassBias ?? 0) > 0.45) {
    return combos[0];
  }
  if ((profile.expandBias ?? 0) > 0.45 || (profile.creepBias ?? 0) > 0.45) {
    return combos[Math.min(1, combos.length - 1)];
  }
  return combos[player.id % combos.length];
}

export class MacroBrain {
  /**
   * @param {import('../../engine/GameEngine.js').GameEngine} engine
   * @param {import('../../engine/Player.js').Player} player
   * @param {object} profile - AI_PROFILES entry.
   */
  constructor(engine, player, profile) {
    this.engine = engine;
    this.player = player;
    this.profile = profile;

    /** @type {string} Current FSM state. */
    this.state = 'BOOTSTRAP';

    // Resolve this race's concrete type ids once.
    this.types = {
      worker: getRaceTypeId(player.race, 'worker'),
      melee: getRaceTypeId(player.race, 'melee'),
      ranged: getRaceTypeId(player.race, 'ranged'),
      hall: getRaceTypeId(player.race, 'hall'),
      barracks: getRaceTypeId(player.race, 'barracks'),
      supply: getRaceTypeId(player.race, 'supply'),
    };
    this.knowledge = getRaceKnowledge(player.race);
    this.combo = choosePersonalityCombo(this.knowledge, player, profile);

    this.threatMap = new ThreatMap(engine, player, profile);
    this.economy = new EconomyPlanner(engine, player);
    /** Remaining opening build-order steps (consumed front to back). */
    this._order = getOrder(player.race, player.difficulty);
    this._workerTarget = profile.workerTarget ?? WORKER_TARGET[player.difficulty] ?? 12;

    // Think pacing. The initial offset staggers players so their thinks don't
    // all land on the same frame (AIManager also offsets registration).
    this._accum = (player.id % 5) * 0.13;
    /** Alternates melee/ranged when pumping army. */
    this._armyToggle = 0;
    this._techCursor = 0;
    this._researchCursor = 0;
    this._nextCreepThink = 0;
    this._lastStuckReason = 'Opening build order';
    /** micro reference, injected by the AIPlayerController after construction. */
    this.micro = null;
  }

  /**
   * Accumulate time and think on the difficulty's cadence.
   * @param {number} dt
   */
  update(dt) {
    this._accum += dt;
    if (this._accum < this.profile.thinkInterval) return;
    this._accum = 0;

    // Fresh intel + worker assignment before deciding anything.
    this.threatMap.update();
    this.economy.rebalance();
    this.think();
  }

  /** One decision cycle: universal rules, then the state machine. */
  think() {
    if (this.player.isDefeated) return;

    // ── Universal: never get supply-blocked ────────────────────────────
    this._maintainSupply();

    // ── Threat awareness feeds DEFEND from any state ───────────────────
    const base = this.player.basePosition;
    const homeThreat = this.threatMap.threatNear(base, 34);
    const homePower = armyPower(this._armyUnits());
    if (homeThreat > homePower * 1.1 && homeThreat > ENEMY_ESTIMATE_FLOOR * 0.5) {
      if (this.state !== 'DEFEND') this._enter('DEFEND');
    }

    switch (this.state) {
      case 'BOOTSTRAP': this._doBootstrap(); break;
      case 'GROW_ECONOMY': this._doGrowEconomy(); break;
      case 'BUILD_ARMY': this._doBuildArmy(); break;
      case 'EXPAND': this._doExpand(); break;
      case 'ASSAULT': this._doAssault(); break;
      case 'DEFEND': this._doDefend(); break;
      default: this._enter('GROW_ECONOMY'); break;
    }
  }

  // ── States ────────────────────────────────────────────────────────────────

  /** Walk the opening build order one issuable step at a time. */
  _doBootstrap() {
    const step = this._order[0];
    if (!step) { this._enter('GROW_ECONOMY'); return; }

    // Respect a supply trigger that paces the order to the economy.
    if (step.supplyTrigger && this.player.resources.supplyUsed < step.supplyTrigger) {
      // Not time for this step yet — keep workers/economy moving meanwhile.
      this._trainWorkerIfBelow(this._workerTarget);
      return;
    }

    let issued = false;
    if (step.action === 'TRAIN') {
      issued = this._trainRole(step.role);
      // Count down the step's remaining trainees.
      if (issued) {
        step.count = (step.count ?? 1) - 1;
        if (step.count <= 0) this._order.shift();
      }
    } else if (step.action === 'BUILD') {
      issued = this._buildRole(step.role);
      if (issued) this._order.shift();
    } else if (step.action === 'EXPAND') {
      issued = this._buildExpansion();
      if (issued) this._order.shift();
    }
    // If we couldn't afford the step this think, we simply retry next think.
  }

  /** Economy phase: workers + first barracks, then graduate to army. */
  _doGrowEconomy() {
    this._trainWorkerIfBelow(this._workerTarget);
    if (this._completedBuildings(ARCHETYPE.BARRACKS).length === 0) {
      this._buildRole('barracks');
    }
    // Once we have production and a working economy, start the army.
    if (
      this._completedBuildings(ARCHETYPE.BARRACKS).length > 0 &&
      this.economy.workerCounts().total >= Math.min(6, this._workerTarget)
    ) {
      this._enter('BUILD_ARMY');
    }
  }

  /** Army phase: pump units, consider expanding, look for the assault window. */
  _doBuildArmy() {
    this._trainWorkerIfBelow(this._workerTarget);
    this._advanceTechPlan();
    this._advanceResearchPlan();
    this._trainArmy();

    // Occasionally expand if we're safe and banking hard.
    if (this._shouldExpand()) { this._enter('EXPAND'); return; }

    const army = this._armyUnits();
    if (this._tryCreepObjective(army)) return;

    // Assault when our army meaningfully outweighs the estimated enemy.
    if (army.length >= MIN_ASSAULT_ARMY) {
      const ours = armyPower(army);
      const enemyEstimate = Math.max(this._enemyEstimate(), ENEMY_ESTIMATE_FLOOR);
      // Lower multiplier for higher aggression → INSANE attacks on slim leads.
      const requiredRatio = Math.max(0.75, 1.6 - this.profile.aggression + (this.profile.attackRatioMod ?? 0));
      if (ours > enemyEstimate * requiredRatio) this._enter('ASSAULT');
    }
  }

  /** Drop one expansion hall, then fall back to army production. */
  _doExpand() {
    this._buildExpansion(); // fire-and-forget; failure just means no spot/bank
    this._enter('BUILD_ARMY');
  }

  /** Send the army at the weakest known enemy base. */
  _doAssault() {
    // Keep producing behind the push.
    this._advanceResearchPlan();
    this._trainArmy();
    const army = this._armyUnits();

    // Called off if the army is spent or no longer strong enough.
    if (army.length < Math.max(2, MIN_ASSAULT_ARMY - 2)) {
      if (this.micro) this.micro.setAttackObjective(null);
      this._enter('BUILD_ARMY');
      return;
    }

    const target = this._attackTarget();
    if (target && this.micro) {
      this.micro.setAttackObjective(target);
    } else {
      // Nothing left to attack we can see — regroup.
      if (this.micro) this.micro.setAttackObjective(null);
      this._enter('BUILD_ARMY');
    }
  }

  /** Pull the army home and keep producing until the threat passes. */
  _doDefend() {
    this._trainArmy();
    if (this.micro) this.micro.setAttackObjective(this.player.basePosition);

    const homeThreat = this.threatMap.threatNear(this.player.basePosition, 34);
    if (homeThreat <= armyPower(this._armyUnits()) * 0.8) {
      if (this.micro) this.micro.setAttackObjective(null);
      this._enter('BUILD_ARMY');
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Build a supply structure whenever headroom is dangerously low. */
  _maintainSupply() {
    const res = this.player.resources;
    const headroom = res.supplyCap - res.supplyUsed;
    if (res.supplyCap >= 100) return; // hard cap reached
    if (headroom > SUPPLY_BUFFER) return;
    if (this._incompleteBuildings(ARCHETYPE.SUPPLY).length > 0) return; // one already rising
    this._buildRole('supply');
  }

  /** Queue a worker if we're under the target and a hall can build one. */
  _trainWorkerIfBelow(target) {
    if (this.economy.workerCounts().total >= target) return false;
    return this._trainRole('worker');
  }

  /** Train from a hall (workers) or barracks (army) by role. */
  _trainRole(role) {
    if (role === 'worker') {
      return this._trainUnitType(this.types.worker);
    }
    const typeId = role === 'ranged' ? this.types.ranged : this.types.melee;
    return this._trainUnitType(typeId);
  }

  _trainUnitType(typeId) {
    const type = getUnitType(typeId);
    if (!this._requirementsMet(type)) {
      this._ensureRequirementsForType(type);
      this._noteStuck(`Waiting for ${type.name} prerequisites`);
      return false;
    }
    const producer = this._leastBusyProducerForType(typeId);
    if (!producer) {
      this._ensureProducerForType(typeId);
      this._noteStuck(`No producer for ${type.name}`);
      return false;
    }
    return producer.queueUnit(typeId);
  }

  /** Alternate melee/ranged production across available barracks. */
  _trainArmy() {
    const barracks = this._completedBuildings(ARCHETYPE.BARRACKS);
    if (barracks.length === 0) {
      // No production yet — make sure we get some.
      this._buildRole('barracks');
      return;
    }
    const chosen = this._chooseCombatUnitType();
    if (chosen && this._trainUnitType(chosen)) return;
    const role = this._armyToggle++ % 3 === 0 ? 'ranged' : 'melee';
    this._trainRole(role);
  }

  /** Place a building for a role near the base (supply/barracks/hall). */
  _buildRole(role) {
    const typeId = this.types[role];
    return this._buildSpecific(typeId);
  }

  _buildSpecific(typeId) {
    if (!typeId) return false;
    const type = getUnitType(typeId);
    if (type.class !== 'BUILDING') return false;
    if (!this._requirementsMet(type)) {
      this._ensureRequirementsForType(type);
      this._noteStuck(`Waiting for ${type.name} prerequisites`);
      return false;
    }
    if (!this.player.canAfford({ gold: type.cost.gold, aether: type.cost.aether })) {
      this._noteStuck(`Saving for ${type.name}`);
      return false;
    }

    const spot = this._findBuildSpot(this.player.basePosition, type.radius);
    if (!spot) { this._noteStuck(`No build spot for ${type.name}`); return false; }
    const builder = this._builderForSpot(spot);
    if (!builder) { this._noteStuck(`No free worker for ${type.name}`); return false; }
    if (!this.player.spend({ gold: type.cost.gold, aether: type.cost.aether })) return false;

    const building = this.engine.entities.spawnBuilding(typeId, this.player, spot, { instant: false });
    builder.orderRepair(building);
    this._noteStuck(`Building ${type.name}`);
    return true;
  }

  /** Build a hall at the nearest safe, unclaimed resource spot. */
  _buildExpansion() {
    const spot = this._bestExpansionSpot();
    if (!spot) return false;
    const type = getUnitType(this.types.hall);
    if (!this.player.canAfford({ gold: type.cost.gold, aether: type.cost.aether })) return false;
    const place = this._findBuildSpot(spot, type.radius);
    if (!place) return false;
    const builder = this._builderForSpot(place);
    if (!builder) return false;
    if (!this.player.spend({ gold: type.cost.gold, aether: type.cost.aether })) return false;
    const building = this.engine.entities.spawnBuilding(this.types.hall, this.player, place, { instant: false });
    builder.orderRepair(building);
    return true;
  }

  // ── Queries / heuristics ────────────────────────────────────────────────────

  _advanceTechPlan() {
    const candidates = [];
    if (this.combo) candidates.push(...this.combo.structures);
    candidates.push(...this.knowledge.techPlan);

    for (let step = 0; step < candidates.length; step++) {
      const index = (this._techCursor + step) % candidates.length;
      const typeId = candidates[index];
      const type = getUnitType(typeId);
      if (type.race !== this.player.race || type.class !== 'BUILDING') continue;
      if (this._hasCompletedType(typeId) || this._hasIncompleteType(typeId)) continue;
      if (type.archetype === ARCHETYPE.SUPPLY && this.player.resources.supplyCap - this.player.resources.supplyUsed > 12) continue;
      if (!this._requirementsMet(type)) {
        this._ensureRequirementsForType(type);
        continue;
      }
      if (!this.player.canAfford({ gold: type.cost.gold, aether: type.cost.aether })) continue;
      if (this._buildSpecific(typeId)) {
        this._techCursor = index + 1;
        return true;
      }
    }
    return false;
  }

  _advanceResearchPlan() {
    const candidates = [];
    if (this.combo) candidates.push(...this.combo.research);
    candidates.push(...this.knowledge.genericResearch);
    candidates.push(...this.knowledge.allUpgradeIds);

    for (let step = 0; step < candidates.length; step++) {
      const index = (this._researchCursor + step) % candidates.length;
      const upgradeId = candidates[index];
      if (this.player.hasUpgrade(upgradeId) || this._isResearchQueued(upgradeId)) continue;
      const site = this._leastBusyResearchSite(upgradeId);
      if (!site) {
        this._ensureResearchSite(upgradeId);
        continue;
      }
      if (site.productionQueue.length >= 2) continue;
      if (!upgradeRequirementsMet(upgradeId, this.player, this._completedBuildingIds())) {
        this._ensureUpgradeRequirements(upgradeId);
        continue;
      }
      if (site.queueResearch(upgradeId)) {
        this._researchCursor = index + 1;
        return true;
      }
    }
    return false;
  }

  _isResearchQueued(upgradeId) {
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.player !== this.player) continue;
      if (b.productionQueue.some((q) => q.isUpgrade && q.upgradeId === upgradeId)) return true;
    }
    return false;
  }

  /** Living army units (melee + ranged) owned by this player. */
  _armyUnits() {
    const out = [];
    const units = this.engine.entities.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.player !== this.player) continue;
      if (u.type.archetype === ARCHETYPE.MELEE || u.type.archetype === ARCHETYPE.RANGED) out.push(u);
    }
    return out;
  }

  /** Completed (built) buildings of an archetype owned by this player. */
  _completedBuildings(archetype) {
    const out = [];
    const list = this.engine.entities.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.isDead || b.player !== this.player) continue;
      if (b.type.archetype === archetype && !b.isUnderConstruction) out.push(b);
    }
    return out;
  }

  /** In-progress (scaffold) buildings of an archetype owned by this player. */
  _incompleteBuildings(archetype) {
    const out = [];
    const list = this.engine.entities.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.isDead || b.player !== this.player) continue;
      if (b.type.archetype === archetype && b.isUnderConstruction) out.push(b);
    }
    return out;
  }

  /** Barracks with the shortest production queue (spreads training out). */
  _leastBusyBarracks() {
    const list = this._completedBuildings(ARCHETYPE.BARRACKS);
    let best = null;
    let bestLen = Infinity;
    for (const b of list) {
      if (b.productionQueue.length < bestLen) { bestLen = b.productionQueue.length; best = b; }
    }
    return best;
  }

  _leastBusyHall() {
    const list = this._completedBuildings(ARCHETYPE.HALL);
    let best = null;
    let bestLen = Infinity;
    for (const b of list) {
      if (b.productionQueue.length < bestLen) { bestLen = b.productionQueue.length; best = b; }
    }
    return best;
  }

  _leastBusyProductionBuilding() {
    const barracks = this._completedBuildings(ARCHETYPE.BARRACKS);
    if (barracks.length > 0) {
      let best = null;
      let bestLen = Infinity;
      for (const b of barracks) {
        if (b.productionQueue.length < bestLen) { bestLen = b.productionQueue.length; best = b; }
      }
      return best;
    }
    return this._leastBusyHall();
  }

  _leastBusyProducerForType(typeId) {
    const producerIds = new Set(getProducersForUnit(typeId));
    let best = null;
    let bestLen = Infinity;
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.isUnderConstruction || b.player !== this.player) continue;
      if (!producerIds.has(b.type.id)) continue;
      if (b.productionQueue.length < bestLen) {
        bestLen = b.productionQueue.length;
        best = b;
      }
    }
    return best;
  }

  _leastBusyResearchSite(upgradeId) {
    const siteIds = new Set(getResearchSitesForUpgrade(upgradeId));
    let best = null;
    let bestLen = Infinity;
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.isUnderConstruction || b.player !== this.player) continue;
      if (!siteIds.has(b.type.id)) continue;
      if (b.productionQueue.length < bestLen) {
        bestLen = b.productionQueue.length;
        best = b;
      }
    }
    return best;
  }

  _ensureProducerForType(typeId) {
    const producers = getProducersForUnit(typeId)
      .map((id) => getUnitType(id))
      .filter((type) => type.race === this.player.race && type.class === 'BUILDING');
    for (const producer of producers) {
      if (this._hasCompletedType(producer.id) || this._hasIncompleteType(producer.id)) return false;
      if (!this._requirementsMet(producer)) {
        this._ensureRequirementsForType(producer);
        continue;
      }
      return this._buildSpecific(producer.id);
    }
    return false;
  }

  _ensureResearchSite(upgradeId) {
    const sites = getResearchSitesForUpgrade(upgradeId)
      .map((id) => getUnitType(id))
      .filter((type) => type.race === this.player.race && type.class === 'BUILDING');
    for (const site of sites) {
      if (this._hasCompletedType(site.id) || this._hasIncompleteType(site.id)) return false;
      if (!this._requirementsMet(site)) {
        this._ensureRequirementsForType(site);
        continue;
      }
      return this._buildSpecific(site.id);
    }
    return false;
  }

  _ensureRequirementsForType(type) {
    for (const reqId of type.requires ?? []) {
      const pseudo = { requires: [reqId] };
      if (typeRequirementsMet(pseudo, this._completedBuildingIds())) continue;
      const reqType = getUnitType(reqId);
      if (reqType.class === 'BUILDING') {
        if (this._hasIncompleteType(reqId)) return false;
        return this._buildSpecific(reqId);
      }
    }
    return false;
  }

  _ensureUpgradeRequirements(upgradeId) {
    const completed = this._completedBuildingIds();
    if (upgradeRequirementsMet(upgradeId, this.player, completed)) return true;

    const reqs = getUpgradeRequirements(upgradeId);
    for (const req of reqs) {
      if (req.type !== 'building') continue;
      if (typeRequirementsMet({ requires: [req.id] }, completed)) continue;
      return this._buildSpecific(req.id);
    }

    const candidates = this.knowledge.techPlan;
    for (let i = 0; i < candidates.length; i++) {
      const typeId = candidates[(this._techCursor + i) % candidates.length];
      const type = getUnitType(typeId);
      if (type.race !== this.player.race || type.class !== 'BUILDING') continue;
      if (this._hasCompletedType(typeId) || this._hasIncompleteType(typeId)) continue;
      if (!this._requirementsMet(type)) continue;
      if (this._buildSpecific(typeId)) return true;
    }
    return false;
  }

  _completedBuildingIds() {
    return completedBuildingIds(this.engine, this.player);
  }

  _requirementsMet(type) {
    return typeRequirementsMet(type, this._completedBuildingIds());
  }

  _hasCompletedType(typeId) {
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.player !== this.player || b.isUnderConstruction) continue;
      if (b.type.id === typeId) return true;
    }
    return false;
  }

  _hasIncompleteType(typeId) {
    const buildings = this.engine.entities.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || b.player !== this.player || !b.isUnderConstruction) continue;
      if (b.type.id === typeId) return true;
    }
    return false;
  }

  _chooseCombatUnitType() {
    const completedIds = this._completedBuildingIds();
    const desired = [];
    if (this.combo) desired.push(...this.combo.units);
    desired.push(...this.knowledge.combatUnits.map((type) => type.id));

    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < desired.length; i++) {
      const typeId = desired[(i + this._armyToggle) % desired.length];
      const type = getUnitType(typeId);
      if (type.race !== this.player.race) continue;
      if (type.archetype !== ARCHETYPE.MELEE && type.archetype !== ARCHETYPE.RANGED) continue;
      if (!typeRequirementsMet(type, completedIds)) {
        this._ensureRequirementsForType(type);
        continue;
      }
      if (!this._leastBusyProducerForType(typeId)) {
        this._ensureProducerForType(typeId);
        continue;
      }
      const cost = { gold: type.cost.gold, aether: type.cost.aether, supply: type.cost.supply };
      if (!this.player.canAfford(cost)) continue;
      const supplyWeight = type.cost.supply <= 2 ? 0.35 : 0;
      const techWeight = (type.requires?.length ?? 0) * 0.25;
      const comboWeight = this.combo?.units.includes(typeId) ? 1.5 : 0;
      const score = comboWeight + techWeight + supplyWeight + (type.hp ?? 0) / 1200 + ((type.damage?.[1] ?? 0) / Math.max(0.6, type.attackSpeed || 1)) / 30;
      if (score > bestScore) {
        bestScore = score;
        best = typeId;
      }
    }

    this._armyToggle++;
    return best;
  }

  /** Estimated enemy strength from the threat map (hottest observed cell). */
  _enemyEstimate() {
    const hot = this.threatMap.hottestCell();
    return hot ? hot.threat : 0;
  }

  _tryCreepObjective(army) {
    const bias = this.profile.creepBias ?? 0;
    if (!this.micro || bias <= 0 || army.length < 3) return false;
    const now = this.engine.gameTime ?? 0;
    if (now < this._nextCreepThink) return false;
    this._nextCreepThink = now + Math.max(7, 18 - bias * 8);
    if (this.threatMap.threatNear(this.player.basePosition, 40) > ENEMY_ESTIMATE_FLOOR * 0.35) return false;
    if (armyPower(army) < 90 + bias * 30) return false;
    const target = this._bestNeutralCampTarget();
    if (!target) return false;
    this.micro.setAttackObjective(target);
    return true;
  }

  _bestNeutralCampTarget() {
    const units = this.engine.entities.units;
    const base = this.player.basePosition;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || !u.player?.isNeutralHostile) continue;
      const dx = u.position.x - base.x;
      const dz = u.position.z - base.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > 170 * 170) continue;
      const score = dSq + (u.hp ?? 0) * 2.5;
      if (score < bestScore) { bestScore = score; best = u; }
    }
    return best ? best.position : null;
  }

  _attackTarget() {
    if ((this.profile.resourceHarassBias ?? 0) > 0.45) {
      const worker = this._enemyWorkerTarget();
      if (worker) return worker.position;
    }
    if ((this.profile.siegeBias ?? 0) > 0.5) {
      const production = this._enemyProductionTarget();
      if (production) return production.position;
    }
    return this._weakestEnemyBase();
  }

  _enemyWorkerTarget() {
    const units = this.engine.entities.units;
    const base = this.player.basePosition;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || !u.player || u.player === this.player || this.player.isAlliedWith(u.player)) continue;
      if (u.type.archetype !== ARCHETYPE.WORKER) continue;
      const nearResource = !!u.gatherNode || !!u.carrying;
      const dx = u.position.x - base.x;
      const dz = u.position.z - base.z;
      const dSq = dx * dx + dz * dz + (nearResource ? -2500 : 0);
      if (dSq < bestSq) { bestSq = dSq; best = u; }
    }
    return best;
  }

  _enemyProductionTarget() {
    const buildings = this.engine.entities.buildings;
    const base = this.player.basePosition;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || !b.player || b.player === this.player || this.player.isAlliedWith(b.player)) continue;
      if (b.type.archetype !== ARCHETYPE.BARRACKS && b.type.archetype !== ARCHETYPE.HALL) continue;
      const dx = b.position.x - base.x;
      const dz = b.position.z - base.z;
      const dSq = dx * dx + dz * dz + (b.type.archetype === ARCHETYPE.HALL ? 2500 : 0);
      if (dSq < bestSq) { bestSq = dSq; best = b; }
    }
    return best;
  }

  /** Nearest hostile enemy building (its base) we can path toward. */
  _weakestEnemyBase() {
    const buildings = this.engine.entities.buildings;
    const base = this.player.basePosition;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.isDead || !b.player) continue;
      if (b.player === this.player || this.player.isAlliedWith(b.player)) continue;
      const dx = b.position.x - base.x;
      const dz = b.position.z - base.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) { bestSq = dSq; best = b; }
    }
    return best ? best.position : null;
  }

  /** Expand only when safe (quiet map) and banking a comfortable surplus. */
  _shouldExpand() {
    if (this.player.resources.gold < 700) return false;
    // Don't expand while anything threatens home.
    if (this.threatMap.threatNear(this.player.basePosition, 40) > ENEMY_ESTIMATE_FLOOR * 0.4) return false;
    // Only if we don't already have a second hall going up or standing.
    const halls = this._completedBuildings(ARCHETYPE.HALL).length +
      this._incompleteBuildings(ARCHETYPE.HALL).length;
    const maxHalls = 2 + Math.round(Math.max(0, this.profile.expandBias ?? 0));
    return halls < maxHalls && this.profile.aggression < 0.88;
  }

  /** Nearest neutral/unclaimed resource spot with low threat. */
  _bestExpansionSpot() {
    const nodes = this.engine.entities.resources;
    const base = this.player.basePosition;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.isDead || n.amount <= 0) continue;
      // Skip nodes right next to our own base (already mined).
      const dx = n.position.x - base.x;
      const dz = n.position.z - base.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 30 * 30) continue;
      if (this.threatMap.threatNear(n.position, 22) > ENEMY_ESTIMATE_FLOOR * 0.4) continue;
      if (dSq < bestSq) { bestSq = dSq; best = n; }
    }
    return best ? best.position : null;
  }

  /**
   * Spiral-search outward from a center for a clear building spot.
   * @param {THREE.Vector3} center
   * @param {number} footprint - Building footprint radius.
   * @returns {THREE.Vector3|null}
   */
  _findBuildSpot(center, footprint) {
    const bounds = this.engine.nexus.getBounds();
    const clear = footprint + 2.5;
    const step = 3.5;
    for (let ring = 1; ring <= 9; ring++) {
      const radius = ring * step + footprint + 3;
      const points = 6 * ring;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2 + ring * 0.4;
        const x = center.x + Math.cos(a) * radius;
        const z = center.z + Math.sin(a) * radius;
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        if (this._spotClear(x, z, clear)) return new THREE.Vector3(x, 0, z);
      }
    }
    return null;
  }

  /** True if no building or resource node sits within `clear` of (x, z). */
  _spotClear(x, z, clear) {
    const clearSq = clear * clear;
    const b = this.engine.entities.buildings;
    for (let i = 0; i < b.length; i++) {
      const dx = b[i].position.x - x;
      const dz = b[i].position.z - z;
      if (dx * dx + dz * dz < clearSq) return false;
    }
    const r = this.engine.entities.resources;
    for (let i = 0; i < r.length; i++) {
      const dx = r[i].position.x - x;
      const dz = r[i].position.z - z;
      if (dx * dx + dz * dz < clearSq) return false;
    }
    return true;
  }

  _builderForSpot(spot) {
    const units = this.engine.entities.units;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.player !== this.player || u.type.archetype !== ARCHETYPE.WORKER) continue;
      if (u.state === UNIT_STATES.REPAIR_MOVING || u.state === UNIT_STATES.REPAIRING) continue;
      if (u.carrying) continue;
      const dx = u.position.x - spot.x;
      const dz = u.position.z - spot.z;
      const busyPenalty = u.state === UNIT_STATES.IDLE ? 0 : 500;
      const score = dx * dx + dz * dz + busyPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  /**
   * Transition to a new state, emitting AI_STATE_CHANGED for debug overlays.
   * @param {string} next
   */
  _enter(next) {
    if (this.state === next) return;
    const from = this.state;
    this.state = next;
    eventBus.emit(EVENTS.AI_STATE_CHANGED, { playerId: this.player.id, from, to: next });
  }

  _noteStuck(reason) {
    this._lastStuckReason = reason;
  }

  getDiagnostics() {
    const workers = this.economy.workerCounts();
    const army = this._armyUnits();
    const incomplete = this.engine.entities.buildings
      .filter((b) => b.player === this.player && !b.isDead && b.isUnderConstruction)
      .map((b) => b.type.name);
    const activeResearch = [];
    for (const b of this.engine.entities.buildings) {
      if (b.player !== this.player || b.isDead) continue;
      for (const q of b.productionQueue) {
        if (q.isUpgrade) activeResearch.push(q.upgradeId);
      }
    }
    const techTargetId = this.knowledge.techPlan[this._techCursor % Math.max(1, this.knowledge.techPlan.length)];
    const researchList = [...(this.combo?.research ?? []), ...this.knowledge.genericResearch];
    const researchTargetId = researchList[this._researchCursor % Math.max(1, researchList.length)];
    return {
      playerId: this.player.id,
      name: this.player.name,
      state: this.state,
      workers,
      armyCount: army.length,
      armyPower: Math.round(armyPower(army)),
      combo: this.combo?.name ?? 'Generic',
      personality: this.profile.personality,
      techTarget: techTargetId ? getUnitType(techTargetId).name : null,
      researchTarget: researchTargetId ?? null,
      activeBuild: incomplete[0] ?? null,
      activeResearch: activeResearch[0] ?? null,
      stuckReason: this._lastStuckReason,
      objective: this.micro?.getObjective?.() ?? null,
    };
  }

  dispose() {
    this.threatMap.dispose();
    this.economy.dispose();
    this._order.length = 0;
    this.engine = null;
    this.player = null;
    this.micro = null;
    this.knowledge = null;
    this.combo = null;
  }
}
