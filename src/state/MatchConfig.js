/**
 * MatchConfig — the contract between the lobby UI and the game engine.
 *
 * `buildMatchConfig(lobbyState)` converts mutable lobby state into a frozen,
 * serializable initialization object. This is the ONLY thing the engine sees:
 * if it isn't in the MatchConfig, the simulation cannot depend on it. That
 * property also makes the config a natural fit for future save/replay and
 * network lobby sync (it's pure JSON).
 */
import {
  GAME_CONFIG,
  SLOT_TYPES,
  TEAMS,
  AI_PROFILES,
  AI_PERSONALITIES,
  AI_PERSONALITY_PROFILES,
  normalizeAILevel,
  normalizeAIPersonality,
} from '../config/GameConfig.js';
import { RACES } from '../config/Races.js';
import { getNexusType } from '../config/Nexuses.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function sideKey(slot) {
  return slot.team === TEAMS.FFA ? `FFA_${slot.id}` : slot.team;
}

/**
 * Validate the lobby; returns an array of human-readable error strings
 * (empty == valid). Kept separate from the store so the engine can re-assert
 * the same invariants on the built config.
 * @param {{slots: Array}} lobbyState
 * @returns {string[]}
 */
export function validateLobby(lobbyState) {
  const errors = [];
  const active = lobbyState.slots.filter(
    (s) => s.type === SLOT_TYPES.HUMAN || s.type === SLOT_TYPES.AI
  );
  const nexus = getNexusType(lobbyState.nexusId);
  const startCount = GAME_CONFIG.MAX_PLAYERS;
  const usedStarts = new Set();
  const usedColors = new Set();

  if (active.length < 2) {
    errors.push('At least two active players are required to start a match.');
  }
  const hostileSides = new Set(active.map(sideKey));
  if (active.length >= 2 && hostileSides.size < 2) {
    errors.push('At least two hostile sides are required. Put players on opposing teams or use FFA.');
  }
  for (const slot of active) {
    if (!RACES[slot.race]) {
      errors.push(`Slot ${slot.id + 1} has an unknown race: ${slot.race}`);
    }
    if (!HEX_COLOR.test(slot.color ?? '')) {
      errors.push(`Slot ${slot.id + 1} needs a valid custom color.`);
    } else {
      const color = slot.color.toLowerCase();
      if (usedColors.has(color)) {
        errors.push(`Slot ${slot.id + 1} uses a duplicate player color.`);
      }
      usedColors.add(color);
    }
    if (!Object.values(TEAMS).includes(slot.team)) {
      errors.push(`Slot ${slot.id + 1} has an unknown team: ${slot.team}`);
    }
    if (!Number.isInteger(slot.startLocationId) || slot.startLocationId < 0 || slot.startLocationId >= startCount) {
      errors.push(`Slot ${slot.id + 1} needs a valid starting location.`);
    } else if (usedStarts.has(slot.startLocationId)) {
      errors.push(`Slot ${slot.id + 1} uses a duplicate starting location.`);
    } else {
      usedStarts.add(slot.startLocationId);
    }
    if (slot.type === SLOT_TYPES.AI && !AI_PROFILES[normalizeAILevel(slot.difficulty)]) {
      errors.push(`Slot ${slot.id + 1} has an unknown AI difficulty: ${slot.difficulty}`);
    }
    if (slot.type === SLOT_TYPES.AI) {
      const personality = slot.personality ?? AI_PERSONALITIES.BALANCED;
      if (!AI_PERSONALITY_PROFILES[personality]) {
        errors.push(`Slot ${slot.id + 1} has an unknown AI personality: ${slot.personality}`);
      }
    }
  }
  return errors;
}

/**
 * Snapshot lobby state → engine initialization object.
 *
 * Shape (all plain JSON, deep-frozen):
 * {
 *   version: 3,
 *   mapId: string,
 *   players: [{
 *     id:          number   — stable player id (== original slot id),
 *     name:        string,
 *     type:        'HUMAN' | 'AI',
 *     race:        raceId,
 *     team:        'FFA' | 'TEAM_1' ... 'TEAM_6',
 *     difficulty:  'NOOB'|'CASUAL'|'PRO' | null (humans),
 *     personality: AI personality id | null (humans),
 *     color:       '#rrggbb',
 *     startLocationId: number,
 *     isLocal:     boolean  — the human at this machine,
 *   }],
 *   observer: { enabled, revealAll, focusKind, focusPlayerId, focusTeam },
 *   settings: { fogOfWar: boolean }
 * }
 *
 * @param {{slots: Array, mapId: string}} lobbyState
 * @returns {object} frozen MatchConfig
 */
export function buildMatchConfig(lobbyState) {
  const activeSlots = lobbyState.slots.filter((s) => s.type === SLOT_TYPES.HUMAN || s.type === SLOT_TYPES.AI);
  const observerEnabled = !activeSlots.some((s) => s.type === SLOT_TYPES.HUMAN);
  const players = lobbyState.slots
    .filter((s) => s.type === SLOT_TYPES.HUMAN || s.type === SLOT_TYPES.AI)
    .map((s) => Object.freeze({
      id: s.id,
      name: s.name,
      type: s.type,
      race: s.race,
      team: s.team,
      difficulty: s.type === SLOT_TYPES.AI ? normalizeAILevel(s.difficulty) : null,
      personality: s.type === SLOT_TYPES.AI ? normalizeAIPersonality(s.personality) : null,
      color: s.color.toLowerCase(),
      startLocationId: s.startLocationId,
      isLocal: !observerEnabled && s.type === SLOT_TYPES.HUMAN,
    }));

  return Object.freeze({
    version: 3,
    mapId: lobbyState.nexusId,
    players: Object.freeze(players),
    observer: Object.freeze({
      enabled: observerEnabled,
      revealAll: observerEnabled,
      focusKind: 'ALL',
      focusPlayerId: null,
      focusTeam: null,
    }),
    settings: Object.freeze({
      fogOfWar: true,
    }),
  });
}
