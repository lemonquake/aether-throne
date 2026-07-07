/**
 * useLobbyStore — Zustand store for screen routing and the custom-match lobby.
 *
 * This is the single source of truth for match setup. When the player hits
 * "Start Battle", `startMatch()` snapshots the lobby into an immutable
 * MatchConfig (see src/state/MatchConfig.js) that the GameEngine consumes —
 * the lobby state itself never leaks into the simulation.
 *
 * Screen flow:  MAIN_MENU → LOBBY → LOADING → IN_GAME → (back to MAIN_MENU)
 */
import { create } from 'zustand';
import {
  GAME_CONFIG,
  SLOT_TYPES,
  TEAMS,
  AI_LEVELS,
  AI_PERSONALITIES,
  PLAYER_COLORS,
} from '../config/GameConfig.js';
import { RACE_IDS } from '../config/Races.js';
import { buildMatchConfig, validateLobby } from './MatchConfig.js';

export const SCREENS = {
  MAIN_MENU: 'MAIN_MENU',
  LOBBY: 'LOBBY',
  LOADING: 'LOADING',
  IN_GAME: 'IN_GAME',
  MAP_EDITOR: 'MAP_EDITOR',
};

/** Factory for a lobby slot. Slot 0 can be Human or Computer; it cannot close. */
function makeSlot(index) {
  return {
    id: index,
    name: index === 0 ? 'You' : `Computer ${index}`,
    type: index === 0 ? SLOT_TYPES.HUMAN : index === 1 ? SLOT_TYPES.AI : SLOT_TYPES.CLOSED,
    race: RACE_IDS[index % RACE_IDS.length],
    team: TEAMS.FFA,
    difficulty: AI_LEVELS.CASUAL,
    personality: AI_PERSONALITIES.BALANCED,
    color: PLAYER_COLORS[index],
    startLocationId: index,
  };
}

const initialSlots = () =>
  Array.from({ length: GAME_CONFIG.MAX_PLAYERS }, (_, i) => makeSlot(i));

function nextActiveSlotId(slots, currentId) {
  const active = slots
    .filter((s) => s.type === SLOT_TYPES.HUMAN || s.type === SLOT_TYPES.AI)
    .map((s) => s.id)
    .sort((a, b) => a - b);
  const index = active.indexOf(currentId);
  if (index < 0) return active[0] ?? null;
  return active[(index + 1) % active.length] ?? null;
}

const defaultMatchConfig = Object.freeze({
  version: 3,
  mapId: 'aether_core',
  players: Object.freeze([
    Object.freeze({
      id: 0,
      name: 'You',
      type: 'HUMAN',
      race: 'BIO_HUMAN',
      team: 'FFA',
      difficulty: null,
      personality: null,
      color: '#0042ff',
      startLocationId: 0,
      isLocal: true,
    }),
    Object.freeze({
      id: 1,
      name: 'Computer 1',
      type: 'AI',
      race: 'ARTIFICE_HORDE',
      team: 'FFA',
      difficulty: AI_LEVELS.CASUAL,
      personality: 'BALANCED',
      color: '#ff0303',
      startLocationId: 1,
      isLocal: false,
    }),
  ]),
  settings: Object.freeze({
    fogOfWar: true,
  }),
  observer: Object.freeze({
    enabled: false,
    revealAll: false,
    focusKind: 'ALL',
    focusPlayerId: null,
    focusTeam: null,
  }),
});

