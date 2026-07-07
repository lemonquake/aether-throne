/**
 * FloatingTextManager — world-anchored "+N" / status text that rises and fades.
 *
 * Phase 5 feature (PHASE5_PROMPT.md §3.2 / §3.5). The classic Warcraft 3
 * feedback: a worker delivers gold and a golden "+10" floats up over the hall;
 * a unit takes a crit and a red number pops over its head.
 *
 * Design (matches the engine's pooling ethos — see ProjectilePool / the
 * CommandSystem marker pool):
 *  - A FIXED pool of THREE.Sprites is created once. Each slot owns a small
 *    <canvas> + CanvasTexture so it can display arbitrary short strings
 *    ("+10", "Not enough Gold") without a shared glyph atlas.
 *  - spawn() happens at human / gather rate (never per frame), so drawing text
 *    into a slot's canvas on spawn is fine — it is NOT a hot-loop allocation.
 *  - update(dt) only moves + fades live slots: zero allocation, no canvas
 *    redraws. When the pool wraps, the oldest live text is simply reused.
 *  - Sprites are world-anchored (size-attenuated) so they shrink as you zoom
 *    out and sit above the battlefield; depthTest is off so they always read.
 *
 * It self-subscribes to EVENTS.RESOURCE_DEPOSITED and renders "+N" **only for
 * the local player** (AI economy churn must not clutter the screen). Other
 * systems can call `spawn()` directly for damage numbers, ability text, etc.
 */
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { eventBus, EVENTS } from '../engine/EventBus.js';

const FX = GAME_CONFIG.FX;

/** Resource-tint hexes for the deposit "+N" text. */
const GOLD_HEX = '#f0cf6e';
const AETHER_HEX = '#7fe9ff';
/** Combat damage-number tint. */
const DAMAGE_HEX = '#ff6a58';

/** Canvas backing-store size per slot (kept small — text is short). */
const CANVAS_W = 160;
const CANVAS_H = 96;

// ── Module-scope scratch (no per-frame allocations) ─────────────────────────
const _pos = new THREE.Vector3();

export class FloatingTextManager {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine - Injected engine.
   * @param {number} [poolSize] - Number of simultaneous text sprites.
   */
  constructor(engine, poolSize = FX.FLOATING_TEXT_POOL) {
    this.engine = engine;

    /**
     * Fixed pool of text slots. Each owns its canvas/texture/material because
     * the string differs per spawn; the sprite geometry is implicit.
     * @type {Array<{sprite:THREE.Sprite, canvas:HTMLCanvasElement,
     *   ctx:CanvasRenderingContext2D, texture:THREE.CanvasTexture,
     *   material:THREE.SpriteMaterial, ttl:number, startY:number}>}
     */
    this._slots = [];
    for (let i = 0; i < poolSize; i++) this._slots.push(this._makeSlot());

    /** Ring cursor — oldest slot is recycled when the pool is saturated. */
    this._cursor = 0;

    /** Small horizontal jitter cursor so stacked damage numbers don't overlap. */
    this._jitter = 0;

    // Self-wire: local-player deposits pop a "+N"; combats the local player is
    // involved in pop a red damage "-N".
    this._unsubs = [
      eventBus.on(EVENTS.RESOURCE_DEPOSITED, (p) => this._onDeposit(p)),
      eventBus.on(EVENTS.UNIT_DAMAGED, (p) => this._onDamage(p)),
    ];
  }

  /**
   * Build one pooled text slot (called poolSize times at construction).
   * @returns {object}
   * @private
   */
  _makeSlot() {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // always readable over the battlefield (flat map)
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(FX.FLOATING_TEXT_SCALE, FX.FLOATING_TEXT_SCALE * (CANVAS_H / CANVAS_W), 1);
    sprite.renderOrder = 10; // draw after opaque scene + rings/markers
    sprite.visible = false;
    this.engine.scene.add(sprite);

    return { sprite, canvas, ctx, texture, material, ttl: 0, startY: 0, duration: FX.FLOATING_TEXT_DURATION };
  }

