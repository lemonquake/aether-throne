/**
 * UnitTypes — WC3-style stat blocks for every unit and building.
 *
 * Stats follow the classic Warcraft 3 model:
 *   hp, mana, damage [min,max], attackType, armor, armorType,
 *   attackSpeed (seconds per attack), attackRange (world units),
 *   moveSpeed (world units/sec), sightRadius, cost {gold, aether, supply},
 *   buildTime (seconds).
 *
 * Damage resolution (implemented in src/combat/CombatSystem.js):
 *   raw       = random(damage[0]..damage[1])
 *   typed     = raw * DAMAGE_TABLE[attackType][armorType]
 *   reduction = (armor * ARMOR_FACTOR) / (1 + armor * ARMOR_FACTOR)
 *   final     = typed * (1 - reduction)
 *
 * Types are generated from shared ARCHETYPES with per-race modifiers so the
 * three factions stay asymmetric but balance-tweakable from one table.
 */
import { GAME_CONFIG } from './GameConfig.js';

export const ENTITY_CLASS = {
  UNIT: 'UNIT',
  BUILDING: 'BUILDING',
};

export const ARCHETYPE = {
  WORKER: 'WORKER',
  MELEE: 'MELEE',
  RANGED: 'RANGED',
  HALL: 'HALL',
  BARRACKS: 'BARRACKS',
  SUPPLY: 'SUPPLY',
};

export const ATTACK_TYPES = ['NORMAL', 'PIERCE', 'MAGIC', 'SIEGE'];
export const ARMOR_TYPES = ['LIGHT', 'MEDIUM', 'HEAVY', 'FORTIFIED'];

/**
 * WC3-style attack-type vs armor-type effectiveness matrix.
 * DAMAGE_TABLE[attackType][armorType] → damage multiplier.
 */
export const DAMAGE_TABLE = {
  NORMAL: { LIGHT: 1.0, MEDIUM: 1.5, HEAVY: 1.0, FORTIFIED: 0.7 },
  PIERCE: { LIGHT: 2.0, MEDIUM: 0.75, HEAVY: 1.0, FORTIFIED: 0.35 },
  MAGIC: { LIGHT: 1.25, MEDIUM: 0.75, HEAVY: 2.0, FORTIFIED: 0.35 },
  SIEGE: { LIGHT: 1.0, MEDIUM: 0.5, HEAVY: 1.0, FORTIFIED: 1.5 },
};

/**
 * Compute post-mitigation damage. Shared helper so combat, AI evaluation,
 * and tooltips all agree on the math.
 * @param {number} rawDamage - Rolled base damage.
 * @param {string} attackType
 * @param {number} armor
 * @param {string} armorType
 * @returns {number}
 */
export function computeDamage(rawDamage, attackType, armor, armorType) {
  const k = GAME_CONFIG.COMBAT.ARMOR_FACTOR;
  const typeMult = DAMAGE_TABLE[attackType]?.[armorType] ?? 1.0;
  const reduction = (armor * k) / (1 + armor * k);
  return rawDamage * typeMult * (1 - reduction);
}

/** Base stat blocks. Race variants override individual fields below. */
const ARCHETYPES = {
  [ARCHETYPE.WORKER]: {
    class: ENTITY_CLASS.UNIT,
    archetype: ARCHETYPE.WORKER,
    hp: 220, mana: 0,
    damage: [5, 7], attackType: 'NORMAL',
    armor: 0, armorType: 'LIGHT',
    attackSpeed: 2.0, attackRange: 1.4,
    moveSpeed: 5.2, sightRadius: 9,
    cost: { gold: 75, aether: 0, supply: 1 },
    buildTime: 12,
    radius: 0.5, // collision/selection footprint
  },
  [ARCHETYPE.MELEE]: {
    class: ENTITY_CLASS.UNIT,
    archetype: ARCHETYPE.MELEE,
    hp: 420, mana: 0,
    damage: [12, 16], attackType: 'NORMAL',
    armor: 2, armorType: 'MEDIUM',
    attackSpeed: 1.35, attackRange: 1.7,
    moveSpeed: 8.7, sightRadius: 10,
    cost: { gold: 135, aether: 0, supply: 2 },
    buildTime: 18,
    radius: 0.6,
  },
  [ARCHETYPE.RANGED]: {
    class: ENTITY_CLASS.UNIT,
    archetype: ARCHETYPE.RANGED,
    hp: 260, mana: 60,
    damage: [15, 21], attackType: 'PIERCE',
    armor: 0, armorType: 'LIGHT',
    attackSpeed: 1.6, attackRange: 9,
    moveSpeed: 8.1, sightRadius: 12,
    cost: { gold: 145, aether: 25, supply: 2 },
    buildTime: 20,
    radius: 0.55,
    projectile: { speed: 28 },
  },
  [ARCHETYPE.HALL]: {
    class: ENTITY_CLASS.BUILDING,
    archetype: ARCHETYPE.HALL,
    hp: 1500, mana: 0,
    damage: [0, 0], attackType: 'NORMAL',
    armor: 5, armorType: 'FORTIFIED',
    attackSpeed: 0, attackRange: 0,
    moveSpeed: 0, sightRadius: 12,
    cost: { gold: 385, aether: 0, supply: 0 },
    buildTime: 90,
    radius: 3.2,
    providesSupply: 30,
    isDropOff: true,
  },
  [ARCHETYPE.BARRACKS]: {
    class: ENTITY_CLASS.BUILDING,
    archetype: ARCHETYPE.BARRACKS,
    hp: 900, mana: 0,
    damage: [0, 0], attackType: 'NORMAL',
    armor: 3, armorType: 'FORTIFIED',
    attackSpeed: 0, attackRange: 0,
    moveSpeed: 0, sightRadius: 9,
    cost: { gold: 180, aether: 40, supply: 0 },
    buildTime: 45,
    radius: 2.4,
  },
  [ARCHETYPE.SUPPLY]: {
    class: ENTITY_CLASS.BUILDING,
    archetype: ARCHETYPE.SUPPLY,
    hp: 500, mana: 0,
    damage: [0, 0], attackType: 'NORMAL',
    armor: 2, armorType: 'FORTIFIED',
    attackSpeed: 0, attackRange: 0,
    moveSpeed: 0, sightRadius: 8,
    cost: { gold: 90, aether: 0, supply: 0 },
    buildTime: 28,
    radius: 1.6,
    providesSupply: 12,
  },
};

/**
 * Race-wide stat modifiers, applied multiplicatively/additively on top of
 * the archetype base. Keeps faction identity in one legible place.
 */
const RACE_MODS = {
  BIO_HUMAN: { hpMult: 1.0, speedMult: 1.0, armorAdd: 0 },
  ARTIFICE_HORDE: { hpMult: 0.88, speedMult: 1.12, armorAdd: 0 },
  TERRA_BORN: { hpMult: 1.15, speedMult: 0.9, armorAdd: 1 },
  CHAOS_DEEP: { hpMult: 0.95, speedMult: 1.05, armorAdd: 0 },
  NEUTRAL_HOSTILE: { hpMult: 1.0, speedMult: 0.95, armorAdd: 0 },
};