export const useLobbyStore = create((set, get) => ({
  // ── State ────────────────────────────────────────────────────────
  screen: SCREENS.MAIN_MENU,
  slots: initialSlots(),
  nexusId: 'aether_core',
  selectedSlotId: 0,
  /** Frozen MatchConfig handed to the engine while screen === LOADING. */
  pendingMatchConfig: defaultMatchConfig,
  /** Human-readable validation errors; empty when the lobby can start. */
  lobbyErrors: [],

  // ── Screen routing ───────────────────────────────────────────────
  setScreen: (screen) => set({ screen }),

  // ── Slot mutations ───────────────────────────────────────────────
  /**
   * Cycle a slot through AI → CLOSED → AI (slot 0 is locked to HUMAN).
   * "Add player slot" in the UI == flipping a CLOSED slot to AI.
   */
  cycleSlotType: (slotId) =>
    set((state) => {
      let nextType = null;
      const slots = state.slots.map((s) => {
        if (s.id !== slotId) return s;
        if (slotId === 0) {
          nextType = s.type === SLOT_TYPES.HUMAN ? SLOT_TYPES.AI : SLOT_TYPES.HUMAN;
          return {
            ...s,
            type: nextType,
            name: nextType === SLOT_TYPES.HUMAN ? 'You' : 'Computer 0',
          };
        }
        nextType = s.type === SLOT_TYPES.AI ? SLOT_TYPES.CLOSED : SLOT_TYPES.AI;
        return { ...s, type: nextType, name: nextType === SLOT_TYPES.AI ? `Computer ${slotId}` : s.name };
      });
      return {
        slots,
        selectedSlotId:
          state.selectedSlotId === slotId && nextType === SLOT_TYPES.CLOSED
            ? nextActiveSlotId(slots, slotId) ?? 0
            : state.selectedSlotId,
        lobbyErrors: [],
      };
    }),

  setSlotType: (slotId, type) =>
    set((state) => ({
      slots: state.slots.map((s) =>
        s.id === slotId
          ? slotId === 0
            ? {
                ...s,
                type: type === SLOT_TYPES.AI ? SLOT_TYPES.AI : SLOT_TYPES.HUMAN,
                name: type === SLOT_TYPES.AI ? 'Computer 0' : 'You',
              }
            : { ...s, type, name: type === SLOT_TYPES.AI ? `Computer ${slotId}` : s.name }
          : s
      ),
      lobbyErrors: [],
    })),

  setSlotRace: (slotId, race) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, race } : s)),
    })),

  setSlotTeam: (slotId, team) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, team } : s)),
    })),

  setSlotDifficulty: (slotId, difficulty) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, difficulty } : s)),
    })),

  setSlotPersonality: (slotId, personality) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, personality } : s)),
    })),

  setSlotColor: (slotId, color) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, color } : s)),
      lobbyErrors: [],
    })),

  setSelectedSlotId: (slotId) => set({ selectedSlotId: slotId }),

  setSlotStartLocation: (slotId, startLocationId) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, startLocationId } : s)),
      selectedSlotId: nextActiveSlotId(state.slots, slotId) ?? slotId,
      lobbyErrors: [],
    })),

  setNexusId: (nexusId) => set({ nexusId }),

  resetLobby: () => set({ slots: initialSlots(), selectedSlotId: 0, lobbyErrors: [], pendingMatchConfig: null }),

  // ── Derived ──────────────────────────────────────────────────────
  /** Active (playing) slot count — used to enable/disable Start Battle. */
  activeSlotCount: () =>
    get().slots.filter((s) => s.type === SLOT_TYPES.HUMAN || s.type === SLOT_TYPES.AI).length,

  canStart: () => validateLobby(get()).length === 0,

  // ── Match launch ─────────────────────────────────────────────────
  /**
   * Validate, snapshot the lobby into a MatchConfig, and enter LOADING.
   * App.jsx watches for LOADING and hands pendingMatchConfig to the engine.
   */
  startMatch: () => {
    const state = get();
    const errors = validateLobby(state);
    if (errors.length > 0) {
      set({ lobbyErrors: errors });
      return false;
    }
    const config = buildMatchConfig(state);
    set({ pendingMatchConfig: config, screen: SCREENS.LOADING, lobbyErrors: [] });
    return true;
  },

  /** Called by App.jsx when the engine finishes (or fails) booting. */
  onMatchReady: () => set({ screen: SCREENS.IN_GAME }),
  onMatchFailed: (message) =>
    set({ screen: SCREENS.LOBBY, lobbyErrors: [message], pendingMatchConfig: null }),
  exitToMenu: () => set({ screen: SCREENS.MAIN_MENU, pendingMatchConfig: null }),
}));
