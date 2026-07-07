import { RACES } from '../../config/Races.js';
import { UNIT_TYPES, ARCHETYPE, ENTITY_CLASS, DAMAGE_TABLE } from '../../config/UnitTypes.js';
import { UPGRADES } from '../../config/Upgrades.js';
import {
  getAllBuildMenuTypeIds,
  getUpgradeRequirements,
  satisfiesRequirement,
} from '../../config/TechTree.js';

const RACE_COMBOS = {
  BIO_HUMAN: [
    {
      name: 'Shielded Arbalest Line',
      units: ['BH_TEMPLAR', 'BH_DEFENDER', 'BH_ARBALIST', 'BH_RIFLEMAN', 'BH_PRIEST'],
      structures: ['BH_BASTION', 'BH_ARCHERY_RANGE', 'BH_BLACKSMITH', 'BH_GARRISON', 'BH_SHRINE'],
      research: ['BH_MELEE_ARM_1', 'BH_RANGED_ARM_1', 'BH_ARBALIST_RANGE', 'BH_PRIEST_BUFF'],
    },
    {
      name: 'Cavalry Hammer',
      units: ['BH_KNIGHT', 'BH_LANCER', 'BH_PALADIN', 'BH_INQUISITOR', 'BH_GRYPHON'],
      structures: ['BH_BASTION', 'BH_BLACKSMITH', 'BH_STABLES', 'BH_CATHEDRAL', 'BH_GRYPHON_AVIARY'],
      research: ['BH_KNIGHT_SPEED', 'BH_KNIGHT_SHIELD', 'BH_PALADIN_RET', 'BH_GRYPHON_HASTE'],
    },
    {
      name: 'Siege Academy',
      units: ['BH_CHAMPION', 'BH_ARCHMAGE', 'BH_CATAPULT', 'BH_SENTINEL', 'BH_AETHER_CRUSADER'],
      structures: ['BH_BASTION', 'BH_BLACKSMITH', 'BH_ACADEMY', 'BH_ARSENAL', 'BH_KEEP', 'BH_CASTLE'],
      research: ['BH_MELEE_ATK_1', 'BH_RANGED_ATK_1', 'BH_CATAPULT_PAYLOAD', 'BH_ARCHMAGE_WIS'],
    },
  ],
  ARTIFICE_HORDE: [
    {
      name: 'Ripper Weaver Rush',
      units: ['AH_RIPPER', 'AH_GEARGUARD', 'AH_WEAVER', 'AH_THUNDERER', 'AH_MECHANIZED_SCOUT'],
      structures: ['AH_DEN', 'AH_WORKSHOP', 'AH_FOUNDRY', 'AH_MUNITIONS_DEPOT'],
      research: ['AH_MELEE_ATK_1', 'AH_RANGED_ATK_1', 'AH_THUNDER_RANGE', 'AH_SCOUT_SIGHT'],
    },
    {
      name: 'Automaton Foundry',
      units: ['AH_AUTOMATON', 'AH_CLOCKWORK_SOLDIER', 'AH_STEEL_CHARGER', 'AH_FORGE_SENTINEL', 'AH_BOMBARD'],
      structures: ['AH_DEN', 'AH_ASSEMBLY_LINE', 'AH_BRASS_FORGE', 'AH_FOUNDRY', 'AH_MUNITIONS_DEPOT'],
      research: ['AH_AUTOMATON_DMG', 'AH_CLOCKWORK_BATTERY', 'AH_STEEL_SPIKE', 'AH_BOMBARD_RADIUS'],
    },
    {
      name: 'Chrono Reactor',
      units: ['AH_CHRONO_WEAVER', 'AH_NULLIFIER', 'AH_OVERCHARGED_CORE', 'AH_COLOSSUS', 'AH_BRASS_AVIATOR'],
      structures: ['AH_DEN', 'AH_ASSEMBLY_LINE', 'AH_CLOCKWORK_SPIRE', 'AH_CHRONO_LAB', 'AH_REACTOR', 'AH_HANGAR'],
      research: ['AH_CHRONO_HASTE', 'AH_NULL_SHIELD', 'AH_OVERCHARGED_REACTOR', 'AH_COLOSSUS_BEAM'],
    },
  ],
  TERRA_BORN: [
    {
      name: 'Basalt Bulwark',
      units: ['TB_BRUTE', 'TB_STONE_CRUSHER', 'TB_GRANITE_SHIELD', 'TB_SHARDCASTER', 'TB_GRAVEL_HURLER'],
      structures: ['TB_FORGE', 'TB_EARTH_SPIRE', 'TB_SEISMIC_PILLAR', 'TB_MUD_POOL'],
      research: ['TB_MELEE_ARM_1', 'TB_RANGED_ARM_1', 'TB_GRANITE_WALL', 'TB_GRAVEL_RANGE'],
    },
    {
      name: 'Seismic Siege',
      units: ['TB_TREMOR_BEAST', 'TB_EARTHSHAKER', 'TB_BOULDER_HURLER', 'TB_MOUNTAIN_GIANT', 'TB_STALAGMITE_SENTINEL'],
      structures: ['TB_FORGE', 'TB_EARTH_SPIRE', 'TB_QUAKE_ENGINE', 'TB_SEISMIC_PILLAR', 'TB_MOUNTAIN_VAULT'],
      research: ['TB_TREMOR_STOMP', 'TB_EARTH_HP', 'TB_BOULDER_DMG', 'TB_GIANT_THROW'],
    },
    {
      name: 'Magma Core',
      units: ['TB_OBSIDIAN_SHARD', 'TB_LAVA_SPITTER', 'TB_MAGMA_LORD', 'TB_CORE_GUARDIAN', 'TB_AETHER_GOLEM'],
      structures: ['TB_FORGE', 'TB_MAGMA_CHAMBER', 'TB_LAVA_FORGE', 'TB_CORE_REACTOR', 'TB_AETHER_SPIRE'],
      research: ['TB_OBSIDIAN_SHARP', 'TB_LAVA_FIRE', 'TB_MAGMA_BURST', 'TB_GOLEM_CAPACITY'],
    },
  ],
  CHAOS_DEEP: [
    {
      name: 'Rift Swarm',
      units: ['CD_RIFTFIEND', 'CD_PLATEDMAULER', 'CD_BILEVESSEL', 'CD_NEEDLESTRIDER', 'CD_BILECASTER'],
      structures: ['CD_GESTATIONPIT', 'CD_MAULERWARREN', 'CD_BURSTERNEST', 'CD_GROWTHCITADEL', 'CD_STRIDERDEN'],
      research: ['CD_MELEE_ATK_1', 'CD_RANGED_ATK_1', 'CD_CARAPACE_HARD', 'CD_STRIDER_RANGE'],
    },
    {
      name: 'Plague Brood',
      units: ['CD_PARASITICWEAVER', 'CD_BROODCARRIER', 'CD_GRIPFIEND', 'CD_MIASMAWEAVER', 'CD_MATRIARCH'],
      structures: ['CD_GESTATIONPIT', 'CD_GROWTHCITADEL', 'CD_PLAGUEPOOL', 'CD_BROODTHRONE', 'CD_PLAGUECHAMBER', 'CD_MATRIARCHNEST'],
      research: ['CD_WEAVER_GLANDS', 'CD_FIEND_ENERGY', 'CD_MATRIARCH_VIGOR', 'CD_REGEN_AURA'],
    },
    {
      name: 'Apex Chasm',
      units: ['CD_SPOREMANTA', 'CD_SPORELASHER', 'CD_SWARMMONARCH', 'CD_SWARMSENTINEL', 'CD_APEXTYRANT', 'CD_CHASMWORM'],
      structures: ['CD_GESTATIONPIT', 'CD_GROWTHCITADEL', 'CD_GLIDERMOUND', 'CD_MONARCHMOUND', 'CD_PLAGUEPOOL', 'CD_MUTAGENICSANCTUM', 'CD_RIFTNETWORK'],
      research: ['CD_MANTA_SPEED', 'CD_LASHER_SPIT', 'CD_MONARCH_SYNERGY', 'CD_APEX_SIPHON'],
    },
  ],
};