/** Deep-ish clone + apply race mods + attach identity fields. */
function makeType(id, name, raceId, archetypeKey, overrides = {}) {
  const base = ARCHETYPES[archetypeKey];
  const mod = RACE_MODS[raceId];
  const type = {
    ...base,
    id,
    name,
    race: raceId,
    damage: [...base.damage],
    cost: { ...base.cost },
    requires: overrides.requires ?? [],
    ...(base.projectile ? { projectile: { ...base.projectile } } : {}),
    ...overrides,
  };
  type.hp = Math.round(type.hp * mod.hpMult);
  type.moveSpeed = +(type.moveSpeed * mod.speedMult).toFixed(2);
  if (type.class === ENTITY_CLASS.UNIT) type.armor += mod.armorAdd;
  return Object.freeze(type);
}

const typesList = [];

// Helper to push to types list
function add(id, name, race, arch, overrides = {}) {
  typesList.push({ id, name, race, arch, overrides });
}

// ── BIO HUMAN ENTITIES (23 Units + 23 Buildings) ─────────────────────────────
// Units (3 base + 20 new)
add('BH_ACOLYTE', 'Acolyte', 'BIO_HUMAN', ARCHETYPE.WORKER, {
  cost: { gold: 75, aether: 0, supply: 1 },
  description: 'Faithful builder and gatherer, channeling holy energy to conjure castles and mine raw ores.'
});
add('BH_TEMPLAR', 'Templar', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  armor: 3,
  cost: { gold: 130, aether: 10, supply: 2 },
  description: 'A holy warrior clad in polished steel, wielding a blessed broadsword to defend the realm.'
});
add('BH_ARBALIST', 'Arbalist', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  cost: { gold: 140, aether: 20, supply: 2 },
  description: 'Crossbow sniper who channels minor leyline currents to charge and fire heavy bolts.'
});
add('BH_FOOTMAN', 'Footman', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 450,
  cost: { gold: 120, aether: 0, supply: 2 },
  description: 'Durable infantryman equipped with a tower shield, trained to hold choke points against swarms.'
});
add('BH_KNIGHT', 'Knight', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 750, armor: 4, moveSpeed: 9.5,
  cost: { gold: 215, aether: 45, supply: 3 },
  requires: ['BH_STABLES'],
  description: 'Elongated heavy cavalry trained to break enemy formations with devastating lance charges.'
});
add('BH_CLERIC', 'Cleric', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 220, mana: 100,
  cost: { gold: 115, aether: 35, supply: 2 },
  requires: ['BH_SHRINE'],
  description: 'A devout scholar of the Bio-Throne who keeps frontline troops patched up with curative light.'
});
add('BH_MAGE', 'Mage', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 240, mana: 150, attackType: 'MAGIC',
  cost: { gold: 155, aether: 70, supply: 2 },
  requires: ['BH_MAGE_TOWER'],
  description: 'An initiate of the High Academy, channeling raw ambient Aether into destructive fireballs.'
});
add('BH_RIFLEMAN', 'Rifleman', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 300, attackRange: 10,
  cost: { gold: 145, aether: 30, supply: 2 },
  requires: ['BH_ARSENAL'],
  description: 'A sharpshooter utilizing early black powder weapons to snipe distant threats from the battle lines.'
});
add('BH_HALBERDIER', 'Halberdier', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 420, damage: [14, 18],
  cost: { gold: 135, aether: 15, supply: 2 },
  requires: ['BH_BLACKSMITH'],
  description: 'A specialized polearm defender whose reach makes them highly effective against cavalry and giants.'
});
add('BH_PALADIN', 'Paladin', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 900, armor: 5, damage: [18, 25],
  cost: { gold: 275, aether: 85, supply: 4 },
  requires: ['BH_CATHEDRAL'],
  description: 'A veteran holy knight whose presence alone radiates a restorative aura, healing nearby allies.'
});
add('BH_ARCHMAGE', 'Archmage', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 500, mana: 250, attackType: 'MAGIC',
  cost: { gold: 295, aether: 145, supply: 4 },
  requires: ['BH_ACADEMY'],
  description: 'A master of arcane geometry, capable of summoning freezing blizzard storms and teleporting units.'
});
add('BH_WARDEN', 'Warden', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 600, damage: [22, 28],
  cost: { gold: 240, aether: 75, supply: 3 },
  requires: ['BH_GARRISON'],
  description: 'An inquisitorial agent tasked with hunting down high-value targets and executing swift justice.'
});
add('BH_GRYPHON', 'Gryphon Rider', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 550, attackRange: 8,
  cost: { gold: 255, aether: 105, supply: 4 },
  requires: ['BH_GRYPHON_AVIARY'],
  description: 'An elite rider atop a majestic gryphon, hurling thunder-infused hammers that chain between enemies.'
});
add('BH_DEFENDER', 'Defender', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 520, armor: 6,
  cost: { gold: 150, aether: 10, supply: 2 },
  requires: ['BH_GARRISON'],
  description: 'An unwavering shield-bearer who specializes in mitigating physical strikes and holding lines.'
});
add('BH_CATAPULT', 'Catapult', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 380, attackRange: 14, attackType: 'SIEGE',
  cost: { gold: 210, aether: 75, supply: 3 },
  requires: ['BH_ARSENAL'],
  description: 'A heavy mechanical siege engine designed to throw burning pitch that shatters fortified structures.'
});
add('BH_PRIEST', 'Priest', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 230, mana: 120,
  cost: { gold: 125, aether: 45, supply: 2 },
  requires: ['BH_SHRINE'],
  description: 'A high priest who casts protective shielding wards to absorb incoming enemy damage.'
});
add('BH_LANCER', 'Lancer', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 620, damage: [16, 22], moveSpeed: 9.0,
  cost: { gold: 175, aether: 25, supply: 3 },
  requires: ['BH_STABLES'],
  description: 'Light, agile cavalry that excels at flanking maneuvers and hunting down fleeing ranged units.'
});
add('BH_INQUISITOR', 'Inquisitor', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 400, attackType: 'MAGIC',
  cost: { gold: 165, aether: 55, supply: 2 },
  requires: ['BH_CATHEDRAL'],
  description: 'A zealous inquisitor whose mana-burning strikes silence spellcasters and purge magical enhancements.'
});
add('BH_DUELIST', 'Duelist', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 380, damage: [15, 20], attackSpeed: 1.1,
  cost: { gold: 125, aether: 10, supply: 2 },
  requires: ['BH_BLACKSMITH'],
  description: 'A master fencer whose rapid-fire rapier strikes exploit weak spots in enemy armor.'
});
add('BH_CHAMPION', 'Champion', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 820, armor: 5, damage: [20, 26],
  cost: { gold: 235, aether: 55, supply: 3 },
  requires: ['BH_ACADEMY'],
  description: 'A frontline hero displaying the royal standard, boosting morale and survivability on the battlefield.'
});
add('BH_SENTINEL', 'Sentinel', 'BIO_HUMAN', ARCHETYPE.RANGED, {
  hp: 350, attackRange: 11,
  cost: { gold: 135, aether: 20, supply: 2 },
  requires: ['BH_GARRISON'],
  description: 'A highly trained longbow archer stationed on towers to rain down high-velocity suppressing arrows.'
});
add('BH_AETHER_CRUSADER', 'Aether Crusader', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 1200, armor: 7, damage: [28, 38],
  cost: { gold: 440, aether: 195, supply: 6 },
  requires: ['BH_CASTLE'],
  description: 'A legendary titan of the bio-throne, encased in runic steel and channeling absolute divine wrath.'
});
add('BH_ROYAL_GUARD', 'Royal Guard', 'BIO_HUMAN', ARCHETYPE.MELEE, {
  hp: 950, armor: 6, damage: [24, 32],
  cost: { gold: 340, aether: 115, supply: 4 },
  requires: ['BH_KEEP'],
  description: 'The sworn protector of the keep, equipped with royal armor and trained in lethal combat arts.'
});

