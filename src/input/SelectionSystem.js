/**
 * SelectionSystem — marquee/click selection, control groups, HUD snapshots.
 *
 * Behavior contract (ARCHITECTURE.md §5):
 *  - Left-drag ≥ 4 px → screen-space marquee (`div.selection-marquee` on
 *    <body>, styled in ui.css). On release, every LOCAL-player unit whose
 *    *projected* screen position falls inside the rect is selected. At this
 *    entity count (≤ a few hundred) CPU projection beats GPU picking.
 *  - Left-click → engine.pickEntity: own unit = select (shift toggles);
 *    anything else (enemy / resource / building) = single "inspection"
 *    selection that shows a HUD card but never receives commands; bare
 *    ground = clear.
 *  - Ctrl+1..9 assigns a control group, 1..9 recalls it; recalling the SAME
 *    group again within 0.35 s of game time (double-tap) pans the camera to
 *    the group's centroid.
 *  - Every change: `unit.setSelected(bool)` on affected units, emit
 *    EVENTS.SELECTION_CHANGED, and push plain snapshots into useGameStore.
 *  - Dead units are pruned from selection AND groups every update; hp/mana
 *    values in the HUD snapshots are refreshed at ~5 Hz while anything is
 *    selected.
 *
 * Marquee gotchas handled here:
 *  - Drags in ANY direction: the raw start/current corners are normalized
 *    into a min/max rect before hit-testing or styling the div.
 *  - NDC-vs-screen y-flip: `Vector3.project()` yields NDC (+y up); the
 *    marquee rect lives in client pixels (+y down), so screenY uses
 *    `(1 - ndc.y) / 2` — the mirror of InputManager's incoming conversion.
 *  - Right-click drags never touch the marquee (button 0 only).
 *
 * Cross-system coordination: while the A key is held and units are selected,
 * a left CLICK is an attack-move order (CommandSystem consumes it), so this
 * system deliberately skips click-selection in that case. Marquee drags still
 * work with A held — only the click path is ceded.
 */
import * as THREE from 'three';
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { ENTITY_CLASS, getUnitType } from '../config/UnitTypes.js';
import { getUpgradeType } from '../config/Upgrades.js';
import { useGameStore } from '../state/useGameStore.js';

/** Pixels of pointer travel before a left-press becomes a marquee drag. */
const DRAG_THRESHOLD_PX = 4;
/** Game-time window (seconds) for a double-click "select all of type on screen". */
const DOUBLE_CLICK_SECONDS = 0.35;
/** Game-time window (seconds) for the control-group double-tap camera recall. */
const GROUP_DOUBLE_TAP_SECONDS = 0.35;
/** Seconds between HUD hp/mana snapshot refreshes while something is selected (~5 Hz). */
const HP_REFRESH_INTERVAL = 0.2;
/** Snapshot swatch for neutral (unowned) inspected entities, e.g. resource nodes. */
const NEUTRAL_SNAPSHOT_COLOR = '#d8d2b0';

// ── Module-scope scratch objects (no per-frame / per-event allocations) ─────
const _proj = new THREE.Vector3();      // world → NDC projection scratch
const _centroid = new THREE.Vector3();  // control-group centroid scratch
const _scratchUnits = [];               // reusable list for marquee hits / pruning

/**
 * Build a plain HUD snapshot for one entity. Plain data only — React must
 * never receive live simulation objects.
 * @param {import('../entities/Entity.js').Entity} e
 * @returns {{id:number, typeId:string, name:string, hp:number, maxHp:number,
 *            mana:number, maxMana:number, color:string}}
 */
