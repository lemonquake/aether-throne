/**
 * GameConfig — every global tuning constant in one place.
 *
 * Design rule: no magic numbers inside systems. If a value could plausibly be
 * tweaked during balancing or perf work, it lives here.
 */

export const GAME_CONFIG = {
  MAX_PLAYERS: 10,

  /** Simulation & update cadence */
  SIM: {
    /** Clamp render-loop delta so a background tab doesn't teleport units. */
    MAX_DELTA: 0.05,
    /** How often (Hz) the fog-of-war texture is restamped. */
    FOG_UPDATE_HZ: 10,
    /** Seconds between victory-condition sweeps. */
    VICTORY_CHECK_INTERVAL: 2.0,
    /** Seconds between HUD store syncs (resources/clock/fps). */
    HUD_SYNC_INTERVAL: 0.2,
  },

  /** Map dimensions in world units. Origin is the map center. */
  MAP: {
    WIDTH: 400,
    DEPTH: 400,
    /** Start locations sit on a circle of this radius around the center. */
    BASE_RING_RADIUS: 160,
  },

  /** Classic RTS camera tuning. */
  CAMERA: {
    FOV: 45,
    NEAR: 1,
    FAR: 600,
    MIN_HEIGHT: 18,
    MAX_HEIGHT: 85,
    START_HEIGHT: 42,
    /**
     * The camera looks at a focus point on the ground from an offset of
     * (0, height, height * OFFSET_RATIO) — i.e. pitch stays constant while
     * zooming, like WC3.
     */
    OFFSET_RATIO: 0.7,
    /** Pixels from the screen edge that trigger edge-scrolling. */
    EDGE_SIZE: 14,
    /** World units/sec of edge scroll at reference height (40). Scales with zoom. */
    EDGE_SPEED: 42,
    /** World units of height change per wheel notch. */
    ZOOM_STEP: 6,
    /** Seconds for the GSAP zoom/pan ease. */
    ZOOM_EASE: 0.25,
    /** Multiplier converting middle-drag pixels into world units. */
    DRAG_SPEED: 0.08,
    /** Focus point is clamped this far inside the map edge. */
    BOUNDS_MARGIN: 6,
  },

  /** Fog of war. */
  FOG: {
    /** Texels per side of the fog data texture covering the whole map. */
    RESOLUTION: 256,
    /** Ground brightness for "explored but not currently visible" (grey layer). */
    EXPLORED_BRIGHTNESS: 0.35,
    /** Ground brightness for never-explored (black layer). */
    UNEXPLORED_BRIGHTNESS: 0.04,
  },

  /** Economy defaults. */
  ECONOMY: {
    STARTING_GOLD: 500,
    STARTING_AETHER: 150,
    SUPPLY_CAP_MAX: 100,
    /** Resources carried per gather trip. */
    GOLD_PER_TRIP: 10,
    AETHER_PER_TRIP: 8,
    /** Seconds a worker spends harvesting at the node per trip. */
    HARVEST_TIME: 2.0,
    /** Starting stock of each resource node. */
    GOLD_MINE_AMOUNT: 12000,
    AETHER_WELL_AMOUNT: 6000,
    /** Builder repair (WC3-style): hp restored per second per repairing worker. */
    REPAIR_HP_PER_SEC: 45,
    /** Gold drained per second while repairing a completed building (0 = free). */
    REPAIR_GOLD_PER_SEC: 2,
    /** Extra construction seconds shaved per second by a worker assisting a
     *  half-built structure. Scaffolds do not progress without builders. */
    REPAIR_CONSTRUCT_BOOST: 1.0,
  },

  /** Combat globals (WC3-style armor formula lives in UnitTypes.js). */
  COMBAT: {
    /** WC3 armor constant: reduction = armor*k / (1 + armor*k). */
    ARMOR_FACTOR: 0.06,
    /** Units auto-acquire targets within sightRadius; attack once in range. */
    ACQUIRE_HYSTERESIS: 2.0,
    /** Micro-AI retreat threshold (fraction of max HP). */
    RETREAT_HP_FRACTION: 0.2,
    /** Seconds a fleeing unit refuses to re-engage. */
    RETREAT_LOCKOUT: 10,
    /** Projectile pool size (shared across all ranged units). */
    PROJECTILE_POOL_SIZE: 256,
  },

  /** Pathfinding / steering. */
  PATH: {
    /** Path requests resolved per frame — keeps 100+ simultaneous orders smooth.
     *  A resolved "path" is just an Arrive-target update (cheap), so a generous
     *  budget lets a full army react to one right-click on the SAME frame rather
     *  than dribbling into motion over several (the "delayed command" feel). */
    MAX_REQUESTS_PER_FRAME: 32,
    /** Yuka separation steering weight (unit crowding). */
    SEPARATION_WEIGHT: 1.6,
    /** Arrive behavior deceleration tuning. */
    ARRIVE_DECELERATION: 3,
    /** Distance at which a move order counts as complete. */
    ARRIVE_TOLERANCE: 0.8,
  },

  /** Presentation FX pools (floating text + impact/death/build effects). */
  FX: {
    /** Simultaneous floating "+N"/status texts. */
    FLOATING_TEXT_POOL: 48,
    /** Seconds a floating text takes to rise + fade. */
    FLOATING_TEXT_DURATION: 1.1,
    /** World units a floating text rises over its life. */
    FLOATING_TEXT_RISE: 3.2,
    /** Sprite width (world units) of a floating text at unit distance. */
    FLOATING_TEXT_SCALE: 3.2,
    /** Sprite scale for the smaller combat damage "-N" numbers. */
    DAMAGE_TEXT_SCALE: 2.1,
    /** Seconds a combat damage number lives (snappier than deposit text). */
    DAMAGE_TEXT_DURATION: 0.8,
    /** Simultaneous impact/death/build effect billboards. */
    EFFECT_POOL: 128,
    /** Ground blood/ichor splats kept alive at once. */
    BLOOD_DECAL_POOL: 80,
    /** Seconds a blood/ichor splat remains before fading. */
    BLOOD_DECAL_LINGER: 10.0,
    /** Max simultaneous animated corpses before the oldest is force-reaped
     *  (bounds memory — no unbounded corpse pile after a big battle). */
    CORPSE_POOL: 40,
    /** Seconds a slain unit takes to topple to the ground. */
    CORPSE_FALL_TIME: 0.5,
    /** Seconds a corpse rests on the ground before sinking away. */
    CORPSE_LINGER: 6.5,
    /** Seconds a corpse takes to sink into the ground and vanish. */
    CORPSE_SINK_TIME: 3.0,
    /** Seconds a destroyed building takes to collapse and sink. */
    RUBBLE_SINK_TIME: 1.6,
  },

  /** Starting army spawned for every player at match start. */
  STARTING_FORCES: {
    WORKERS: 5,
    MELEE: 3,
    RANGED: 2,
  },
};