  /**
   * Spawn a rising, fading text at a world position.
   * @param {THREE.Vector3} worldPos - Anchor (copied, not retained).
   * @param {string} text - Short string ("+10").
   * @param {string} colorHex - Fill color ('#rrggbb').
   * @param {{ scale?: number, duration?: number, jitter?: number }} [opts]
   */
  spawn(worldPos, text, colorHex, opts = {}) {
    const slot = this._slots[this._cursor];
    this._cursor = (this._cursor + 1) % this._slots.length;

    this._draw(slot, text, colorHex);

    const scale = opts.scale ?? FX.FLOATING_TEXT_SCALE;
    slot.sprite.scale.set(scale, scale * (CANVAS_H / CANVAS_W), 1);
    slot.duration = opts.duration ?? FX.FLOATING_TEXT_DURATION;

    _pos.copy(worldPos);
    slot.startY = _pos.y + 2.2; // start a bit above the anchor
    slot.sprite.position.set(_pos.x + (opts.jitter ?? 0), slot.startY, _pos.z);
    slot.material.opacity = 1;
    slot.sprite.visible = true;
    slot.ttl = slot.duration;
  }

  /**
   * Redraw a slot's canvas with new text (outline for legibility over any
   * background). Only ever called on spawn — never per frame.
   * @private
   */
  _draw(slot, text, colorHex) {
    const { ctx } = slot;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, CANVAS_W / 2, CANVAS_H / 2);
    ctx.fillStyle = colorHex;
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
    slot.texture.needsUpdate = true;
  }

  /**
   * Per-frame: raise + fade every live slot. Allocation-free.
   * @param {number} dt - Clamped frame delta (seconds).
   */
  update(dt) {
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.ttl <= 0) continue;
      slot.ttl -= dt;
      if (slot.ttl <= 0) {
        slot.ttl = 0;
        slot.sprite.visible = false;
        continue;
      }
      const t = 1 - slot.ttl / slot.duration; // 0 → 1 over the sprite's life
      slot.sprite.position.y = slot.startY + FX.FLOATING_TEXT_RISE * t;
      // Hold near-full for the first half, then fade out — reads as a "pop".
      slot.material.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    }
  }

  /**
   * EVENTS.RESOURCE_DEPOSITED → "+N" for the local player only.
   * @param {{player:object, kind:'gold'|'aether', amount:number, position:THREE.Vector3}} p
   * @private
   */
  _onDeposit(p) {
    if (!p || p.player !== this.engine.localPlayer) return;
    if (!p.amount || p.amount <= 0) return;
    this.spawn(p.position, `+${p.amount}`, p.kind === 'aether' ? AETHER_HEX : GOLD_HEX);
  }

  /**
   * EVENTS.UNIT_DAMAGED → a red "-N" over the victim, but only for combats the
   * local player is involved in (their unit is hitting or being hit) so a large
   * AI-vs-AI brawl doesn't bury the screen in numbers.
   * @param {{entity:object, amount:number, attacker:object}} p
   * @private
   */
  _onDamage(p) {
    if (!p || !p.entity || !p.entity.position) return;
    const amount = Math.round(p.amount);
    if (amount < 1) return;
    const local = this.engine.localPlayer;
    const involved = p.entity.player === local || p.attacker?.player === local;
    if (!involved) return;
    // Cycle a small horizontal jitter so rapid hits fan out instead of stacking.
    this._jitter = (this._jitter + 1) % 5;
    const jitter = (this._jitter - 2) * 0.35;
    this.spawn(p.entity.position, `-${amount}`, DAMAGE_HEX, {
      scale: FX.DAMAGE_TEXT_SCALE,
      duration: FX.DAMAGE_TEXT_DURATION,
      jitter,
    });
  }

  /** Detach subscriptions and free GPU resources. */
  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs = [];
    for (const slot of this._slots) {
      this.engine.scene.remove(slot.sprite);
      slot.material.dispose();
      slot.texture.dispose();
    }
    this._slots = [];
    this.engine = null;
  }
}