// Buildings (3 base + 20 new)
add('BH_CITADEL', 'Citadel', 'BIO_HUMAN', ARCHETYPE.HALL, {
  cost: { gold: 380, aether: 0, supply: 0 },
  description: 'The royal command center and registry. Coordinates town operations and trains basic workers.'
});
add('BH_BASTION', 'Bastion', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 35, supply: 0 },
  description: 'The training barracks where footmen, templars, and other infantry are drilled in tactics.'
});
add('BH_SANCTUM', 'Sanctum', 'BIO_HUMAN', ARCHETYPE.SUPPLY, {
  cost: { gold: 85, aether: 5, supply: 0 },
  providesSupply: 12,
  description: 'A sacred chapel housing a small Aether font, raising the maximum supply cap.'
});
add('BH_BLACKSMITH', 'Blacksmith', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 45 },
  requires: ['BH_BASTION'],
  description: 'The forge where steel weapons and armor plating upgrades are researched for melee forces.'
});
add('BH_CATHEDRAL', 'Cathedral', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 75 },
  requires: ['BH_BASTION'],
  description: 'A grand cathedral of holy light, serving as the training ground for Paladins and Inquisitors.'
});
add('BH_ACADEMY', 'Academy', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 95 },
  requires: ['BH_BASTION'],
  description: 'The tactical academy where elite military leaders and grand archmages are trained.'
});
add('BH_LUMBER_MILL', 'Lumber Mill', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 95, aether: 0 },
  description: 'Processes high-grade timber for architectural fortifications and unlocks defensive guard towers.'
});
add('BH_CASTLE_WALL', 'Castle Wall', 'BIO_HUMAN', ARCHETYPE.SUPPLY, {
  providesSupply: 4,
  cost: { gold: 45, aether: 0 },
  description: 'A low stone wall used to cordon off base borders and secure choke points.'
});
add('BH_GUARD_TOWER', 'Guard Tower', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 105, aether: 25 },
  requires: ['BH_LUMBER_MILL'],
  description: 'A wooden watchtower manned by archers firing high-velocity defensive arrows.'
});
add('BH_CANNON_TOWER', 'Cannon Tower', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 155, aether: 65 },
  requires: ['BH_ARSENAL'],
  description: 'A fortified tower fitted with a heavy black powder cannon that deals splash damage.'
});
add('BH_MAGE_TOWER', 'Mage Tower', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 185, aether: 85 },
  requires: ['BH_ACADEMY'],
  description: 'A tall stone spire that channels ambient leyline energy to train mages.'
});
add('BH_STABLES', 'Stables', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 165, aether: 55 },
  requires: ['BH_BLACKSMITH'],
  description: 'Unlocks cavalry units, facilitating the breeding and training of warhorses.'
});
add('BH_ARCHERY_RANGE', 'Archery Range', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 15 },
  description: 'The archery range where marksmen are trained in ranged combat techniques.'
});
add('BH_GRYPHON_AVIARY', 'Gryphon Aviary', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 215, aether: 115 },
  requires: ['BH_STABLES'],
  description: 'High cliff nesting grounds designed to capture and train wild war gryphons.'
});
add('BH_MARKET', 'Market', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 0 },
  description: 'A busy mercantile market, enabling trade upgrades like town watch and steel wrenches.'
});
add('BH_SHRINE', 'Shrine', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 135, aether: 35 },
  requires: ['BH_CATHEDRAL'],
  description: 'A holy altar where clerics and priests are trained and holy light upgrades researched.'
});
add('BH_VAULT', 'Vault', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 95, aether: 45 },
  description: 'A secured royal vault for researching tax policies, acolyte training, and economy.'
});
add('BH_ALCHEMY_LAB', 'Alchemy Lab', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 75 },
  description: 'A laboratory specializing in distilling volatile potions to unlock knight and arbalist upgrades.'
});
add('BH_KEEP', 'Keep', 'BIO_HUMAN', ARCHETYPE.HALL, {
  hp: 2500,
  cost: { gold: 295, aether: 95 },
  requires: ['BH_CITADEL'],
  description: 'Tier 2 Keep upgrade for the Citadel. Unlocks advanced tech and royal guard production.'
});
add('BH_CASTLE', 'Castle', 'BIO_HUMAN', ARCHETYPE.HALL, {
  hp: 3500,
  cost: { gold: 395, aether: 195 },
  requires: ['BH_KEEP'],
  description: 'Tier 3 Castle upgrade for the Keep. Unlocks elite military tech and the Aether Crusader.'
});
add('BH_ARSENAL', 'Arsenal', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 75 },
  requires: ['BH_BLACKSMITH'],
  description: 'The armory where black powder, catapult payload, and masonry upgrades are kept.'
});
add('BH_GARRISON', 'Garrison', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 155, aether: 35 },
  requires: ['BH_BASTION'],
  description: 'A heavy military garrison housing defenders, wardens, and royal guards.'
});
add('BH_BARRACKS_T2', 'Garrison Barracks', 'BIO_HUMAN', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 45 },
  requires: ['BH_BASTION'],
  description: 'An upgraded training facility containing blueprints for heavy military gear.'
});