const TECH_PLANS = {
  BIO_HUMAN: [
    'BH_BASTION', 'BH_SANCTUM', 'BH_BLACKSMITH', 'BH_ARCHERY_RANGE', 'BH_GARRISON',
    'BH_VAULT', 'BH_MARKET', 'BH_KEEP', 'BH_STABLES', 'BH_ARSENAL', 'BH_ACADEMY',
    'BH_CATHEDRAL', 'BH_SHRINE', 'BH_MAGE_TOWER', 'BH_GRYPHON_AVIARY', 'BH_CASTLE',
  ],
  ARTIFICE_HORDE: [
    'AH_DEN', 'AH_OBELISK', 'AH_WORKSHOP', 'AH_FOUNDRY', 'AH_ASSEMBLY_LINE',
    'AH_MUNITIONS_DEPOT', 'AH_TESLA_TOWER', 'AH_STEAM_PLANT', 'AH_BRASS_FORGE',
    'AH_CLOCKWORK_SPIRE', 'AH_CHRONO_LAB', 'AH_REACTOR', 'AH_HANGAR',
  ],
  TERRA_BORN: [
    'TB_FORGE', 'TB_CONDUIT', 'TB_EARTH_SPIRE', 'TB_MUD_POOL', 'TB_SEISMIC_PILLAR',
    'TB_MAGMA_CHAMBER', 'TB_CRYSTAL_MATRIX', 'TB_GEODE_MINE', 'TB_QUAKE_ENGINE',
    'TB_MOUNTAIN_VAULT', 'TB_LAVA_FORGE', 'TB_AETHER_SPIRE', 'TB_GRANITE_KEEP',
  ],
  CHAOS_DEEP: [
    'CD_GESTATIONPIT', 'CD_SPORESACK', 'CD_ADAPTATIONVAULT', 'CD_MAULERWARREN',
    'CD_BURSTERNEST', 'CD_GROWTHCITADEL', 'CD_STRIDERDEN', 'CD_GLIDERMOUND',
    'CD_PLAGUEPOOL', 'CD_MATRIARCHNEST', 'CD_BROODTHRONE', 'CD_MONARCHMOUND',
    'CD_PLAGUECHAMBER', 'CD_MUTAGENICSANCTUM', 'CD_RIFTNETWORK',
  ],
};

