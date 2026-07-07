/**
 * useGameStore — Zustand store bridging the running simulation to the React HUD.
 *
 * Data flows ONE WAY: engine → store → HUD. The HUD never writes simulation
 * state through this store; player intent goes through the input systems
 * (SelectionSystem / CommandSystem) instead.
 *
 * Perf contract: the engine syncs resources/clock on a throttle
 * (GAME_CONFIG.SIM.HUD_SYNC_INTERVAL) and selection only on change, so React
 * re-renders stay far away from the 60 fps hot path.
 */
import { create } from 'zustand';

export const useGameStore = create((set) => ({
  // ── Local player economy (mirrors Player.resources) ─────────────
  resources: {
    gold: 0,
    aether: 0,
    supplyUsed: 0,
    supplyCap: 0,
  },

  /**
   * Lightweight snapshots of the currently selected units — plain objects,
   * never live Entity references (React must not touch simulation objects).
   * [{ id, typeId, name, hp, maxHp, mana, maxMana, color }]
   */
  selection: [],

  /** List of building typeIds completed by the local player. */
  completedBuildings: [],
  /** List of upgrade ids researched by the local player. */
  researchedUpgrades: [],

  /** Elapsed match time in seconds. */
  gameTime: 0,

  /** Smoothed frames-per-second, for the debug corner of the HUD. */
  fps: 0,

  /** Transient toast messages: [{ id, text, kind }] */
  notifications: [],

  /** Minimap snapshot: { width, depth, blips, camera, lakes, fog }. */
  minimap: { width: 0, depth: 0, blips: [], camera: null, lakes: [], fog: null },

  /**
   * Under-attack alert pings for the minimap: [{ id, x, z }] (world coords).
   * The engine appends on a throttle; the Minimap animates + expires them.
   */
  minimapPings: [],

  /**
   * Cursor hover-info for the world tooltip, or null when nothing is hovered:
   * { name, owner, relation:'ally'|'enemy'|'neutral', x, y } (x/y = client px).
   * Written by CursorController on its hover throttle.
   */
  hoverInfo: null,

  /** 'RUNNING' | 'VICTORY' | 'DEFEAT' — drives the end-of-match banner. */
  matchOutcome: 'RUNNING',

  observer: {
    enabled: false,
    revealAll: false,
    focusKind: 'ALL',
    focusPlayerId: null,
    focusTeam: null,
    players: [],
    teams: [],
    diagnostics: [],
  },

  /**
   * Transient resource-shortfall flash: 'GOLD'|'AETHER'|'SUPPLY' | null.
   * `resourceAlertSeq` bumps on every flash so a repeated same-reason alert
   * still retriggers the top-bar chip animation.
   */
  resourceAlert: null,
  resourceAlertSeq: 0,

  centerError: null,
  centerErrorSeq: 0,

  gameAlerts: [],
  _alertSeq: 0,

  // ── Engine-facing setters ────────────────────────────────────────
  setResources: (resources) => set({ resources }),
  setSelection: (selection) => set({ selection }),
  setCompletedBuildings: (completedBuildings) => set({ completedBuildings }),
  setResearchedUpgrades: (researchedUpgrades) => set({ researchedUpgrades }),
  setGameTime: (gameTime) => set({ gameTime }),
  setFps: (fps) => set({ fps }),
  setMatchOutcome: (matchOutcome) => set({ matchOutcome }),
  setMinimap: (minimap) => set({ minimap }),
  setObserver: (observer) =>
    set((state) => ({ observer: { ...state.observer, ...observer } })),

  /** Append an under-attack ping at world (x, z). Keeps only the recent few. */
  pushMinimapPing: (x, z) =>
    set((state) => ({
      minimapPings: [
        ...state.minimapPings.slice(-11),
        { id: (state._pingSeq ?? 0) + 1, x, z },
      ],
      _pingSeq: (state._pingSeq ?? 0) + 1,
    })),

  /** Set (or clear) the cursor hover-info tooltip. */
  setHoverInfo: (hoverInfo) => set({ hoverInfo }),

  /** Flash a top-bar resource chip to signal a blocked purchase. */
  flashResource: (reason) =>
    set((state) => ({ resourceAlert: reason, resourceAlertSeq: state.resourceAlertSeq + 1 })),
  /** Clear the resource flash (called by the HUD after its animation). */
  clearResourceAlert: () => set({ resourceAlert: null }),

  pushNotification: (text, kind = 'info') =>
    set((state) => ({
      notifications: [
        // Keep the queue short; old toasts fall off the front.
        ...state.notifications.slice(-4),
        { id: (state._toastSeq ?? 0) + 1, text, kind },
      ],
      _toastSeq: (state._toastSeq ?? 0) + 1,
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  showCenterError: (text) =>
    set((state) => ({ centerError: text, centerErrorSeq: state.centerErrorSeq + 1 })),
  clearCenterError: () => set({ centerError: null }),

  pushGameAlert: (text, kind = 'info') =>
    set((state) => ({
      gameAlerts: [
        ...state.gameAlerts.slice(-6),
        { id: (state._alertSeq ?? 0) + 1, text, kind, time: Date.now() },
      ],
      _alertSeq: (state._alertSeq ?? 0) + 1,
    })),

  dismissGameAlert: (id) =>
    set((state) => ({
      gameAlerts: state.gameAlerts.filter((a) => a.id !== id),
    })),

  /** Full reset on match teardown. */
  resetGameState: () =>
    set({
      resources: { gold: 0, aether: 0, supplyUsed: 0, supplyCap: 0 },
      selection: [],
      gameTime: 0,
      fps: 0,
      notifications: [],
      matchOutcome: 'RUNNING',
      observer: {
        enabled: false,
        revealAll: false,
        focusKind: 'ALL',
        focusPlayerId: null,
        focusTeam: null,
        players: [],
        teams: [],
        diagnostics: [],
      },
      resourceAlert: null,
      resourceAlertSeq: 0,
      minimap: { width: 0, depth: 0, blips: [], camera: null, lakes: [], fog: null },
      minimapPings: [],
      hoverInfo: null,
      completedBuildings: [],
      researchedUpgrades: [],
      centerError: null,
      centerErrorSeq: 0,
      gameAlerts: [],
      _alertSeq: 0,
    }),
}));