/** Team identifiers. FFA players are hostile to everyone (including each other). */
export const TEAMS = {
  FFA: 'FFA',
  TEAM_1: 'TEAM_1',
  TEAM_2: 'TEAM_2',
  TEAM_3: 'TEAM_3',
  TEAM_4: 'TEAM_4',
  TEAM_5: 'TEAM_5',
  TEAM_6: 'TEAM_6',
};

export const TEAM_IDS = Object.freeze([
  TEAMS.FFA,
  TEAMS.TEAM_1,
  TEAMS.TEAM_2,
  TEAMS.TEAM_3,
  TEAMS.TEAM_4,
  TEAMS.TEAM_5,
  TEAMS.TEAM_6,
]);

export const TEAM_LABELS = {
  [TEAMS.FFA]: 'Free-For-All',
  [TEAMS.TEAM_1]: 'Team 1',
  [TEAMS.TEAM_2]: 'Team 2',
  [TEAMS.TEAM_3]: 'Team 3',
  [TEAMS.TEAM_4]: 'Team 4',
  [TEAMS.TEAM_5]: 'Team 5',
  [TEAMS.TEAM_6]: 'Team 6',
};

/** Lobby slot occupancy types. */
export const SLOT_TYPES = {
  HUMAN: 'HUMAN',
  AI: 'AI',
  CLOSED: 'CLOSED',
};