// ── ARTIFICE HORDE ENTITIES (23 Units + 23 Buildings) ────────────────────────
// Units
add('AH_THRALL', 'Void Thrall', 'ARTIFICE_HORDE', ARCHETYPE.WORKER, {
  cost: { gold: 70, aether: 5, supply: 1 },
  description: 'A reanimated mechanical assistant cobbled together from scrap metal, tasked with mining and building.'
});
add('AH_RIPPER', 'Ripper', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  attackSpeed: 1.1, damage: [10, 13],
  cost: { gold: 120, aether: 10, supply: 2 },
  description: 'A swift, buzzsaw-wielding bipedal automaton designed to slice through flesh and light armor.'
});
add('AH_WEAVER', 'Void Weaver', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  attackType: 'MAGIC', projectile: { speed: 34 },
  cost: { gold: 135, aether: 30, supply: 2 },
  description: 'A levitating energy weaver that fires plasma discharges from its overloaded capacitors.'
});
add('AH_GEARGUARD', 'Gearguard', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 440,
  cost: { gold: 125, aether: 5, supply: 2 },
  description: 'A bronze automaton outfitted with heavy plating, programmed to absorb frontline blows.'
});
add('AH_STEAM_HULK', 'Steam Hulk', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 800, armor: 3,
  cost: { gold: 230, aether: 55, supply: 3 },
  requires: ['AH_STEAM_PLANT'],
  description: 'A bulky coal-fired walker that unleashes high-pressure steam venting to damage adjacent targets.'
});
add('AH_AUTOMATON', 'Automaton', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 500, damage: [16, 20],
  cost: { gold: 145, aether: 15, supply: 2 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A mass-produced iron infantry construct utilizing early gears to punch with high impact.'
});
add('AH_CLOCKWORK_SOLDIER', 'Clockwork Soldier', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 380, attackSpeed: 1.1,
  cost: { gold: 115, aether: 5, supply: 2 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A spring-wound brass soldier equipped with a piston spear that strikes with extreme speed.'
});
add('AH_TESLA_REAVER', 'Tesla Reaver', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 450, attackType: 'MAGIC',
  cost: { gold: 165, aether: 45, supply: 2 },
  requires: ['AH_TESLA_TOWER'],
  description: 'A walking coil machine that channels electrical currents to shock and paralyze opponents.'
});
add('AH_THUNDERER', 'Thunderer', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 280, attackRange: 10.5,
  cost: { gold: 135, aether: 35, supply: 2 },
  requires: ['AH_MUNITIONS_DEPOT'],
  description: 'An infantry marksman carrying a magnetic railgun that fires hyper-velocity tungsten slugs.'
});
add('AH_BOMBARD', 'Scrap Bombard', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 350, attackRange: 13, attackType: 'SIEGE',
  cost: { gold: 205, aether: 85, supply: 3 },
  requires: ['AH_MUNITIONS_DEPOT'],
  description: 'A heavy mechanical launcher throwing volatile scrap payloads that shatter defensive structures.'
});
add('AH_REPAIR_DRONE', 'Repair Drone', 'ARTIFICE_HORDE', ARCHETYPE.WORKER, {
  hp: 180,
  cost: { gold: 95, aether: 25, supply: 1 },
  requires: ['AH_REPAIR_STATION'],
  description: 'A small helicopter drone programmed to repair hulls and structures with minor welding beams.'
});
add('AH_CHRONO_WEAVER', 'Chrono Weaver', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 250, mana: 120,
  cost: { gold: 145, aether: 55, supply: 2 },
  requires: ['AH_CHRONO_LAB'],
  description: 'A mechanical caster utilizing a localized temporal core to accelerate allies or slow down enemies.'
});
add('AH_NULLIFIER', 'Nullifier', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 380, attackType: 'MAGIC',
  cost: { gold: 175, aether: 75, supply: 2 },
  requires: ['AH_CHRONO_LAB'],
  description: 'An anti-magic node that creates fields disrupting spellcasting and draining magical energy.'
});
add('AH_COLOSSUS', 'Scrap Colossus', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 1100, armor: 6, damage: [25, 35],
  cost: { gold: 390, aether: 175, supply: 5 },
  requires: ['AH_REACTOR'],
  description: 'A massive three-legged titan equipped with heat-rays that melt columns of enemy forces.'
});
add('AH_BRASS_AVIATOR', 'Brass Aviator', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 420, attackRange: 8,
  cost: { gold: 225, aether: 85, supply: 3 },
  requires: ['AH_HANGAR'],
  description: 'A light copper plane that drops explosive payloads and scouts enemy territory.'
});
add('AH_STEAM_GOLEM', 'Steam Golem', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 900, armor: 4,
  cost: { gold: 290, aether: 75, supply: 4 },
  requires: ['AH_STEAM_PLANT'],
  description: 'A heavy pneumatic iron golem designed to crush obstacles with giant steam-powered fists.'
});
add('AH_MECHANIZED_SCOUT', 'Mechanized Scout', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 320, moveSpeed: 10.0,
  cost: { gold: 95, aether: 5, supply: 1 },
  requires: ['AH_WORKSHOP'],
  description: 'A rapid gyroscopic wheel-bot designed for lightning-fast reconnaissance and skirmishes.'
});
add('AH_PYROCLASTIC_MACHINE', 'Pyroclastic Machine', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 480, attackType: 'SIEGE',
  cost: { gold: 175, aether: 65, supply: 3 },
  requires: ['AH_MUNITIONS_DEPOT'],
  description: 'A combustion-based tank spraying streams of burning petroleum over enemy ranks.'
});
add('AH_STEEL_CHARGER', 'Steel Charger', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 550, moveSpeed: 9.2,
  cost: { gold: 155, aether: 15, supply: 2 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A motorized clockwork ram built to smash into battle formations and cause chaos.'
});
add('AH_FORGE_SENTINEL', 'Forge Sentinel', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 650, damage: [18, 24],
  cost: { gold: 205, aether: 35, supply: 3 },
  requires: ['AH_BRASS_FORGE'],
  description: 'A heavy metal welding unit repurposed for front-line defensive engagements.'
});
add('AH_SHOCK_SENTINEL', 'Shock Sentinel', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 360, attackType: 'MAGIC',
  cost: { gold: 145, aether: 45, supply: 2 },
  requires: ['AH_TESLA_TOWER'],
  description: 'A mobile lightning capacitor designed to bounce high-voltage arcs across enemy squads.'
});
add('AH_OVERCHARGED_CORE', 'Overcharged Core', 'ARTIFICE_HORDE', ARCHETYPE.RANGED, {
  hp: 600, attackType: 'MAGIC',
  cost: { gold: 275, aether: 125, supply: 4 },
  requires: ['AH_REACTOR'],
  description: 'An unstable mobile reactor that unleashes high-energy plasma blasts at the cost of core heat.'
});
add('AH_TINKER_HERO', 'Clockwork Tinker', 'ARTIFICE_HORDE', ARCHETYPE.MELEE, {
  hp: 850, armor: 5, damage: [22, 28],
  cost: { gold: 310, aether: 95, supply: 4 },
  requires: ['AH_CLOCKWORK_SPIRE'],
  description: 'A legendary master engineer piloting a steam-powered battle suit loaded with weaponry.'
});

