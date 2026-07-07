import { ARCHETYPE, ENTITY_CLASS, UNIT_TYPES, getUnitType } from './UnitTypes.js';
import { RACES, RACE_IDS } from './Races.js';
import { UPGRADES, getUpgradeType } from './Upgrades.js';

export const TECH_HIERARCHY = {
  BH_CITADEL: ['BH_CITADEL', 'BH_KEEP', 'BH_CASTLE'],
  BH_KEEP: ['BH_KEEP', 'BH_CASTLE'],
  BH_CASTLE: ['BH_CASTLE'],
  BH_BASTION: ['BH_BASTION', 'BH_BARRACKS_T2'],

  TB_CORE: ['TB_CORE', 'TB_GRANITE_KEEP'],
  TB_GRANITE_KEEP: ['TB_GRANITE_KEEP'],

  CD_INCUBATOR: ['CD_INCUBATOR', 'CD_GROWTHCITADEL', 'CD_BROODTHRONE'],
  CD_GROWTHCITADEL: ['CD_GROWTHCITADEL', 'CD_BROODTHRONE'],
  CD_BROODTHRONE: ['CD_BROODTHRONE'],
};

export function satisfiesRequirement(reqId, hasId) {
  if (reqId === hasId) return true;
  const list = TECH_HIERARCHY[reqId];
  return !!(list && list.includes(hasId));
}

export function hasBuildingRequirement(completedIds, reqId) {
  return completedIds.some((id) => satisfiesRequirement(reqId, id));
}

export function typeRequirementsMet(type, completedIds) {
  const reqs = type?.requires ?? [];
  for (let i = 0; i < reqs.length; i++) {
    if (!hasBuildingRequirement(completedIds, reqs[i])) return false;
  }
  return true;
}