/** AI skill levels. Old EASY/MEDIUM/INSANE ids are kept as aliases below. */
export const AI_LEVELS = {
  NOOB: 'NOOB',
  CASUAL: 'CASUAL',
  PRO: 'PRO',
};

export const AI_LEVEL_LABELS = {
  [AI_LEVELS.NOOB]: 'Noob',
  [AI_LEVELS.CASUAL]: 'Casual Enjoyer',
  [AI_LEVELS.PRO]: 'Pro',
};

/** Back-compat ids accepted by older lobby configs. */
export const AI_DIFFICULTY = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  INSANE: 'INSANE',
  ...AI_LEVELS,
};

export const AI_DIFFICULTY_ALIASES = {
  [AI_DIFFICULTY.EASY]: AI_LEVELS.NOOB,
  [AI_DIFFICULTY.MEDIUM]: AI_LEVELS.CASUAL,
  [AI_DIFFICULTY.INSANE]: AI_LEVELS.PRO,
};

export function normalizeAILevel(level) {
  return AI_DIFFICULTY_ALIASES[level] ?? level ?? AI_LEVELS.CASUAL;
}

export const AI_PERSONALITIES = {
  BALANCED: 'BALANCED',
  AGGRESSOR: 'AGGRESSOR',
  RUSHER: 'RUSHER',
  DEFENSIVE_CAMPER: 'DEFENSIVE_CAMPER',
  GREEDY_BANDIT: 'GREEDY_BANDIT',
  ECONOMIC_BOOMER: 'ECONOMIC_BOOMER',
  TECH_TURTLER: 'TECH_TURTLER',
  HARASSER: 'HARASSER',
  SIEGE_BREAKER: 'SIEGE_BREAKER',
  SWARM_COMMANDER: 'SWARM_COMMANDER',
  OPPORTUNIST: 'OPPORTUNIST',
};

export const AI_PERSONALITY_LABELS = {
  [AI_PERSONALITIES.BALANCED]: 'Balanced General',
  [AI_PERSONALITIES.AGGRESSOR]: 'The Aggressor',
  [AI_PERSONALITIES.RUSHER]: 'The Rusher',
  [AI_PERSONALITIES.DEFENSIVE_CAMPER]: 'Defensive Camper',
  [AI_PERSONALITIES.GREEDY_BANDIT]: 'Greedy Bandit',
  [AI_PERSONALITIES.ECONOMIC_BOOMER]: 'Economic Boomer',
  [AI_PERSONALITIES.TECH_TURTLER]: 'Tech Turtler',
  [AI_PERSONALITIES.HARASSER]: 'Harasser',
  [AI_PERSONALITIES.SIEGE_BREAKER]: 'Siege Breaker',
  [AI_PERSONALITIES.SWARM_COMMANDER]: 'Swarm Commander',
  [AI_PERSONALITIES.OPPORTUNIST]: 'Opportunist',
};

/**
 * AI difficulty profiles — consumed by AIManager / MacroBrain / MicroBrain.
 *
 * - thinkInterval:    seconds between macro FSM evaluations (lower = faster APM).
 * - microInterval:    seconds between micro combat ticks.
 * - incomeMultiplier: resource cheat/handicap applied to every deposit.
 * - aggression:       0..1 — biases attack timing and expansion risk-taking.
 * - microEnabled:     focus-fire / kiting / retreat behaviors on or off.
 * - omniscient:       true = ignores fog when building its threat map (cheat).
 */
export const AI_PROFILES = {
  [AI_LEVELS.NOOB]: {
    thinkInterval: 4.0,
    microInterval: 1.0,
    incomeMultiplier: 0.75,
    aggression: 0.2,
    microEnabled: false,
    omniscient: false,
    workerTarget: 8,
    goldRatio: 0.7,
  },
  [AI_LEVELS.CASUAL]: {
    thinkInterval: 2.0,
    microInterval: 0.4,
    incomeMultiplier: 1.0,
    aggression: 0.55,
    microEnabled: true,
    omniscient: false,
    workerTarget: 14,
    goldRatio: 0.65,
  },
  [AI_LEVELS.PRO]: {
    thinkInterval: 0.6,
    microInterval: 0.15,
    incomeMultiplier: 1.5,
    aggression: 0.9,
    microEnabled: true,
    omniscient: true,
    workerTarget: 20,
    goldRatio: 0.6,
  },
};