// Buildings
add('AH_NEXUS', 'Nexus', 'ARTIFICE_HORDE', ARCHETYPE.HALL, {
  cost: { gold: 375, aether: 0, supply: 0 },
  description: 'The main clockwork motherboard coordinating drone networks and recycling scrap.'
});
add('AH_DEN', 'Stalker Den', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 165, aether: 35, supply: 0 },
  description: 'An assembly scrapyard where buzzsaws are fitted to rippers and basic gears are cast.'
});
add('AH_OBELISK', 'Obelisk', 'ARTIFICE_HORDE', ARCHETYPE.SUPPLY, {
  cost: { gold: 80, aether: 10, supply: 0 },
  providesSupply: 12,
  description: 'A minor power tower radiating energy lines to keep local machinery active.'
});
add('AH_WORKSHOP', 'Workshop', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 105, aether: 25 },
  description: 'A vehicle garage supporting the assembly of mechanized scouts and repair drones.'
});
add('AH_ASSEMBLY_LINE', 'Assembly Line', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 165, aether: 55 },
  requires: ['AH_DEN'],
  description: 'A conveyor belt factory that optimizes and speeds up soldier assembly.'
});
add('AH_TESLA_TOWER', 'Tesla Tower', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 65 },
  requires: ['AH_DEN'],
  description: 'A static tower housing a large electric coil to shock hostiles and research tesla tech.'
});
add('AH_GENERATOR', 'Power Generator', 'ARTIFICE_HORDE', ARCHETYPE.SUPPLY, {
  providesSupply: 4,
  cost: { gold: 55, aether: 15 },
  description: 'An auxiliary generator that burns coal to provide a small boost to local grid capacity.'
});
add('AH_STEAM_PLANT', 'Steam Plant', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 75 },
  requires: ['AH_WORKSHOP'],
  description: 'A high-pressure boiler house that powers steam hulks and golems.'
});
add('AH_FOUNDRY', 'Scrap Foundry', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 35 },
  description: 'A smelting furnace where serrated gears and brass armor upgrades are researched.'
});
add('AH_CLOCKWORK_SPIRE', 'Clockwork Spire', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 215, aether: 95 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A high brass clocktower containing blueprints for the clockwork tinker and chronomancy.'
});
add('AH_MUNITIONS_DEPOT', 'Munitions Depot', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 155, aether: 45 },
  requires: ['AH_FOUNDRY'],
  description: 'A storehouse of gunpowders and chemicals to manufacture heavy bombard weaponry.'
});
add('AH_GEAR_TOWER', 'Gear Tower', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 95, aether: 15 },
  description: 'A mechanical tower launching spinning razor-sharp buzzsaws at incoming enemies.'
});
add('AH_REPAIR_STATION', 'Repair Station', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 35 },
  requires: ['AH_WORKSHOP'],
  description: 'A diagnostic station deploying micro-nanites to repair nearby constructs.'
});
add('AH_CHRONO_LAB', 'Chrono Lab', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 185, aether: 85 },
  requires: ['AH_CLOCKWORK_SPIRE'],
  description: 'A research spire dedicated to temporal mechanics and dimensional warping.'
});
add('AH_BRASS_FORGE', 'Brass Forge', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 55 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A heavy metal foundry that casts thick plating for forge sentinels.'
});
add('AH_AUTOMATON_FACTORY', 'Automaton Factory', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 205, aether: 105 },
  requires: ['AH_ASSEMBLY_LINE'],
  description: 'A logic-core scripting facility for manufacturing autonomous constructs.'
});
add('AH_IRON_DOME', 'Iron Dome', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 155, aether: 45 },
  description: 'An automated flak battery that fires explosive shrapnel shells at air targets.'
});
add('AH_STEAM_SPIRE', 'Steam Spire', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 135, aether: 25 },
  description: 'An exhaust tower that vents hot steam to damage adjacent ground attackers.'
});
add('AH_LIGHTNING_ROD', 'Lightning Rod', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 115, aether: 35 },
  description: 'A lightning collector that stores atmospheric electricity to charge unit batteries.'
});
add('AH_SCRAP_YARD', 'Scrap Yard', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 85, aether: 0 },
  description: 'A dumping yard where raw metal resources are refined for unit cost reductions.'
});
add('AH_BATTERY', 'Energy Battery', 'ARTIFICE_HORDE', ARCHETYPE.SUPPLY, {
  providesSupply: 10,
  cost: { gold: 105, aether: 35 },
  description: 'A major energy storage node providing substantial grid headroom.'
});
add('AH_REACTOR', 'Aether Reactor', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 245, aether: 145 },
  requires: ['AH_CLOCKWORK_SPIRE'],
  description: 'A nuclear fusion reactor that unlocks colossi and overcharged core tech.'
});
add('AH_HANGAR', 'Brass Hangar', 'ARTIFICE_HORDE', ARCHETYPE.BARRACKS, {
  cost: { gold: 225, aether: 115 },
  requires: ['AH_STEAM_PLANT'],
  description: 'An airfield and workshop for constructing brass aviators.'
});


// ── TERRA BORN ENTITIES (23 Units + 23 Buildings) ────────────────────────────
// Units
add('TB_GOLEMLING', 'Golemling', 'TERRA_BORN', ARCHETYPE.WORKER, {
  cost: { gold: 80, aether: 0, supply: 1 },
  description: 'A small stone elemental shaped from loose clay, harvesting minerals for its creators.'
});
add('TB_BRUTE', 'Basalt Brute', 'TERRA_BORN', ARCHETYPE.MELEE, {
  damage: [15, 20], attackSpeed: 1.7, armorType: 'HEAVY',
  cost: { gold: 145, aether: 0, supply: 2 },
  description: 'A massive basalt construct containing glowing lava veins, striking with solid fists.'
});
add('TB_SHARDCASTER', 'Shardcaster', 'TERRA_BORN', ARCHETYPE.RANGED, {
  projectile: { speed: 22 },
  cost: { gold: 150, aether: 20, supply: 2 },
  description: 'A crystal-infused golem that shoots high-velocity glass shards to lacerate flesh.'
});
add('TB_STONE_CRUSHER', 'Stone Crusher', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 500,
  cost: { gold: 135, aether: 0, supply: 2 },
  description: 'An earth-born giant wielding a dense stone club designed to shatter defensive shields.'
});
add('TB_OBSIDIAN_SHARD', 'Obsidian Shard', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 420, damage: [18, 22],
  cost: { gold: 135, aether: 15, supply: 2 },
  requires: ['TB_MAGMA_CHAMBER'],
  description: 'A walking chunk of razor obsidian, leaving deep bleeding gashes with each slice.'
});
add('TB_MUD_ELEMENTAL', 'Mud Elemental', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 480,
  cost: { gold: 125, aether: 5, supply: 2 },
  requires: ['TB_MUD_POOL'],
  description: 'A swampy rock creature that slows down the movement speed of any unit it hits.'
});
add('TB_GRAVEL_HURLER', 'Gravel Hurler', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 280, attackRange: 9.5,
  cost: { gold: 125, aether: 25, supply: 2 },
  requires: ['TB_SEISMIC_PILLAR'],
  description: 'An elemental slinging gravel clumps that scatter and disrupt groups of enemies.'
});
add('TB_TREMOR_BEAST', 'Tremor Beast', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 820, armor: 4,
  cost: { gold: 225, aether: 45, supply: 3 },
  requires: ['TB_QUAKE_ENGINE'],
  description: 'A heavy quadruped elemental whose stomps generate minor seismic waves, damaging nearby ground units.'
});
add('TB_MOUNTAIN_GIANT', 'Mountain Giant', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 1200, armor: 6, damage: [26, 36],
  cost: { gold: 410, aether: 175, supply: 5 },
  requires: ['TB_MOUNTAIN_VAULT'],
  description: 'An ancient mountain colossus that tears up trees and boulders to level fortresses.'
});
add('TB_CRYSTAL_HEALER', 'Crystal Healer', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 240, mana: 100,
  cost: { gold: 125, aether: 45, supply: 2 },
  requires: ['TB_CRYSTAL_MATRIX'],
  description: 'A shimmering geode golem channelling crystalline light to knit cracked stone back together.'
});
add('TB_GEODE_LURKER', 'Geode Lurker', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 550, damage: [20, 26],
  cost: { gold: 155, aether: 35, supply: 2 },
  requires: ['TB_GEODE_MINE'],
  description: 'An crystalline arachnid that burrows underground and springs up to ambush targets.'
});
add('TB_LAVA_SPITTER', 'Lava Spitter', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 320, attackRange: 9.0, attackType: 'MAGIC',
  cost: { gold: 145, aether: 45, supply: 2 },
  requires: ['TB_LAVA_FORGE'],
  description: 'A fire-infused elemental that shoots balls of superheated liquid rock.'
});
add('TB_BOULDER_HURLER', 'Boulder Hurler', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 400, attackRange: 11, attackType: 'SIEGE',
  cost: { gold: 195, aether: 75, supply: 3 },
  requires: ['TB_SEISMIC_PILLAR'],
  description: 'A siege-class rock thrower throwing massive boulders that crash through castle walls.'
});
add('TB_GRANITE_SHIELD', 'Granite Shield', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 580, armor: 5,
  cost: { gold: 165, aether: 5, supply: 2 },
  requires: ['TB_SEISMIC_PILLAR'],
  description: 'A runic barrier golem carrying a giant granite slab, acting as a walking wall.'
});
add('TB_IRONSTONE_GARGOYLE', 'Ironstone Gargoyle', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 450, attackRange: 8.5,
  cost: { gold: 205, aether: 65, supply: 3 },
  requires: ['TB_PEBBLE_NEST'],
  description: 'A flying stone demon that drops down to strike and turns to solid stone to heal.'
});
add('TB_SAND_WEAVER', 'Sand Weaver', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 260,
  cost: { gold: 115, aether: 25, supply: 2 },
  requires: ['TB_MUD_POOL'],
  description: 'An elemental summoner that whips up sandstorms to blind and disorient foes.'
});
add('TB_CORE_GUARDIAN', 'Core Guardian', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 700, armor: 4,
  cost: { gold: 215, aether: 55, supply: 3 },
  requires: ['TB_CORE_REACTOR'],
  description: 'An elite sentinel of the molten core, infused with defensive runic markings.'
});
add('TB_EARTHSHAKER', 'Earthshaker', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 1000, damage: [22, 30],
  cost: { gold: 345, aether: 115, supply: 4 },
  requires: ['TB_QUAKE_ENGINE'],
  description: 'A walking tectonic ram that shatters structural integrity with heavy charging strikes.'
});
add('TB_MAGMA_LORD', 'Magma Lord', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 950, damage: [24, 32], attackType: 'MAGIC',
  cost: { gold: 375, aether: 135, supply: 4 },
  requires: ['TB_LAVA_FORGE'],
  description: 'A volcanic lord channeling raw underground heat to incinerate whole divisions.'
});
add('TB_DUST_SPRITE', 'Dust Sprite', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 200, moveSpeed: 9.0,
  cost: { gold: 85, aether: 15, supply: 1 },
  requires: ['TB_EARTH_ALTAR'],
  description: 'A fast-moving spirit of loose dust and sand, useful for spotting enemy placements.'
});
add('TB_STALAGMITE_SENTINEL', 'Stalag Sentinel', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 380, attackRange: 10,
  cost: { gold: 135, aether: 15, supply: 2 },
  requires: ['TB_SEISMIC_PILLAR'],
  description: 'A jagged stone spire on legs that shoots needle-like stalagmites at flying targets.'
});
add('TB_AETHER_GOLEM', 'Aether Golem', 'TERRA_BORN', ARCHETYPE.MELEE, {
  hp: 1150, armor: 6, damage: [26, 36],
  cost: { gold: 425, aether: 185, supply: 5 },
  requires: ['TB_AETHER_SPIRE'],
  description: 'A colossal golem powered by a pure raw Aether crystal, radiating a heavy magical field.'
});
add('TB_TERRA_ARCHON', 'Terra Archon', 'TERRA_BORN', ARCHETYPE.RANGED, {
  hp: 800, attackRange: 9.5, attackType: 'MAGIC',
  cost: { gold: 395, aether: 155, supply: 4 },
  requires: ['TB_TERRAN_MONOLITH'],
  description: 'An avatar of the earth itself, channeling tectonic layline currents into beams of pure force.'
});