export function getUpgradeRequirements(upgradeId) {
  const reqs = [];
  const match = upgradeId.match(/^(.*)_(\d)$/);
  if (match) {
    const base = match[1];
    const tier = parseInt(match[2], 10);
    if (tier > 1) reqs.push({ type: 'upgrade', id: `${base}_${tier - 1}` });
  }

  if (upgradeId.endsWith('_3')) {
    if (upgradeId.startsWith('BH_')) reqs.push({ type: 'building', id: 'BH_KEEP' });
    if (upgradeId.startsWith('AH_')) reqs.push({ type: 'building', id: 'AH_CLOCKWORK_SPIRE' });
    if (upgradeId.startsWith('TB_')) reqs.push({ type: 'building', id: 'TB_GRANITE_KEEP' });
    if (upgradeId.startsWith('CD_')) reqs.push({ type: 'building', id: 'CD_GROWTHCITADEL' });
  }

  return reqs;
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

export const BUILD_MENU_BY_RACE = {
  BIO_HUMAN: {
    basic: [
      'BH_CITADEL', 'BH_BASTION', 'BH_SANCTUM', 'BH_LUMBER_MILL', 'BH_BLACKSMITH',
      'BH_ARCHERY_RANGE', 'BH_VAULT', 'BH_MARKET', 'BH_GUARD_TOWER', 'BH_CASTLE_WALL',
      'BH_STABLES', 'BH_BARRACKS_T2',
    ],
    advanced: [
      'BH_KEEP', 'BH_CASTLE', 'BH_CATHEDRAL', 'BH_ACADEMY', 'BH_GRYPHON_AVIARY',
      'BH_MAGE_TOWER', 'BH_SHRINE', 'BH_ALCHEMY_LAB', 'BH_ARSENAL', 'BH_GARRISON',
      'BH_CANNON_TOWER',
    ],
  },
  ARTIFICE_HORDE: {
    basic: [
      'AH_NEXUS', 'AH_DEN', 'AH_OBELISK', 'AH_WORKSHOP', 'AH_ASSEMBLY_LINE',
      'AH_TESLA_TOWER', 'AH_GENERATOR', 'AH_FOUNDRY', 'AH_MUNITIONS_DEPOT',
      'AH_GEAR_TOWER', 'AH_SCRAP_YARD', 'AH_BATTERY',
    ],
    advanced: [
      'AH_STEAM_PLANT', 'AH_CLOCKWORK_SPIRE', 'AH_REPAIR_STATION', 'AH_CHRONO_LAB',
      'AH_BRASS_FORGE', 'AH_AUTOMATON_FACTORY', 'AH_IRON_DOME', 'AH_STEAM_SPIRE',
      'AH_LIGHTNING_ROD', 'AH_REACTOR', 'AH_HANGAR',
    ],
  },
  TERRA_BORN: {
    basic: [
      'TB_CORE', 'TB_FORGE', 'TB_CONDUIT', 'TB_STONE_WALL', 'TB_EARTH_SPIRE',
      'TB_BASALT_TOWER', 'TB_MUD_POOL', 'TB_PEBBLE_NEST', 'TB_EARTH_ALTAR',
      'TB_GRAVEL_PIT', 'TB_SAND_WALL', 'TB_SEISMIC_PILLAR',
    ],
    advanced: [
      'TB_GRANITE_KEEP', 'TB_MAGMA_CHAMBER', 'TB_CRYSTAL_MATRIX', 'TB_GEODE_MINE',
      'TB_QUAKE_ENGINE', 'TB_OBSIDIAN_PILLAR', 'TB_MOUNTAIN_VAULT', 'TB_AETHER_SPIRE',
      'TB_CORE_REACTOR', 'TB_TERRAN_MONOLITH', 'TB_LAVA_FORGE',
    ],
  },
  CHAOS_DEEP: {
    basic: [
      'CD_INCUBATOR', 'CD_GESTATIONPIT', 'CD_SPORESACK', 'CD_ADAPTATIONVAULT',
      'CD_SPORESENTRY', 'CD_IMPALINGSINE', 'CD_MAULERWARREN', 'CD_BURSTERNEST',
      'CD_BIOMASSNODULE', 'CD_SIPHONINGNODE', 'CD_CAUSTICNEST',
    ],
    advanced: [
      'CD_GROWTHCITADEL', 'CD_BROODTHRONE', 'CD_STRIDERDEN', 'CD_IMPALERDEN',
      'CD_GLIDERMOUND', 'CD_MONARCHMOUND', 'CD_DREADCAVERN', 'CD_PLAGUEPOOL',
      'CD_RIFTNETWORK', 'CD_PLAGUECHAMBER', 'CD_MATRIARCHNEST', 'CD_MUTAGENICSANCTUM',
    ],
  },
};

export const PRODUCTION_BY_BUILDING = {
  BH_CITADEL: ['BH_ACOLYTE', 'BH_KEEP'],
  BH_KEEP: ['BH_ACOLYTE', 'BH_CASTLE'],
  BH_CASTLE: ['BH_ACOLYTE', 'BH_AETHER_CRUSADER'],
  BH_BASTION: ['BH_TEMPLAR', 'BH_FOOTMAN', 'BH_HALBERDIER'],
  BH_BARRACKS_T2: ['BH_TEMPLAR', 'BH_FOOTMAN', 'BH_HALBERDIER', 'BH_DUELIST'],
  BH_BLACKSMITH: ['BH_DUELIST'],
  BH_ARCHERY_RANGE: ['BH_ARBALIST', 'BH_RIFLEMAN', 'BH_SENTINEL'],
  BH_STABLES: ['BH_KNIGHT', 'BH_LANCER'],
  BH_CATHEDRAL: ['BH_PALADIN', 'BH_INQUISITOR'],
  BH_ACADEMY: ['BH_ARCHMAGE', 'BH_CHAMPION'],
  BH_GARRISON: ['BH_DEFENDER', 'BH_WARDEN', 'BH_ROYAL_GUARD', 'BH_SENTINEL'],
  BH_GRYPHON_AVIARY: ['BH_GRYPHON'],
  BH_MAGE_TOWER: ['BH_MAGE', 'BH_CLERIC', 'BH_PRIEST'],
  BH_SHRINE: ['BH_CLERIC', 'BH_PRIEST'],
  BH_ARSENAL: ['BH_CATAPULT', 'BH_RIFLEMAN'],

  AH_NEXUS: ['AH_THRALL'],
  AH_DEN: ['AH_RIPPER', 'AH_GEARGUARD', 'AH_WEAVER'],
  AH_WORKSHOP: ['AH_MECHANIZED_SCOUT'],
  AH_ASSEMBLY_LINE: ['AH_AUTOMATON', 'AH_CLOCKWORK_SOLDIER', 'AH_STEEL_CHARGER'],
  AH_TESLA_TOWER: ['AH_TESLA_REAVER', 'AH_SHOCK_SENTINEL'],
  AH_STEAM_PLANT: ['AH_STEAM_HULK', 'AH_STEAM_GOLEM'],
  AH_MUNITIONS_DEPOT: ['AH_THUNDERER', 'AH_BOMBARD', 'AH_PYROCLASTIC_MACHINE'],
  AH_CLOCKWORK_SPIRE: ['AH_TINKER_HERO'],
  AH_CHRONO_LAB: ['AH_CHRONO_WEAVER', 'AH_NULLIFIER'],
  AH_BRASS_FORGE: ['AH_FORGE_SENTINEL'],
  AH_REACTOR: ['AH_COLOSSUS', 'AH_OVERCHARGED_CORE'],
  AH_HANGAR: ['AH_BRASS_AVIATOR'],

  TB_CORE: ['TB_GOLEMLING', 'TB_GRANITE_KEEP'],
  TB_GRANITE_KEEP: ['TB_GOLEMLING'],
  TB_FORGE: ['TB_BRUTE', 'TB_STONE_CRUSHER', 'TB_GRANITE_SHIELD'],
  TB_EARTH_SPIRE: ['TB_SHARDCASTER'],
  TB_SEISMIC_PILLAR: ['TB_SHARDCASTER', 'TB_GRAVEL_HURLER', 'TB_BOULDER_HURLER', 'TB_STALAGMITE_SENTINEL', 'TB_GRANITE_SHIELD'],
  TB_MAGMA_CHAMBER: ['TB_OBSIDIAN_SHARD'],
  TB_MUD_POOL: ['TB_MUD_ELEMENTAL', 'TB_SAND_WEAVER'],
  TB_QUAKE_ENGINE: ['TB_TREMOR_BEAST', 'TB_EARTHSHAKER'],
  TB_MOUNTAIN_VAULT: ['TB_MOUNTAIN_GIANT'],
  TB_CRYSTAL_MATRIX: ['TB_CRYSTAL_HEALER'],
  TB_GEODE_MINE: ['TB_GEODE_LURKER'],
  TB_LAVA_FORGE: ['TB_LAVA_SPITTER', 'TB_MAGMA_LORD'],
  TB_PEBBLE_NEST: ['TB_IRONSTONE_GARGOYLE'],
  TB_CORE_REACTOR: ['TB_CORE_GUARDIAN'],
  TB_AETHER_SPIRE: ['TB_AETHER_GOLEM'],
  TB_TERRAN_MONOLITH: ['TB_TERRA_ARCHON'],
  TB_EARTH_ALTAR: ['TB_DUST_SPRITE'],

  CD_INCUBATOR: ['CD_DREDGER', 'CD_GROWTHCITADEL'],
  CD_GROWTHCITADEL: ['CD_DREDGER', 'CD_BROODTHRONE'],
  CD_BROODTHRONE: ['CD_DREDGER'],
  CD_GESTATIONPIT: ['CD_RIFTFIEND', 'CD_PLATEDMAULER', 'CD_BILEVESSEL', 'CD_SPORELING'],
  CD_MAULERWARREN: ['CD_PLATEDMAULER', 'CD_BILECASTER'],
  CD_BURSTERNEST: ['CD_BILEVESSEL'],
  CD_STRIDERDEN: ['CD_NEEDLESTRIDER'],
  CD_IMPALERDEN: ['CD_IMPALER'],
  CD_GLIDERMOUND: ['CD_SPOREMANTA', 'CD_BILEDART', 'CD_SPORELASHER'],
  CD_MONARCHMOUND: ['CD_SWARMMONARCH', 'CD_SWARMSENTINEL'],
  CD_DREADCAVERN: ['CD_DREADBEHEMOTH'],
  CD_PLAGUEPOOL: ['CD_PARASITICWEAVER', 'CD_BROODCARRIER', 'CD_GRIPFIEND', 'CD_PLAGUETHRALL'],
  CD_PLAGUECHAMBER: ['CD_MIASMAWEAVER'],
  CD_MATRIARCHNEST: ['CD_MATRIARCH'],
  CD_RIFTNETWORK: ['CD_CHASMWORM'],
  CD_ADAPTATIONVAULT: ['CD_ABYSSALWATCHER'],
  CD_MUTAGENICSANCTUM: ['CD_APEXTYRANT'],
};

const FALLBACK_RESEARCH_SITE = {
  BIO_HUMAN: 'BH_BLACKSMITH',
  ARTIFICE_HORDE: 'AH_FOUNDRY',
  TERRA_BORN: 'TB_LAVA_FORGE',
  CHAOS_DEEP: 'CD_ADAPTATIONVAULT',
};

const RESEARCH_RULES = {
  BIO_HUMAN: [
    [/MELEE|RANGED_ARM|RANGED_ATK|HALBERD|FOOTMAN|DUELIST/, 'BH_BLACKSMITH'],
    [/ECON|SUPPLY|TAXES/, 'BH_VAULT'],
    [/REPAIR|TOWN_WATCH/, 'BH_MARKET'],
    [/BUILD_HP|RIFLE|CATAPULT/, 'BH_ARSENAL'],
    [/KNIGHT|LANCER|ARBA/, 'BH_ALCHEMY_LAB'],
    [/GRYPHON/, 'BH_GRYPHON_AVIARY'],
    [/PALADIN|INQ|PRIEST|CLERIC/, 'BH_SHRINE'],
    [/ARCHMAGE/, 'BH_MAGE_TOWER'],
    [/WARDEN|DEFENDER|ROYAL|SENTINEL/, 'BH_GARRISON'],
    [/CHAMPION/, 'BH_ACADEMY'],
    [/CRUSADER/, 'BH_CASTLE'],
  ],
  ARTIFICE_HORDE: [
    [/MELEE|RANGED|BUILD_HP/, 'AH_FOUNDRY'],
    [/ECON|OBELISK|AETHER|SCRAP/, 'AH_SCRAP_YARD'],
    [/STEAM|GOLEM/, 'AH_STEAM_PLANT'],
    [/AUTOMATON|CLOCKWORK|STEEL/, 'AH_ASSEMBLY_LINE'],
    [/TESLA|SHOCK/, 'AH_TESLA_TOWER'],
    [/THUNDER|BOMBARD|PYRO/, 'AH_MUNITIONS_DEPOT'],
    [/CHRONO|NULL/, 'AH_CHRONO_LAB'],
    [/COLOSSUS|OVERCHARGED/, 'AH_REACTOR'],
    [/AVIATOR/, 'AH_HANGAR'],
    [/FORGE/, 'AH_BRASS_FORGE'],
    [/SCOUT/, 'AH_WORKSHOP'],
    [/REPAIR/, 'AH_REPAIR_STATION'],
    [/TINKER/, 'AH_CLOCKWORK_SPIRE'],
  ],
  TERRA_BORN: [
    [/MELEE|RANGED|BUILD_HP|BASALT|EARTH_ALLIANCE/, 'TB_LAVA_FORGE'],
    [/ECON|CONDUIT|GEODE_MINING/, 'TB_GEODE_MINE'],
    [/STONE|GRANITE|GRAVEL|BOULDER|STALAGMITE/, 'TB_SEISMIC_PILLAR'],
    [/OBSIDIAN|LAVA|MAGMA|GUARDIAN/, 'TB_MAGMA_CHAMBER'],
    [/MUD|SAND/, 'TB_MUD_POOL'],
    [/TREMOR|EARTH_HP/, 'TB_QUAKE_ENGINE'],
    [/GIANT/, 'TB_MOUNTAIN_VAULT'],
    [/CRYSTAL/, 'TB_CRYSTAL_MATRIX'],
    [/GARGOYLE/, 'TB_PEBBLE_NEST'],
    [/GOLEM/, 'TB_AETHER_SPIRE'],
    [/ARCHON/, 'TB_TERRAN_MONOLITH'],
    [/DUST/, 'TB_EARTH_ALTAR'],
  ],
  CHAOS_DEEP: [
    [/MELEE|RANGED|CARAPACE|WATCHER/, 'CD_ADAPTATIONVAULT'],
    [/ECON|BUILD_HP|SUPPLY|CREEP|REGEN/, 'CD_SIPHONINGNODE'],
    [/MAULER|CASTER/, 'CD_MAULERWARREN'],
    [/MANTA|DART|LASHER/, 'CD_GLIDERMOUND'],
    [/STRIDER/, 'CD_STRIDERDEN'],
    [/IMPALER/, 'CD_IMPALERDEN'],
    [/BURSTER/, 'CD_BURSTERNEST'],
    [/BEHEMOTH/, 'CD_DREADCAVERN'],
    [/MATRIARCH/, 'CD_MATRIARCHNEST'],
    [/SPORELING|MONARCH|SENTINEL/, 'CD_MONARCHMOUND'],
    [/FIEND|WEAVER|THRALL/, 'CD_PLAGUEPOOL'],
    [/APEX/, 'CD_MUTAGENICSANCTUM'],
    [/WORM/, 'CD_RIFTNETWORK'],
  ],
};

const _producersByType = new Map();
const _researchByBuilding = new Map();
const _researchSitesByUpgrade = new Map();

function buildIndexes() {
  if (_producersByType.size > 0) return;

  for (const [buildingId, list] of Object.entries(PRODUCTION_BY_BUILDING)) {
    for (const typeId of list) {
      if (!_producersByType.has(typeId)) _producersByType.set(typeId, []);
      _producersByType.get(typeId).push(buildingId);
    }
  }

  for (const raceId of RACE_IDS) {
    const race = RACES[raceId];
    const units = Object.values(UNIT_TYPES).filter((type) => type.race === raceId && type.class === ENTITY_CLASS.UNIT);
    for (const unit of units) {
      if (_producersByType.has(unit.id)) continue;
      const producer = unit.archetype === ARCHETYPE.WORKER
        ? race.buildings.hall
        : unit.requires?.[0] ?? race.buildings.barracks;
      _producersByType.set(unit.id, [producer]);
    }
  }

  for (const up of Object.values(UPGRADES)) {
    const site = resolveResearchSite(up);
    _researchSitesByUpgrade.set(up.id, [site]);
    if (!_researchByBuilding.has(site)) _researchByBuilding.set(site, []);
    _researchByBuilding.get(site).push(up.id);
  }
}

function resolveResearchSite(upgrade) {
  const rules = RESEARCH_RULES[upgrade.race] ?? [];
  for (const [pattern, buildingId] of rules) {
    if (pattern.test(upgrade.id)) return buildingId;
  }
  return FALLBACK_RESEARCH_SITE[upgrade.race];
}

export function getBuildMenuForRace(raceId, page = 'basic', pageIndex = 0, pageSize = 10) {
  const all = BUILD_MENU_BY_RACE[raceId]?.[page] ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const safePage = Math.max(0, Math.min(totalPages - 1, pageIndex | 0));
  const start = safePage * pageSize;
  return {
    typeIds: all.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    hasPrev: safePage > 0,
    hasNext: safePage < totalPages - 1,
  };
}

export function getAllBuildMenuTypeIds(raceId) {
  const pages = BUILD_MENU_BY_RACE[raceId] ?? {};
  return [...(pages.basic ?? []), ...(pages.advanced ?? [])];
}

export function getProductionForBuilding(buildingTypeId) {
  return PRODUCTION_BY_BUILDING[buildingTypeId] ?? [];
}

export function getResearchForBuilding(buildingTypeId) {
  buildIndexes();
  return _researchByBuilding.get(buildingTypeId) ?? [];
}

export function getProducersForUnit(typeId) {
  buildIndexes();
  return _producersByType.get(typeId) ?? [];
}

export function getResearchSitesForUpgrade(upgradeId) {
  buildIndexes();
  return _researchSitesByUpgrade.get(upgradeId) ?? [];
}

export function canProduce(buildingTypeId, typeId) {
  return getProducersForUnit(typeId).includes(buildingTypeId);
}

export function canResearch(buildingTypeId, upgradeId) {
  return getResearchSitesForUpgrade(upgradeId).includes(buildingTypeId);
}

export function validateTechTree() {
  buildIndexes();
  const errors = [];

  for (const raceId of RACE_IDS) {
    const buildable = new Set(getAllBuildMenuTypeIds(raceId));
    const buildings = Object.values(UNIT_TYPES).filter((type) => type.race === raceId && type.class === ENTITY_CLASS.BUILDING);
    for (const b of buildings) {
      if (!buildable.has(b.id)) errors.push(`${raceId}: building ${b.id} is missing from build menus.`);
    }

    const units = Object.values(UNIT_TYPES).filter((type) => (
      type.race === raceId &&
      type.class === ENTITY_CLASS.UNIT &&
      (type.archetype === ARCHETYPE.WORKER || type.archetype === ARCHETYPE.MELEE || type.archetype === ARCHETYPE.RANGED)
    ));
    for (const unit of units) {
      const producers = getProducersForUnit(unit.id).filter((id) => UNIT_TYPES[id]?.race === raceId);
      if (producers.length === 0) errors.push(`${raceId}: unit ${unit.id} has no producer.`);
    }

    const upgrades = Object.values(UPGRADES).filter((up) => up.race === raceId);
    for (const up of upgrades) {
      const sites = getResearchSitesForUpgrade(up.id).filter((id) => UNIT_TYPES[id]?.race === raceId);
      if (sites.length === 0) errors.push(`${raceId}: upgrade ${up.id} has no research site.`);
    }
  }

  return errors;
}

export function getRequirementName(reqId) {
  if (UNIT_TYPES[reqId]) return getUnitType(reqId).name;
  if (UPGRADES[reqId]) return getUpgradeType(reqId).name;
  return reqId;
}