function makeSnapshot(e) {
  const t = e.type;
  const snap = {
    id: e.id,
    // Resource nodes may carry a pseudo-type; fall back to their `kind`.
    typeId: t?.id ?? e.kind ?? 'UNKNOWN',
    name: t?.name ?? e.kind ?? 'Unknown',
    hp: Math.round(e.hp),
    maxHp: e.maxHp,
    mana: Math.round(e.mana),
    maxMana: e.maxMana,
    color: e.player?.colorHex ?? NEUTRAL_SNAPSHOT_COLOR,
    // ── Static stat block for the single-select info panel (§3.7). Straight
    //    from the frozen type; absent (0/'') for resource nodes. ──────────
    archetype: t?.archetype ?? null,
    race: t?.race ?? null,
    armor: t?.armor ?? 0,
    armorType: t?.armorType ?? '',
    attackType: t?.attackType ?? '',
    damageMin: t?.damage?.[0] ?? 0,
    damageMax: t?.damage?.[1] ?? 0,
    attackSpeed: t?.attackSpeed ?? 0,
    attackRange: t?.attackRange ?? 0,
    moveSpeed: t?.moveSpeed ?? 0,
    sight: t?.sightRadius ?? 0,
    // True for anything the local player owns (drives command-card affordances).
    own: !!(e.player && e.player.isLocal),
  };
  // ── Building-only fields for the command card + production queue (§3.8) ──
  if (Array.isArray(e.productionQueue)) {
    snap.isBuilding = true;
    snap.underConstruction = e.constructionRemaining > 0;
    snap.constructionFrac = e.type.buildTime > 0
      ? 1 - Math.max(0, e.constructionRemaining) / e.type.buildTime
      : 1;
    snap.queue = e.productionQueue.map((q) => {
      if (q.isUpgrade) {
        const ut = getUpgradeType(q.upgradeId);
        return {
          upgradeId: q.upgradeId,
          name: ut.name,
          archetype: 'UPGRADE',
          remaining: q.remaining,
          total: ut.buildTime,
          isUpgrade: true,
        };
      } else {
        const qt = getUnitType(q.typeId);
        return {
          typeId: q.typeId,
          name: qt.name,
          archetype: qt.archetype,
          remaining: q.remaining,
          total: qt.buildTime,
        };
      }
    });
  }
  return snap;
}