// Buildings
add('TB_CORE', 'Molten Core', 'TERRA_BORN', ARCHETYPE.HALL, {
  cost: { gold: 390, aether: 0, supply: 0 },
  description: 'The molten chamber of the earth-mind. Coordinates construct activity and processes minerals.'
});
add('TB_FORGE', 'Ember Forge', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 35, supply: 0 },
  description: 'A pool of liquid magma where basalt rock is heated and shaped into basic brutes.'
});
add('TB_CONDUIT', 'Aether Conduit', 'TERRA_BORN', ARCHETYPE.SUPPLY, {
  cost: { gold: 85, aether: 5, supply: 0 },
  providesSupply: 12,
  description: 'A large glowing earth crystal channeling leyline energy to support a larger army.'
});
add('TB_STONE_WALL', 'Stone Wall', 'TERRA_BORN', ARCHETYPE.SUPPLY, {
  providesSupply: 4,
  cost: { gold: 45, aether: 0 },
  description: 'A thick basalt wall erected to partition off territorial borders.'
});
add('TB_EARTH_SPIRE', 'Earth Spire', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 115, aether: 25 },
  description: 'A runic obelisk that summons basic golems and gravel hurlers.'
});
add('TB_BASALT_TOWER', 'Basalt Tower', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 155, aether: 55 },
  description: 'A defensive tower that fires balls of molten basalt at land and air targets.'
});
add('TB_MAGMA_CHAMBER', 'Magma Chamber', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 185, aether: 75 },
  requires: ['TB_FORGE'],
  description: 'A chamber designed to harvest lava heat, unlocking obsidian shards and magma upgrades.'
});
add('TB_CRYSTAL_MATRIX', 'Crystal Matrix', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 85 },
  requires: ['TB_FORGE'],
  description: 'A geometric alignment of crystal clusters that trains crystal healers.'
});
add('TB_GEODE_MINE', 'Geode Mine', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 135, aether: 35 },
  description: 'A mine shaft digging deep into crystalline veins, unlocking geode lurkers.'
});
add('TB_QUAKE_ENGINE', 'Quake Engine', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 215, aether: 105 },
  requires: ['TB_EARTH_SPIRE'],
  description: 'A heavy mechanical hammer that vibrates the ground to awaken tremor beasts.'
});
add('TB_OBSIDIAN_PILLAR', 'Obsidian Pillar', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 45 },
  description: 'A defensive pillar firing razor-sharp obsidian shards at high speeds.'
});
add('TB_GRANITE_KEEP', 'Granite Keep', 'TERRA_BORN', ARCHETYPE.HALL, {
  hp: 2600,
  cost: { gold: 295, aether: 95 },
  requires: ['TB_CORE'],
  description: 'Tier 2 upgrade of the Molten Core. Increases structural hit points and unlocks advanced tech.'
});
add('TB_MUD_POOL', 'Mud Pool', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 105, aether: 15 },
  description: 'A geothermal mud geyser that breeds mud elementals and sand weavers.'
});
add('TB_MOUNTAIN_VAULT', 'Mountain Vault', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 225, aether: 125 },
  requires: ['TB_FORGE'],
  description: 'A vault filled with ancient relics, enabling the summoning of Mountain Giants.'
});
add('TB_AETHER_SPIRE', 'Aether Spire', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 95 },
  requires: ['TB_FORGE'],
  description: 'A spire that taps into atmospheric magic to summon Aether Golems.'
});
add('TB_CORE_REACTOR', 'Core Reactor', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 205, aether: 115 },
  requires: ['TB_MAGMA_CHAMBER'],
  description: 'A magical core tapping planetary warmth to fuel core guardians.'
});
add('TB_TERRAN_MONOLITH', 'Terran Monolith', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 235, aether: 135 },
  requires: ['TB_QUAKE_ENGINE'],
  description: 'A sacred monolith of the earth, required to invoke the Terra Archon.'
});
add('TB_SEISMIC_PILLAR', 'Seismic Pillar', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 45 },
  requires: ['TB_EARTH_SPIRE'],
  description: 'A tuning pillar that coordinates sand shamans, gravel slingers, and granite shields.'
});
add('TB_PEBBLE_NEST', 'Pebble Nest', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 135, aether: 40 },
  description: 'A cliffside structure nesting gargoyles and other flying stone constructs.'
});
add('TB_EARTH_ALTAR', 'Earth Altar', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 35 },
  description: 'An elemental ritual circle that summons dust sprites.'
});
add('TB_GRAVEL_PIT', 'Gravel Pit', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 85, aether: 0 },
  description: 'A quarry area supplying stone shards, reducing construct gold costs.'
});
add('TB_SAND_WALL', 'Sand Wall', 'TERRA_BORN', ARCHETYPE.SUPPLY, {
  providesSupply: 3,
  cost: { gold: 35, aether: 10 },
  description: 'A loose earthen wall designed to quickly funnel enemy ground units.'
});
add('TB_LAVA_FORGE', 'Lava Forge', 'TERRA_BORN', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 65 },
  requires: ['TB_MAGMA_CHAMBER'],
  description: 'A forge tapping magma heat to train lava spitters and magma lords.'
});