const _cache = new Map();

function typePower(type) {
  const avgDamage = ((type.damage?.[0] ?? 0) + (type.damage?.[1] ?? 0)) * 0.5;
  const dps = type.attackSpeed > 0 ? avgDamage / type.attackSpeed : 0;
  const armorValue = 1 + Math.max(0, type.armor ?? 0) * 0.08;
  const rangeValue = 1 + Math.max(0, (type.attackRange ?? 1) - 1.7) * 0.055;
  const hpValue = (type.hp ?? 1) / 100;
  const attackValue = dps * rangeValue * (DAMAGE_TABLE[type.attackType] ? 1 : 0.9);
  return +(hpValue * armorValue + attackValue).toFixed(2);
}

function buildRaceKnowledge(raceId) {
  const race = RACES[raceId];
  if (!race) throw new Error(`Unknown AI race: ${raceId}`);

  const types = Object.values(UNIT_TYPES).filter((type) => type.race === raceId);
  const units = types.filter((type) => type.class === ENTITY_CLASS.UNIT);
  const structures = types.filter((type) => type.class === ENTITY_CLASS.BUILDING);
  const upgrades = Object.values(UPGRADES).filter((upgrade) => upgrade.race === raceId);

  const combatUnits = units
    .filter((type) => type.archetype === ARCHETYPE.MELEE || type.archetype === ARCHETYPE.RANGED)
    .map((type) => ({ ...type, aiPower: typePower(type) }))
    .sort((a, b) => a.cost.supply - b.cost.supply || a.cost.gold - b.cost.gold || b.aiPower - a.aiPower);

  const workers = units.filter((type) => type.archetype === ARCHETYPE.WORKER);
  const allTypeIds = types.map((type) => type.id);
  const allUpgradeIds = upgrades.map((upgrade) => upgrade.id);

  const combos = (RACE_COMBOS[raceId] ?? []).map((combo, index) => ({
    ...combo,
    index,
    units: combo.units.filter((id) => UNIT_TYPES[id]),
    structures: combo.structures.filter((id) => UNIT_TYPES[id]),
    research: combo.research.filter((id) => UPGRADES[id]),
  }));

  const genericResearch = upgrades
    .filter((upgrade) => {
      const mods = upgrade.modifiers ?? {};
      return (
        mods.meleeDamageAdd || mods.rangedDamageAdd || mods.meleeArmorAdd ||
        mods.rangedArmorAdd || mods.workerSpeedMult || mods.workerCarryAdd ||
        mods.supplyProvideAdd || mods.goldMultiplier || mods.aetherMultiplier ||
        mods.resourceMultiplier || mods.buildingHpMult
      );
    })
    .map((upgrade) => upgrade.id);

  return Object.freeze({
    raceId,
    race,
    allTypeIds,
    allUpgradeIds,
    units,
    workers,
    structures,
    combatUnits,
    upgrades,
    combos,
    techPlan: [...new Set([...(TECH_PLANS[raceId] ?? []), ...getAllBuildMenuTypeIds(raceId)])],
    genericResearch,
    counts: Object.freeze({
      units: units.length,
      structures: structures.length,
      upgrades: upgrades.length,
      combos: combos.length,
    }),
  });
}

export function getRaceKnowledge(raceId) {
  if (!_cache.has(raceId)) _cache.set(raceId, buildRaceKnowledge(raceId));
  return _cache.get(raceId);
}

export function completedBuildingIds(engine, player) {
  const out = [];
  const buildings = engine?.entities?.buildings ?? [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.isDead || b.isUnderConstruction || b.player !== player) continue;
    out.push(b.type.id);
  }
  return out;
}

export function hasBuildingRequirement(completedIds, reqId) {
  return completedIds.some((id) => satisfiesRequirement(reqId, id));
}

export function typeRequirementsMet(type, completedIds) {
  const reqs = type.requires ?? [];
  for (let i = 0; i < reqs.length; i++) {
    if (!hasBuildingRequirement(completedIds, reqs[i])) return false;
  }
  return true;
}

export function upgradeRequirementsMet(upgradeId, player, completedIds) {
  const reqs = getUpgradeRequirements(upgradeId);
  for (let i = 0; i < reqs.length; i++) {
    const req = reqs[i];
    if (req.type === 'upgrade' && !player.hasUpgrade(req.id)) return false;
    if (req.type === 'building' && !hasBuildingRequirement(completedIds, req.id)) return false;
  }
  return true;
}