export class SelectionSystem {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected
   *        engine (never imported). Uses: camera, canvas, gameTime,
   *        pickEntity, entities.getPlayerUnits, localPlayer, cameraController,
   *        input.isKeyDown.
   */
  constructor(engine) {
    this.engine = engine;

    /**
     * The live selection — LOCAL-player-owned units only (the contract type).
     * Inspected foreign entities are tracked separately in `_inspected` so
     * CommandSystem's `getSelectedArray()` is guaranteed command-safe.
     * @type {Set<import('../entities/Unit.js').Unit>}
     */
    this.selected = new Set();

    /** Cached array mirror of `selected` — rebuilt only on change. */
    this._selectedArray = [];

    /**
     * Enemy/resource/building selected "for inspection": shows a HUD card,
     * gets a selection ring, receives no commands.
     * @type {import('../entities/Entity.js').Entity|null}
     */
    this._inspected = null;

    /**
     * Control groups: digit (1..9) → Unit[]. Arrays hold live references;
     * dead members are pruned in update().
     * @type {Map<number, import('../entities/Unit.js').Unit[]>}
     */
    this._groups = new Map();
    this._lastRecallDigit = 0;
    this._lastRecallTime = -Infinity; // game-time of the previous recall

    // ── Double-click (select all of type on screen) bookkeeping ───────
    this._lastClickId = 0;
    this._lastClickTime = -Infinity; // game-time of the previous own-unit click

    // ── Left-drag / marquee state (client-pixel space) ────────────────
    this._drag = {
      active: false,   // left button is down
      started: false,  // travel exceeded DRAG_THRESHOLD_PX → marquee visible
      startX: 0, startY: 0,
      curX: 0, curY: 0,
      shift: false,    // shift at press time → additive marquee
    };

    /** Lazily created marquee div (reused across drags). @type {HTMLDivElement|null} */
    this._marqueeEl = null;

    /** Accumulator for the ~5 Hz HUD hp refresh. */
    this._hpTimer = 0;

    // ── EventBus subscriptions (unsubscribers kept for dispose) ───────
    this._unsubs = [
      eventBus.on(EVENTS.POINTER_DOWN, (p) => this._onPointerDown(p)),
      eventBus.on(EVENTS.POINTER_MOVE, (p) => this._onPointerMove(p)),
      eventBus.on(EVENTS.POINTER_UP, (p) => this._onPointerUp(p)),
      eventBus.on(EVENTS.KEY_DOWN, (p) => this._onKeyDown(p)),
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The current selection as an array. Returns the internal cached array —
   * treat it as read-only and do not retain it across frames.
   * @returns {import('../entities/Unit.js').Unit[]}
   */
  getSelectedArray() {
    return this._selectedArray;
  }

  /**
   * The currently inspected entity when it is one of the LOCAL player's own
   * production buildings — the target for command-card train/rally actions.
   * @returns {import('../entities/Building.js').Building|null}
   */
  getSelectedBuilding() {
    const e = this._inspected;
    if (!this.engine.isObserver && e && !e.isDead && e.player && e.player.isLocal && Array.isArray(e.productionQueue)) {
      return e;
    }
    return null;
  }

  /**
   * Select every LOCAL-player unit of `typeId` whose projected position is on
   * screen (WC3 double-click / portrait double-click, PHASE5_PROMPT.md §3.6).
   * Also callable from the HUD via getEngine().selection.
   * @param {string} typeId
   */
  selectAllOfTypeOnScreen(typeId) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    const camera = this.engine.camera;
    const localUnits = this.engine.entities.getPlayerUnits(this.engine.localPlayer.id);
    _scratchUnits.length = 0;
    for (const unit of localUnits) {
      if (unit.isDead || unit.type.id !== typeId) continue;
      _proj.copy(unit.position).project(camera);
      // Inside the clip volume on all three axes = on screen.
      if (_proj.x < -1 || _proj.x > 1 || _proj.y < -1 || _proj.y > 1 || _proj.z < -1 || _proj.z > 1) {
        continue;
      }
      _scratchUnits.push(unit);
    }
    if (_scratchUnits.length === 0) return;
    this._applySelection(_scratchUnits, false);
  }

  /**
   * Per-frame maintenance: prune dead units from the selection and every
   * control group, and refresh HUD hp/mana snapshots at ~5 Hz.
   * @param {number} dt - Clamped frame delta in seconds.
   */
  update(dt) {
    let changed = false;

    // 1) Prune dead units from the live selection (collect first — mutating
    //    a Set while iterating it is legal but reads confusingly).
    if (this.selected.size > 0) {
      _scratchUnits.length = 0;
      for (const unit of this.selected) {
        if (unit.isDead) _scratchUnits.push(unit);
      }
      if (_scratchUnits.length > 0) {
        for (const unit of _scratchUnits) this.selected.delete(unit);
        changed = true;
      }
    }

    // 2) A dead inspected entity vanishes from the HUD too.
    if (this._inspected && this._inspected.isDead) {
      this._inspected = null;
      changed = true;
    }

    // 3) Prune control groups in place (no array reallocation: write index
    //    compaction). Groups are tiny (≤ selection size) so this is cheap.
    for (const members of this._groups.values()) {
      let write = 0;
      for (let read = 0; read < members.length; read++) {
        if (!members[read].isDead) members[write++] = members[read];
      }
      members.length = write;
    }

    if (changed) {
      // Pruning counts as a selection change: rebuild, notify, re-snapshot.
      this._rebuildArrayAndNotify();
    }

    // 4) Cheap ~5 Hz hp/mana refresh while anything is on the HUD card grid.
    if (this.selected.size > 0 || this._inspected) {
      this._hpTimer += dt;
      if (this._hpTimer >= HP_REFRESH_INTERVAL) {
        this._hpTimer = 0;
        this._pushSnapshots();
      }
    } else {
      this._hpTimer = 0;
    }
  }

  /** Unsubscribe from the bus, remove the marquee div, release references. */
  dispose() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    if (this._marqueeEl) {
      this._marqueeEl.remove();
      this._marqueeEl = null;
    }
    // Politely hide rings on whatever was selected at teardown.
    for (const unit of this.selected) unit.setSelected(false);
    if (this._inspected) this._inspected.setSelected(false);
    this.selected.clear();
    this._selectedArray = [];
    this._inspected = null;
    this._groups.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pointer handling
  // ──────────────────────────────────────────────────────────────────────────

  /** @param {{button:number, screen:{x:number,y:number}, shiftKey:boolean}} p */
  _onPointerDown(p) {
    if (this.engine.placement?.active) return; // placement mode owns pointer input
    if (p.button !== 0) return; // marquee/click-select is left-button only
    const d = this._drag;
    d.active = true;
    d.started = false;
    // COPY the coordinates — POINTER payloads may be reused by InputManager.
    d.startX = p.screen.x;
    d.startY = p.screen.y;
    d.curX = p.screen.x;
    d.curY = p.screen.y;
    d.shift = p.shiftKey;
  }

  /** @param {{screen:{x:number,y:number}}} p - REUSED payload; copy, don't retain. */
  _onPointerMove(p) {
    if (this.engine.placement?.active) return;
    const d = this._drag;
    if (!d.active) return;
    d.curX = p.screen.x;
    d.curY = p.screen.y;

    if (!d.started) {
      // Promote to a marquee only after real travel, so tiny hand jitter on
      // a click doesn't open a 1-pixel marquee (and any-direction drags work
      // because we test absolute deltas, not signed ones).
      const moved =
        Math.abs(d.curX - d.startX) >= DRAG_THRESHOLD_PX ||
        Math.abs(d.curY - d.startY) >= DRAG_THRESHOLD_PX;
      if (moved) {
        d.started = true;
        if (!this.engine.isObserver) this._showMarquee();
      }
    }
    if (d.started && !this.engine.isObserver) this._positionMarquee();
  }

  /** @param {{button:number, ndc:{x:number,y:number}, shiftKey:boolean}} p */
  _onPointerUp(p) {
    if (this.engine.placement?.active) return;
    if (p.button !== 0) return;
    const d = this._drag;
    if (!d.active) return; // press began outside our tracking (e.g. on the HUD)
    d.active = false;

    if (d.started) {
      // ── Marquee release ─────────────────────────────────────────────
      this._hideMarquee();
      this._selectInMarquee(d.shift || p.shiftKey);
    } else {
      // ── Plain click ─────────────────────────────────────────────────
      // A-held click with a live selection = attack-move; CommandSystem owns
      // that click, so selection must not react (matches WC3 targeting mode).
      if (this.engine.input.isKeyDown('KeyA') && this.selected.size > 0) return;
      // A command-card action armed a targeting cursor (attack-move / rally) —
      // CommandSystem consumes this click; selection must not react.
      if (this.engine.commands?.isTargeting?.()) return;
      this._clickSelect(p.ndc.x, p.ndc.y, p.shiftKey);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Marquee internals
  // ──────────────────────────────────────────────────────────────────────────

  /** Create (once) and show the marquee div. Styling lives in ui.css. */
  _showMarquee() {
    if (!this._marqueeEl) {
      this._marqueeEl = document.createElement('div');
      this._marqueeEl.className = 'selection-marquee';
      document.body.appendChild(this._marqueeEl);
    }
    this._marqueeEl.style.display = 'block';
    this._positionMarquee();
  }

  /**
   * Style the marquee from the normalized drag rect. min/max normalization
   * is what makes up-left / down-right / any-direction drags all render (and
   * later hit-test) identically.
   */
  _positionMarquee() {
    const d = this._drag;
    const el = this._marqueeEl;
    if (!el) return;
    const minX = Math.min(d.startX, d.curX);
    const minY = Math.min(d.startY, d.curY);
    const width = Math.abs(d.curX - d.startX);
    const height = Math.abs(d.curY - d.startY);
    // The page never scrolls (fixed full-screen layout), so client pixels map
    // 1:1 onto the absolutely-positioned div's page coordinates.
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  _hideMarquee() {
    if (this._marqueeEl) this._marqueeEl.style.display = 'none';
  }

  /**
   * Select every local-player unit whose projected screen position falls
   * inside the (normalized) marquee rect.
   * @param {boolean} additive - Shift held → union with the current selection.
   */
  _selectInMarquee(additive) {
    if (this.engine.isObserver || !this.engine.localPlayer) return;
    const d = this._drag;
    const minX = Math.min(d.startX, d.curX);
    const maxX = Math.max(d.startX, d.curX);
    const minY = Math.min(d.startY, d.curY);
    const maxY = Math.max(d.startY, d.curY);

    const camera = this.engine.camera;
    // One rect query per release (NOT per unit / per frame) — cheap enough.
    const rect = this.engine.canvas.getBoundingClientRect();
    const localUnits = this.engine.entities.getPlayerUnits(this.engine.localPlayer.id);

    _scratchUnits.length = 0;
    for (const unit of localUnits) {
      if (unit.isDead) continue;
      // Project the unit's ground position into NDC…
      _proj.copy(unit.position).project(camera);
      // …skip anything outside the clip volume (behind the camera a
      // perspective projection produces garbage coordinates).
      if (_proj.z < -1 || _proj.z > 1) continue;
      // NDC → client pixels. THE y-FLIP: NDC +y is up, pixels +y is down,
      // hence (1 - ndc.y) rather than (ndc.y + 1).
      const sx = rect.left + ((_proj.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - _proj.y) / 2) * rect.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        _scratchUnits.push(unit);
      }
    }

    if (_scratchUnits.length === 0 && additive) return; // empty shift-drag: keep selection
    this._applySelection(_scratchUnits, additive);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Click selection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a plain left-click.
   * @param {number} ndcX @param {number} ndcY
   * @param {boolean} shift - Shift-click toggles own units in/out of the set.
   */
  _clickSelect(ndcX, ndcY, shift) {
    const hit = this.engine.pickEntity(ndcX, ndcY);

    if (!hit || hit.isDead) {
      // Ground click clears everything (shift-ground is a deliberate no-op —
      // WC3 players expect a fumbled shift-click not to wipe their army).
      if (!shift) this._clearAll();
      return;
    }

    if (this.engine.isObserver) {
      if (this.engine.isEntityVisibleToViewer?.(hit)) this._inspect(hit);
      else if (!shift) this._clearAll();
      return;
    }

    const isOwnUnit =
      this.engine.localPlayer && hit.player === this.engine.localPlayer && hit.type?.class === ENTITY_CLASS.UNIT;

    if (isOwnUnit) {
      if (shift) {
        // Toggle membership without touching the rest of the selection.
        this._inspected?.setSelected(false);
        this._inspected = null;
        if (this.selected.has(hit)) {
          this.selected.delete(hit);
          hit.setSelected(false);
        } else {
          this.selected.add(hit);
          hit.setSelected(true);
        }
        this._rebuildArrayAndNotify();
      } else {
        // Double-click an own unit → select every unit of its type on screen
        // (classic WC3): a second click on the SAME unit within the window.
        const now = this.engine.gameTime;
        if (hit.id === this._lastClickId && now - this._lastClickTime <= DOUBLE_CLICK_SECONDS) {
          this._lastClickId = 0;
          this._lastClickTime = -Infinity;
          this.selectAllOfTypeOnScreen(hit.type.id);
          return;
        }
        this._lastClickId = hit.id;
        this._lastClickTime = now;
        _scratchUnits.length = 0;
        _scratchUnits.push(hit);
        this._applySelection(_scratchUnits, false);
      }
      return;
    }

    // Anything else — enemy unit/building, own/allied building, resource
    // node — becomes a single inspection selection: HUD card + ring, but
    // getSelectedArray() goes empty so no commands can reach it.
    // TODO(phase-5): own-building selection opens the production command card.
    this._inspect(hit);
  }

  /**
   * Enter inspection mode on a non-commandable entity.
   * @param {import('../entities/Entity.js').Entity} entity
   */
  _inspect(entity) {
    // Drop the current unit selection first.
    for (const unit of this.selected) unit.setSelected(false);
    this.selected.clear();
    this._selectedArray = [];
    if (this._inspected && this._inspected !== entity) this._inspected.setSelected(false);

    this._inspected = entity;
    entity.setSelected(true);

    // SELECTION_CHANGED carries the inspected entity so debug overlays see it;
    // note `units` may contain a non-Unit entity ONLY in inspection mode.
    eventBus.emit(EVENTS.SELECTION_CHANGED, { ids: [entity.id], units: [entity] });
    this._pushSnapshots();
  }

  /** Clear both the unit selection and any inspection. */
  _clearAll() {
    if (this.selected.size === 0 && !this._inspected) return; // nothing to do
    for (const unit of this.selected) unit.setSelected(false);
    this.selected.clear();
    if (this._inspected) this._inspected.setSelected(false);
    this._inspected = null;
    this._rebuildArrayAndNotify();
  }

  /**
   * Replace (or extend) the selection with `units`, syncing rings, the bus
   * and the HUD store in one pass.
   * @param {import('../entities/Unit.js').Unit[]} units - Candidate units (already filtered to own+alive).
   * @param {boolean} additive - True → union with the existing selection.
   */
  _applySelection(units, additive) {
    // Inspection never survives a real selection action.
    if (this._inspected) {
      this._inspected.setSelected(false);
      this._inspected = null;
    }

    if (!additive) {
      // Deselect everything that is not in the incoming list. Linear scan is
      // fine at RTS selection sizes (≤ dozens).
      for (const unit of this.selected) {
        if (!units.includes(unit)) unit.setSelected(false);
      }
      this.selected.clear();
    }
    for (const unit of units) {
      this.selected.add(unit);
      unit.setSelected(true);
    }
    this._rebuildArrayAndNotify();
  }

  /** Rebuild the cached array, emit SELECTION_CHANGED, push HUD snapshots. */
  _rebuildArrayAndNotify() {
    this._selectedArray = [...this.selected];
    eventBus.emit(EVENTS.SELECTION_CHANGED, {
      ids: this._selectedArray.map((u) => u.id),
      units: this._selectedArray,
    });
    this._pushSnapshots();
  }

  /**
   * Push plain snapshots into the HUD store. Fresh arrays/objects on purpose:
   * React needs new references to re-render, and this runs at most ~5 Hz.
   */
  _pushSnapshots() {
    const snapshots = [];
    if (this._inspected && !this._inspected.isDead) {
      snapshots.push(makeSnapshot(this._inspected));
    } else {
      for (const unit of this._selectedArray) snapshots.push(makeSnapshot(unit));
    }
    useGameStore.getState().setSelection(snapshots);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Control groups
  // ──────────────────────────────────────────────────────────────────────────

  /** @param {{code:string, ctrlKey:boolean, repeat:boolean}} p */
  _onKeyDown(p) {
    // Holding a digit must not machine-gun recalls (breaks double-tap timing).
    if (p.repeat) return;
    const digit = this._digitFromCode(p.code);
    if (digit === 0) return;

    if (p.ctrlKey) {
      this._assignGroup(digit);
    } else {
      this._recallGroup(digit);
    }
  }

  /**
   * Map a KeyboardEvent.code to a control-group digit.
   * @param {string} code
   * @returns {number} 1..9, or 0 when the code is not a top-row digit.
   */
  _digitFromCode(code) {
    // TODO(phase-5): numpad digits + rebindable hotkeys.
    if (!code.startsWith('Digit')) return 0;
    const n = code.charCodeAt(5) - 48; // 'Digit1' → 1 … 'Digit9' → 9
    return n >= 1 && n <= 9 ? n : 0;
  }

  /**
   * Ctrl+digit: snapshot the current unit selection into a group. Note the
   * browser may own Ctrl+1..8 (tab switching) — when it does, we simply never
   * see the event; nothing we can do from page JS.
   * @param {number} digit 1..9
   */
  _assignGroup(digit) {
    if (this.selected.size === 0) return; // WC3: assigning nothing is a no-op
    this._groups.set(digit, [...this.selected]);
  }

  /**
   * Digit: recall a group. Double-tapping the same digit within
   * GROUP_DOUBLE_TAP_SECONDS of *game time* also pans the camera to the
   * group's centroid (the classic "where's my army" reflex).
   * @param {number} digit 1..9
   */
  _recallGroup(digit) {
    const members = this._groups.get(digit);
    if (!members || members.length === 0) return;

    // Filter dead members defensively (update() prunes, but a unit can die
    // between the prune and this keypress within the same frame).
    _scratchUnits.length = 0;
    for (const unit of members) {
      if (!unit.isDead) _scratchUnits.push(unit);
    }
    if (_scratchUnits.length === 0) return;

    this._applySelection(_scratchUnits, false);

    // Double-tap detection on the game clock (contract: 350 ms of game time,
    // immune to pauses/hitches skewing wall-clock timing).
    const now = this.engine.gameTime;
    if (digit === this._lastRecallDigit && now - this._lastRecallTime <= GROUP_DOUBLE_TAP_SECONDS) {
      _centroid.set(0, 0, 0);
      for (const unit of _scratchUnits) _centroid.add(unit.position);
      _centroid.divideScalar(_scratchUnits.length);
      this.engine.cameraController.panTo(_centroid); // panTo copies x/z immediately
    }
    this._lastRecallDigit = digit;
    this._lastRecallTime = now;
  }
}