// ── CHAOS DEEP ENTITIES (23 Units + 23 Buildings) ────────────────────────────
// Units
add('CD_DREDGER', 'Larval Dredger', 'CHAOS_DEEP', ARCHETYPE.WORKER, {
  cost: { gold: 70, aether: 0, supply: 1 },
  description: 'A writhing grub that digests gold and aether and spits them back at the drop-off hive.'
});
add('CD_RIFTFIEND', 'Rift-Fiend', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 160, damage: [8, 11], attackSpeed: 0.9,
  cost: { gold: 45, aether: 0, supply: 1 },
  description: 'A tiny, scuttling claw-bug that attacks in massive swarms to tear down infantry.'
});
add('CD_NEEDLESTRIDER', 'Needle-Strider', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 280, attackRange: 8.5, attackType: 'PIERCE',
  cost: { gold: 125, aether: 35, supply: 2 },
  requires: ['CD_STRIDERDEN'],
  description: 'A tall, spidery walker that spits high-velocity venom needles from its thorax.'
});
add('CD_PLATEDMAULER', 'Plated Mauler', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 420, armor: 2, damage: [11, 14],
  cost: { gold: 95, aether: 15, supply: 2 },
  requires: ['CD_MAULERWARREN'],
  description: 'An armored beetle with bone-crushing horns, trained to smash frontline soldiers.'
});
add('CD_SPOREMANTA', 'Spore-Manta', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 300, moveSpeed: 9.8,
  cost: { gold: 135, aether: 75, supply: 2 },
  requires: ['CD_GLIDERMOUND'],
  description: 'A floating airborne ray that drops heavy clouds of toxic corrosive spores.'
});
add('CD_IMPALER', 'Lurking Impaler', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 450, attackRange: 9.0, damage: [18, 24], attackType: 'NORMAL',
  cost: { gold: 195, aether: 95, supply: 3 },
  requires: ['CD_IMPALERDEN'],
  description: 'A subterranean worm that extends spiked tentacles from underground to impale targets.'
});
add('CD_BILEVESSEL', 'Bile-Vessel', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 200, damage: [30, 45], attackType: 'SIEGE',
  cost: { gold: 70, aether: 20, supply: 1 },
  requires: ['CD_BURSTERNEST'],
  description: 'A bloated insect filled with highly unstable acidic bile that explodes on impact.'
});
add('CD_DREADBEHEMOTH', 'Dread-Behemoth', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 1000, armor: 5, damage: [24, 34],
  cost: { gold: 370, aether: 150, supply: 5 },
  requires: ['CD_DREADCAVERN'],
  description: 'A massive chitinous titan equipped with scythe-claws that carve through armor.'
});
add('CD_MIASMAWEAVER', 'Miasma-Weaver', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 260, mana: 100,
  cost: { gold: 145, aether: 85, supply: 2 },
  requires: ['CD_PLAGUECHAMBER'],
  description: 'A gas-weaving insect that releases choking miasma clouds to suffocate enemy armies.'
});
add('CD_PARASITICWEAVER', 'Parasitic Weaver', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 300, mana: 120,
  cost: { gold: 155, aether: 105, supply: 2 },
  requires: ['CD_PLAGUEPOOL'],
  description: 'A spellcaster capable of infesting enemy hosts with mind-controlling parasites.'
});
add('CD_MATRIARCH', 'Brood-Matriarch', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 400, mana: 100,
  cost: { gold: 145, aether: 45, supply: 2 },
  requires: ['CD_MATRIARCHNEST'],
  description: 'A bloated queen that lays small combat grubs to fight and distract hostiles.'
});
add('CD_BILEDART', 'Bile-Dart', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 120, damage: [50, 70], attackType: 'MAGIC',
  cost: { gold: 55, aether: 35, supply: 1 },
  requires: ['CD_GLIDERMOUND'],
  description: 'A winged suicide flyer that rockets into air targets, exploding in a shower of acid.'
});
add('CD_ABYSSALWATCHER', 'Abyssal Watcher', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 450, sightRadius: 15,
  cost: { gold: 145, aether: 45, supply: 0 },
  requires: ['CD_ADAPTATIONVAULT'],
  description: 'A floating optical eye that reveals wide areas and exposes invisible threats.'
});
add('CD_SPORELASHER', 'Spore-Lasher', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 480, armor: 2,
  cost: { gold: 175, aether: 85, supply: 2 },
  requires: ['CD_GLIDERMOUND'],
  description: 'A floating jelly that shoots rapid toxic spikes from its undulating tentacles.'
});
add('CD_BILECASTER', 'Bile-Caster', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 360, damage: [14, 19],
  cost: { gold: 145, aether: 55, supply: 3 },
  requires: ['CD_MAULERWARREN'],
  description: 'A backline launcher hurling globes of corrosive acid that melt armor types.'
});
add('CD_BROODCARRIER', 'Brood-Carrier', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 400,
  cost: { gold: 185, aether: 75, supply: 3 },
  requires: ['CD_PLAGUEPOOL'],
  description: 'An organic mobile incubator that releases scuttling sporeling larvae upon death.'
});
add('CD_SWARMMONARCH', 'Swarm-Monarch', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 550, attackRange: 10,
  cost: { gold: 290, aether: 190, supply: 4 },
  requires: ['CD_MONARCHMOUND'],
  description: 'A sovereign commander of the Deep swarm, directing combat nodes with synaptic links.'
});
add('CD_GRIPFIEND', 'Grip-Fiend', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 280, mana: 150,
  cost: { gold: 190, aether: 110, supply: 3 },
  requires: ['CD_PLAGUEPOOL'],
  description: 'A web-spinning arachnid that traps fast-moving units and locks them in place.'
});
add('CD_PLAGUETHRALL', 'Plague-Thrall', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 200,
  cost: { gold: 75, aether: 0, supply: 1 },
  requires: ['CD_PLAGUEPOOL'],
  description: 'An infected walking host that spreads disease and decay in enemy lines.'
});
add('CD_APEXTYRANT', 'Apex Tyrant', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 900, armor: 4, damage: [25, 32],
  cost: { gold: 340, aether: 140, supply: 4 },
  requires: ['CD_MUTAGENICSANCTUM'],
  description: 'A giant apex predator beast that hyper-regenerates tissue and tears down infantry.'
});
add('CD_CHASMWORM', 'Chasm-Worm', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 600,
  cost: { gold: 145, aether: 45, supply: 2 },
  requires: ['CD_RIFTNETWORK'],
  description: 'A massive centipede tunnel-borer that transports allied swarm units across the map.'
});
add('CD_SPORELING', 'Sporeling', 'CHAOS_DEEP', ARCHETYPE.MELEE, {
  hp: 100, damage: [6, 9], moveSpeed: 9.5,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'A tiny, fragile spawnling hatched from host units to swarm enemy targets.'
});
add('CD_SWARMSENTINEL', 'Swarm Sentinel', 'CHAOS_DEEP', ARCHETYPE.RANGED, {
  hp: 420, attackRange: 11, attackType: 'PIERCE',
  cost: { gold: 215, aether: 115, supply: 3 },
  requires: ['CD_MONARCHMOUND'],
  description: 'A heavy carapace insect serving as a mobile organic battery turret.'
});

