/**
 * Races — the three playable factions of Aether Throne.
 *
 * Each race maps abstract roles (worker/melee/ranged, hall/barracks/supply)
 * to concrete unit type ids defined in UnitTypes.js. Systems that need "a
 * worker for player P" resolve it through this table, which keeps race
 * asymmetry data-driven.
 */

export const RACES = {
  BIO_HUMAN: {
    id: 'BIO_HUMAN',
    name: 'Bio Human',
    tagline: 'Disciplined crusaders of the bio-throne',
    description:
      'Balanced, armored, and biological. The Humans field durable frontlines ' +
      'backed by precise arbalest volleys.',
    /** Accent color used by the lobby UI (player color still comes from slot). */
    themeColor: '#4da6ff',
    units: {
      worker: 'BH_ACOLYTE',
      melee: 'BH_TEMPLAR',
      ranged: 'BH_ARBALIST',
    },
    buildings: {
      hall: 'BH_CITADEL',
      barracks: 'BH_BASTION',
      supply: 'BH_SANCTUM',
    },
  },

  ARTIFICE_HORDE: {
    id: 'ARTIFICE_HORDE',
    name: 'Artifice Horde',
    tagline: 'Gears and scrap from the outer worlds',
    description:
      'Fragile but blisteringly fast mechanical army. Win through speed, ' +
      'automaton assembly, and clockwork precision.',
    themeColor: '#b06ef2',
    units: {
      worker: 'AH_THRALL',
      melee: 'AH_RIPPER',
      ranged: 'AH_WEAVER',
    },
    buildings: {
      hall: 'AH_NEXUS',
      barracks: 'AH_DEN',
      supply: 'AH_OBELISK',
    },
  },

  TERRA_BORN: {
    id: 'TERRA_BORN',
    name: 'Terra Born',
    tagline: 'Living stone awakened by the earth',
    description:
      'Slow, massive, and nearly unbreakable. Trade speed for raw ' +
      'staying power, volcanic lava, and heavy stone.',
    themeColor: '#ff8a3d',
    units: {
      worker: 'TB_GOLEMLING',
      melee: 'TB_BRUTE',
      ranged: 'TB_SHARDCASTER',
    },
    buildings: {
      hall: 'TB_CORE',
      barracks: 'TB_FORGE',
      supply: 'TB_CONDUIT',
    },
  },

  CHAOS_DEEP: {
    id: 'CHAOS_DEEP',
    name: 'Chaos Deep',
    tagline: 'The creeping insectoid swarm of the abyss',
    description:
      'Fleshy and biological. Chaos Deep overwhelms the battlefield ' +
      'with fast, organic units, acid spits, and hyper-regeneration.',
    themeColor: '#4dff4d',
    units: {
      worker: 'CD_DREDGER',
      melee: 'CD_RIFTFIEND',
      ranged: 'CD_NEEDLESTRIDER',
    },
    buildings: {
      hall: 'CD_INCUBATOR',
      barracks: 'CD_GESTATIONPIT',
      supply: 'CD_SPORESACK',
    },
  },
};

/** Ordered list of race ids for UI cycling. */
export const RACE_IDS = Object.keys(RACES);

/**
 * Resolve a role ('worker'|'melee'|'ranged'|'hall'|'barracks'|'supply')
 * to a concrete unit type id for the given race.
 * @param {string} raceId
 * @param {string} role
 * @returns {string} unit type id
 */
export function getRaceTypeId(raceId, role) {
  const race = RACES[raceId];
  if (!race) throw new Error(`Unknown race: ${raceId}`);
  return race.units[role] ?? race.buildings[role];
}
