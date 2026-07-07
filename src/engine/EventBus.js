/**
 * EventBus — a minimal, allocation-light pub/sub hub.
 *
 * All cross-module communication that isn't a direct ownership relationship
 * (engine → subsystem) flows through here. This keeps modules decoupled:
 * the CombatSystem doesn't import the AudioManager to play a hit sound —
 * it emits UNIT_DAMAGED and whoever cares listens.
 *
 * A single shared instance (`eventBus`) is exported; systems may also create
 * private buses for internal use if needed.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name (use the EVENTS catalog).
   * @param {Function} handler - Callback invoked with the emitted payload.
   * @returns {Function} Unsubscribe function for convenient cleanup.
   */
  on(event, handler) {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to a single occurrence of an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} Unsubscribe function.
   */
  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe a handler.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  /**
   * Emit an event synchronously to all subscribers.
   * Handlers added/removed during emission take effect on the next emit.
   * @param {string} event
   * @param {*} [payload]
   */
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // Copy to a scratch array so handlers can safely unsubscribe mid-emit.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        // A misbehaving listener must never take down the game loop.
        console.error(`[EventBus] handler for "${event}" threw:`, err);
      }
    }
  }

  /** Remove every listener (used on match teardown). */
  clear() {
    this._listeners.clear();
  }
}

/**
 * EVENTS — the canonical event catalog.
 * Every emitter/subscriber must reference these constants, never raw strings.
 * Payload shapes are documented inline and are part of the module contract.
 */
export const EVENTS = {
  // ── Input (emitted by InputManager) ─────────────────────────────────────
  /** { button, ndc:{x,y}, screen:{x,y}, shiftKey, ctrlKey, altKey } */
  POINTER_DOWN: 'input:pointerdown',
  /** { ndc:{x,y}, screen:{x,y}, buttons } */
  POINTER_MOVE: 'input:pointermove',
  /** { button, ndc:{x,y}, screen:{x,y}, shiftKey, ctrlKey, altKey } */
  POINTER_UP: 'input:pointerup',
  /** { code, key, shiftKey, ctrlKey, altKey, repeat } */
  KEY_DOWN: 'input:keydown',
  /** { code, key } */
  KEY_UP: 'input:keyup',

  // ── Selection & commands ────────────────────────────────────────────────
  /** { ids: number[], units: Unit[] } */
  SELECTION_CHANGED: 'selection:changed',
  /** { type:'MOVE'|'ATTACK'|'ATTACK_MOVE'|'GATHER'|'STOP', unitIds:number[], target } */
  COMMAND_ISSUED: 'command:issued',
  /** { player, reason:'GOLD'|'AETHER'|'SUPPLY' } — a local-player purchase was blocked */
  COMMAND_REJECTED: 'command:rejected',

  // ── Entity lifecycle (emitted by EntityManager / entities) ─────────────
  /** { entity } */
  UNIT_SPAWNED: 'entity:unitSpawned',
  /** { entity, killer } */
  UNIT_DIED: 'entity:unitDied',
  /** { entity, amount, attacker } */
  UNIT_DAMAGED: 'entity:unitDamaged',
  /** { entity } */
  BUILDING_PLACED: 'entity:buildingPlaced',
  /** { entity } */
  BUILDING_COMPLETE: 'entity:buildingComplete',
  /** { entity, killer } */
  BUILDING_DESTROYED: 'entity:buildingDestroyed',
  /** { node } */
  RESOURCE_DEPLETED: 'entity:resourceDepleted',

  // ── Economy (emitted by Player) ─────────────────────────────────────────
  /** { player, upgradeId } */
  RESEARCH_COMPLETE: 'economy:researchComplete',
  /** { player } — fired whenever gold/aether/supply change */
  RESOURCES_CHANGED: 'economy:resourcesChanged',
  /** { player, kind:'gold'|'aether', amount, position } — a worker delivered a trip */
  RESOURCE_DEPOSITED: 'economy:resourceDeposited',

  // ── Match flow (emitted by GameEngine) ──────────────────────────────────
  /** { matchConfig } */
  MATCH_STARTED: 'match:started',
  /** { winners: Player[], losers: Player[] } */
  MATCH_ENDED: 'match:ended',
  /** { player } */
  PLAYER_DEFEATED: 'match:playerDefeated',

  // ── AI diagnostics (optional listeners; used by debug overlays) ────────
  /** { playerId, from, to } — macro FSM transitions */
  AI_STATE_CHANGED: 'ai:stateChanged',
};

/** The shared, process-wide bus instance. */
export const eventBus = new EventBus();