// Buildings
add('CD_INCUBATOR', 'Incubation Chamber', 'CHAOS_DEEP', ARCHETYPE.HALL, {
  cost: { gold: 370, aether: 0, supply: 0 },
  description: 'The central hatching hive. Synaptically manages larvae and gathers organic tissue.'
});
add('CD_GESTATIONPIT', 'Gestational Pit', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 160, aether: 30, supply: 0 },
  description: 'A squelching pit where generic larvae mutate into rift-fiends and beetles.'
});
add('CD_SPORESACK', 'Spore-Sack', 'CHAOS_DEEP', ARCHETYPE.SUPPLY, {
  cost: { gold: 80, aether: 0, supply: 0 },
  providesSupply: 12,
  description: 'An inflated biological air sack providing breathable spores and supply capacity.'
});
add('CD_GROWTHCITADEL', 'Growth Citadel', 'CHAOS_DEEP', ARCHETYPE.HALL, {
  hp: 2400,
  cost: { gold: 245, aether: 95 },
  requires: ['CD_INCUBATOR'],
  description: 'Tier 2 hive expansion. Enables mutated organs and advanced larva strains.'
});
add('CD_BROODTHRONE', 'Brood Throne', 'CHAOS_DEEP', ARCHETYPE.HALL, {
  hp: 3400,
  cost: { gold: 345, aether: 175 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'Tier 3 synapse throne. Connects the entire hivemind to access titanic units.'
});
add('CD_ADAPTATIONVAULT', 'Adaptation Vault', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 115, aether: 0 },
  description: 'An organic organ gland researching chitinous armor and spike mutations.'
});
add('CD_SPORESENTRY', 'Spore Sentry', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 105, aether: 15 },
  requires: ['CD_ADAPTATIONVAULT'],
  description: 'A biological spire that fires high-velocity calcified bone spurs at hostiles.'
});
add('CD_IMPALINGSINE', 'Impaling Spine', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 5 },
  requires: ['CD_GESTATIONPIT'],
  description: 'A burrowed organic spine tower that impales ground trespassers.'
});
add('CD_MAULERWARREN', 'Mauler Warren', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 145, aether: 35 },
  requires: ['CD_GESTATIONPIT'],
  description: 'A tunnel nest housing plated beetles and bile casters.'
});
add('CD_STRIDERDEN', 'Strider Den', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 75 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'A breeding ground for needle-striders and specialized shooters.'
});
add('CD_IMPALERDEN', 'Impaler Den', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 95 },
  requires: ['CD_STRIDERDEN'],
  description: 'A nesting chamber that hatches subterranean impaler worms.'
});
add('CD_GLIDERMOUND', 'Glider Mound', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 215, aether: 115 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'High organic cliffs containing cocoons for spore mantas and bile darts.'
});
add('CD_MONARCHMOUND', 'Monarch Mound', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 245, aether: 145 },
  requires: ['CD_GLIDERMOUND', 'CD_BROODTHRONE'],
  description: 'A tall synapse spire required to breed monarch commanders.'
});
add('CD_DREADCAVERN', 'Dread Cavern', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 235, aether: 155 },
  requires: ['CD_BROODTHRONE'],
  description: 'A deep abyss cavern that incubates Dread-Behemoth titans.'
});
add('CD_PLAGUEPOOL', 'Plague Pool', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 160, aether: 90 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'A bubbling pit of acid and plague, training parasitic weavers.'
});
add('CD_BURSTERNEST', 'Burster Nest', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 125, aether: 25 },
  requires: ['CD_GESTATIONPIT'],
  description: 'A pod nesting suicidal bile-vessels.'
});
add('CD_BIOMASSNODULE', 'Biomass Nodule', 'CHAOS_DEEP', ARCHETYPE.SUPPLY, {
  providesSupply: 4,
  cost: { gold: 35, aether: 0 },
  description: 'A small tumor node providing a tiny extension to hive supply.'
});
add('CD_RIFTNETWORK', 'Rift Network', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 195, aether: 95 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'A central nexus that opens dimensional tunnels for chasm worms.'
});
add('CD_PLAGUECHAMBER', 'Plague Chamber', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 205, aether: 115 },
  requires: ['CD_BROODTHRONE'],
  description: 'A bio-gas refinery cultivating miasma weavers.'
});
add('CD_MATRIARCHNEST', 'Matriarch Nest', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 175, aether: 55 },
  requires: ['CD_GROWTHCITADEL'],
  description: 'A warm chamber designed to feed and support breeding mothers.'
});
add('CD_SIPHONINGNODE', 'Siphoning Node', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 95, aether: 0 },
  description: 'An organic node that absorbs background Aether, reducing biological costs.'
});
add('CD_MUTAGENICSANCTUM', 'Mutagenic Sanctum', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 225, aether: 105 },
  requires: ['CD_PLAGUEPOOL'],
  description: 'A mutating chamber that unlocks apex tyrant genetics.'
});
add('CD_CAUSTICNEST', 'Caustic Nest', 'CHAOS_DEEP', ARCHETYPE.BARRACKS, {
  cost: { gold: 135, aether: 35 },
  description: 'A toxic tower that melts invaders with projectile streams of acid.'
});

// Neutral hostile camp units. They cost no supply because they are not trained.
add('NH_MARAUDER', 'Neutral Marauder', 'NEUTRAL_HOSTILE', ARCHETYPE.MELEE, {
  hp: 360, damage: [10, 14], armor: 1, moveSpeed: 7.4,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'A rogue bandit marauding the pathways of the Throne.'
});
add('NH_STALKER', 'Neutral Stalker', 'NEUTRAL_HOSTILE', ARCHETYPE.MELEE, {
  hp: 280, damage: [8, 12], attackSpeed: 1.05, armorType: 'LIGHT', moveSpeed: 9.0,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'A fast highway thief waiting to strike at vulnerable scouts.'
});
add('NH_SENTINEL', 'Neutral Sentinel', 'NEUTRAL_HOSTILE', ARCHETYPE.RANGED, {
  hp: 260, damage: [13, 18], attackRange: 8.5, sightRadius: 12,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'An independent sniper guarding ancient ruins.'
});
add('NH_MYSTIC', 'Neutral Mystic', 'NEUTRAL_HOSTILE', ARCHETYPE.RANGED, {
  hp: 300, mana: 100, damage: [15, 22], attackType: 'MAGIC', attackRange: 9.5,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'A rogue hermit casting chaotic arcane spells.'
});
add('NH_BEHEMOTH', 'Neutral Behemoth', 'NEUTRAL_HOSTILE', ARCHETYPE.MELEE, {
  hp: 820, damage: [20, 30], armor: 4, armorType: 'HEAVY', moveSpeed: 6.2, radius: 0.8,
  cost: { gold: 0, aether: 0, supply: 0 },
  description: 'A massive wild creature guarding golden troves.'
});

const typesObj = {};
for (const item of typesList) {
  typesObj[item.id] = makeType(item.id, item.name, item.race, item.arch, item.overrides);
}

export const UNIT_TYPES = Object.freeze(typesObj);

/**
 * Look up a unit type, throwing on unknown ids so typos fail fast.
 * @param {string} typeId
 * @returns {object}
 */
export function getUnitType(typeId) {
  const type = UNIT_TYPES[typeId];
  if (!type) throw new Error(`Unknown unit type: ${typeId}`);
  return type;
}