AI_PROFILES[AI_DIFFICULTY.EASY] = AI_PROFILES[AI_LEVELS.NOOB];
AI_PROFILES[AI_DIFFICULTY.MEDIUM] = AI_PROFILES[AI_LEVELS.CASUAL];
AI_PROFILES[AI_DIFFICULTY.INSANE] = AI_PROFILES[AI_LEVELS.PRO];

export const AI_PERSONALITY_PROFILES = {
  [AI_PERSONALITIES.BALANCED]: {},
  [AI_PERSONALITIES.AGGRESSOR]: { aggression: 0.18, attackRatioMod: -0.25, expandBias: -0.2 },
  [AI_PERSONALITIES.RUSHER]: { aggression: 0.28, attackRatioMod: -0.42, workerTargetDelta: -3, techBias: -0.35, rush: true, expandBias: -0.55 },
  [AI_PERSONALITIES.DEFENSIVE_CAMPER]: { aggression: -0.25, attackRatioMod: 0.45, defenseBias: 0.8, expandBias: -0.15 },
  [AI_PERSONALITIES.GREEDY_BANDIT]: { aggression: 0.05, attackRatioMod: -0.1, expandBias: 0.7, creepBias: 0.9, resourceHarassBias: 0.8, goldRatio: 0.72 },
  [AI_PERSONALITIES.ECONOMIC_BOOMER]: { aggression: -0.1, attackRatioMod: 0.25, expandBias: 0.85, workerTargetDelta: 5, goldRatio: 0.58 },
  [AI_PERSONALITIES.TECH_TURTLER]: { aggression: -0.15, attackRatioMod: 0.35, techBias: 0.85, defenseBias: 0.55, expandBias: -0.05 },
  [AI_PERSONALITIES.HARASSER]: { aggression: 0.16, attackRatioMod: -0.18, harassBias: 0.9, resourceHarassBias: 0.65 },
  [AI_PERSONALITIES.SIEGE_BREAKER]: { aggression: 0.08, attackRatioMod: -0.08, siegeBias: 0.9, techBias: 0.25 },
  [AI_PERSONALITIES.SWARM_COMMANDER]: { aggression: 0.2, attackRatioMod: -0.22, workerTargetDelta: -1, cheapUnitBias: 0.9, techBias: -0.2 },
  [AI_PERSONALITIES.OPPORTUNIST]: { aggression: 0.08, attackRatioMod: -0.18, expandBias: 0.2, harassBias: 0.45, creepBias: 0.45 },
};

export function normalizeAIPersonality(personality) {
  return AI_PERSONALITY_PROFILES[personality] ? personality : AI_PERSONALITIES.BALANCED;
}

export function resolveAIProfile(level, personality = AI_PERSONALITIES.BALANCED) {
  const normalizedLevel = normalizeAILevel(level);
  const base = AI_PROFILES[normalizedLevel] ?? AI_PROFILES[AI_LEVELS.CASUAL];
  const normalizedPersonality = normalizeAIPersonality(personality);
  const flavor = AI_PERSONALITY_PROFILES[normalizedPersonality] ?? AI_PERSONALITY_PROFILES[AI_PERSONALITIES.BALANCED];
  const workerTarget = Math.max(6, (base.workerTarget ?? 14) + (flavor.workerTargetDelta ?? 0));
  return {
    ...base,
    ...flavor,
    level: normalizedLevel,
    personality: normalizedPersonality,
    aggression: Math.max(0, Math.min(1, (base.aggression ?? 0.55) + (flavor.aggression ?? 0))),
    goldRatio: flavor.goldRatio ?? base.goldRatio ?? 0.65,
    workerTarget,
  };
}

/** Fixed per-slot player colors (WC3 tradition: slot order = color). */
export const PLAYER_COLORS = [
  '#e63946', // red
  '#2f7fe0', // blue
  '#37c4a8', // teal
  '#8e44ad', // purple
  '#f4a821', // yellow/orange
  '#e8743b', // orange-red
  '#4caf50', // green
  '#e87bb8', // pink
  '#8b5a2b', // brown
  '#40e0d0', // turquoise
];
