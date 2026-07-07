/**
 * AudioManager — the game's single Howler wrapper (ARCHITECTURE.md §10).
 *
 * Responsibilities:
 *  - Own the SOUND_MANIFEST (every audio path the game may ever request).
 *  - Create Howls *lazily* — nothing loads until a sound is first requested.
 *  - Fail soft: **no audio files ship in v1**, so every missing file logs a
 *    single warning, marks the key dead, and never throws or retries.
 *  - Keep Howler's 3D listener glued to the game camera every frame so
 *    positional sfx pan/attenuate correctly as the player scrolls the map.
 *  - Provide the WC3-style unit acknowledgement channel
 *    (`playUnitResponse`) with per-kind anti-spam so 40 selected units
 *    don't shout 40 times.
 *  - Crossfade music tracks (menu ↔ battle).
 *  - Self-wire to the eventBus for combat/economy feedback sounds, and
 *    fully unsubscribe in dispose().
 *
 * The manifest + spatial plumbing is the v1 deliverable; actual .mp3 files
 * are dropped into /public/assets/audio later and Just Work.
 */
import { Howl, Howler } from 'howler';
import * as THREE from 'three';
import { eventBus, EVENTS } from '../engine/EventBus.js';
import { ARCHETYPE } from '../config/UnitTypes.js';

/**
 * SOUND_MANIFEST — canonical key → URL table for every sound in the game.
 *
 * Layout is part of the module contract:
 *   music.*  — long, looping, streamed (html5) tracks, never positional.
 *   sfx.*    — short one-shots, optionally positional via `playSfx`.
 *
 * The `response_*` keys are the generic unit-acknowledgement barks used by
 * `playUnitResponse`. Per-unit voice lines can be added later as
 * `unit_<typeId>_<kind>` keys and will be picked up automatically.
 */
export const SOUND_MANIFEST = {
  music: {
    menu: '/assets/audio/music_menu.mp3',
    battle: '/assets/audio/music_battle.mp3',
  },
  sfx: {
    click: '/assets/audio/sfx_click.mp3',
    attack_melee: '/assets/audio/sfx_attack_melee.mp3',
    attack_ranged: '/assets/audio/sfx_attack_ranged.mp3',
    unit_die: '/assets/audio/sfx_unit_die.mp3',
    build_place: '/assets/audio/sfx_build_place.mp3',
    // Generic acknowledgement barks (fallbacks for playUnitResponse).
    response_select: '/assets/audio/sfx_response_select.mp3',
    response_move: '/assets/audio/sfx_response_move.mp3',
    response_attack: '/assets/audio/sfx_response_attack.mp3',
    // TODO(phase-5): per-unit voice lines, e.g.
    //   unit_AK_TEMPLAR_select: '/assets/audio/voice/ak_templar_select.mp3'
    // playUnitResponse already prefers `unit_<typeId>_<kind>` when present.
  },
};

// ── Tuning constants ───────────────────────────────────────────────────────

/** Milliseconds a unit-response *kind* stays silenced after playing. */
const RESPONSE_COOLDOWN_MS = 400;
/** Milliseconds between impact sounds — combat emits UNIT_DAMAGED in bursts. */
const IMPACT_COOLDOWN_MS = 120;
/** Seconds between listener (Howler.pos/orientation) syncs — ~20 Hz is plenty. */
const LISTENER_SYNC_INTERVAL = 0.05;
/** Positional attenuation tuned for our 200×200 map + camera at height ~42. */
const PANNER_ATTR = {
  panningModel: 'HRTF',
  distanceModel: 'linear',
  refDistance: 25, // full volume within roughly one screen of the listener
  maxDistance: 220, // silent past the far corner of the map
  rolloffFactor: 1,
};

/** Spoken phrases for blocked purchases (PHASE5_PROMPT.md §3.3). */
const REJECTION_PHRASES = {
  GOLD: 'Not enough gold.',
  AETHER: 'Not enough aether.',
  SUPPLY: 'You must construct additional supply.',
  REQUIREMENTS: 'Requirements not met.',
};

// ── Module-scope scratch objects (no per-frame allocations) ────────────────
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lastPos = new THREE.Vector3(Infinity, Infinity, Infinity);
const _lastForward = new THREE.Vector3(Infinity, Infinity, Infinity);

/**
 * The audio subsystem. One instance is created by the GameEngine and exposed
 * as `engine.audio`; other systems call `engine.audio.playSfx(...)` etc.
 * (never import Howler directly).
 */
export class AudioManager {
  constructor() {
    /**
     * Lazily-created Howl instances, keyed `"music:menu"`, `"sfx:click"`, …
     * @type {Map<string, Howl>}
     */
    this._howls = new Map();

    /**
     * Keys whose file failed to load. Dead keys are silently skipped forever
     * after their single warning — this is the "fail soft" guarantee.
     * @type {Set<string>}
     */
    this._dead = new Set();

    /** @type {THREE.Camera|null} Camera the 3D listener follows. */
    this._camera = null;

    /** Currently playing music track: { key, howl, id } | null. */
    this._music = null;

    /** Category volume knobs (master volume is Howler-global). */
    this._musicVolume = 0.40;
    this._sfxVolume = 0.70;

    /**
     * Anti-spam clocks for playUnitResponse, one per response kind.
     * Timestamps come from performance.now() — this is presentation-layer
     * throttling, not simulation state, so wall-clock time is correct here
     * (it must also work before the engine loop starts ticking update()).
     * @type {Record<string, number>}
     */
    this._responseLastMs = { select: -Infinity, move: -Infinity, attack: -Infinity };

    /** Per-phrase anti-spam clock for speak() (Web Speech). @type {Map<string,number>} */
    this._spokenAtMs = new Map();

    /** Wall-clock timestamp of the last impact sfx (UNIT_DAMAGED throttle). */
    this._impactLastMs = -Infinity;

    /** Accumulator that throttles listener syncing inside update(). */
    this._listenerSyncTimer = 0;

    /** True after dispose(); guards every public entry point. */
    this._disposed = false;

    /**
     * eventBus unsubscribe functions, collected so dispose() can detach
     * everything in one sweep.
     * @type {Function[]}
     */
    this._unsubscribes = [
      // Combat impact: throttled, positioned at the victim, melee/ranged
      // flavor chosen from the attacker's archetype.
      eventBus.on(EVENTS.UNIT_DAMAGED, (p) => this._onUnitDamaged(p)),
      // Death rattle at the fallen unit's position.
      eventBus.on(EVENTS.UNIT_DIED, (p) => this._onUnitDied(p)),
      // Construction thud where the building went down.
      eventBus.on(EVENTS.BUILDING_PLACED, (p) => this._onBuildingPlaced(p)),
      // Match kickoff → swap to (or start) the battle track.
      eventBus.on(EVENTS.MATCH_STARTED, () => this.playMusic('battle')),
      // Blocked purchase → spoken "Not enough Gold." (emitted local-player only).
      eventBus.on(EVENTS.COMMAND_REJECTED, (p) => this._onCommandRejected(p)),
    ];
  }

  /**
   * Async initialization hook awaited by GameEngine.create().
   *
   * Deliberately lightweight: Howls are created lazily on first play, so
   * there is nothing to preload and *nothing here can throw* — a game with
   * zero audio files must boot identically to one with all of them.
   * @returns {Promise<void>}
   */
  async init() {
    // Howler unlocks its AudioContext automatically on the first user
    // gesture (autoUnlock defaults to true); we just make it explicit.
    Howler.autoUnlock = true;
    // Reasonable master default; UI options can override via setMasterVolume.
    Howler.volume(1.0);
    // TODO(phase-5): read persisted volume settings from an options store.
  }

  /**
   * Point the 3D listener at a camera. Called once by the engine after the
   * scene/camera exist; update() then tracks it every frame.
   * @param {THREE.Camera} camera
   */
  attachCamera(camera) {
    this._camera = camera;
    // Force an immediate sync next update by invalidating the caches.
    _lastPos.set(Infinity, Infinity, Infinity);
    _lastForward.set(Infinity, Infinity, Infinity);
  }

  /**
   * Per-frame tick (engine update order: `audio.update(dt)` right before the
   * HUD sync). Mirrors the camera transform into Howler's 3D listener so
   * positional sfx pan and attenuate with the view.
   *
   * Cheap by design: throttled to LISTENER_SYNC_INTERVAL and skipped
   * entirely when the camera hasn't moved or turned.
   * @param {number} dt - Frame delta in seconds.
   */
  update(dt) {
    if (this._disposed || !this._camera) return;

    // Throttle — the listener doesn't need sub-frame precision.
    this._listenerSyncTimer += dt;
    if (this._listenerSyncTimer < LISTENER_SYNC_INTERVAL) return;
    this._listenerSyncTimer = 0;

    const cam = this._camera;
    cam.getWorldDirection(_forward); // reuses scratch, no allocation
    // World-space up = second column of the camera's world matrix.
    _up.setFromMatrixColumn(cam.matrixWorld, 1);

    // Skip the (comparatively pricey) Howler calls when nothing changed —
    // e.g. the player is reading the HUD and the camera is parked.
    const moved = _lastPos.distanceToSquared(cam.position) > 1e-4;
    const turned = _lastForward.distanceToSquared(_forward) > 1e-6;
    if (!moved && !turned) return;
    _lastPos.copy(cam.position);
    _lastForward.copy(_forward);

    Howler.pos(cam.position.x, cam.position.y, cam.position.z);
    Howler.orientation(_forward.x, _forward.y, _forward.z, _up.x, _up.y, _up.z);
  }

  /**
   * Play (or crossfade to) a music track.
   * @param {string} key - Key in SOUND_MANIFEST.music ('menu' | 'battle').
   * @param {{fade?: number}} [opts] - Crossfade duration in milliseconds.
   */
  playMusic(key, { fade = 1000 } = {}) {
    if (this._disposed) return;
    if (this._music && this._music.key === key) return; // already playing it

    // ── Fade out (then stop) whatever is currently playing ──────────────
    const old = this._music;
    if (old) {
      const { howl, id } = old;
      if (fade > 0) {
        howl.fade(howl.volume(id), 0, fade, id);
        // Stop the instance once its fade completes so the loop doesn't
        // keep decoding silently in the background.
        howl.once('fade', () => howl.stop(id), id);
      } else {
        howl.stop(id);
      }
      this._music = null;
    }

    // ── Fade in the new track ────────────────────────────────────────────
    const howl = this._getHowl('music', key);
    if (!howl) return; // missing/dead file — already warned, fail soft
    const startVol = fade > 0 ? 0 : this._musicVolume;
    const id = howl.play();
    howl.volume(startVol, id);
    if (fade > 0) howl.fade(0, this._musicVolume, fade, id);
    this._music = { key, howl, id };
  }

  /**
   * Play a one-shot sound effect, optionally positioned in the 3D world.
   * @param {string} key - Key in SOUND_MANIFEST.sfx.
   * @param {{position?: THREE.Vector3, volume?: number}} [opts]
   *   position — world-space source; omitted = flat 2D playback (UI sounds).
   *   volume   — 0..1 multiplier on top of the sfx category volume.
   */
  playSfx(key, { position, volume = 1 } = {}) {
    if (this._disposed) return;
    const howl = this._getHowl('sfx', key);
    if (!howl) return; // fail soft
    const id = howl.play();
    howl.volume(volume * this._sfxVolume, id);
    if (position) {
      // Per-instance spatialization: attach panner attributes *before*
      // positioning so the linear falloff applies from the first sample.
      howl.pannerAttr(PANNER_ATTR, id);
      howl.pos(position.x, position.y, position.z, id);
    }
  }

  /**
   * WC3-style unit acknowledgement ("Yes, milord!"). Prefers a per-unit
   * voice line (`unit_<typeId>_<kind>` in the manifest) and falls back to
   * the generic `response_<kind>` bark.
   *
   * Anti-spam: each *kind* ('select'|'move'|'attack') may fire at most once
   * per RESPONSE_COOLDOWN_MS (400 ms) no matter how many units are selected
   * or how fast the player spams right-click.
   * @param {string} typeId - Unit type id (e.g. 'AK_TEMPLAR').
   * @param {'select'|'move'|'attack'} kind - Which acknowledgement to play.
   */
  playUnitResponse(typeId, kind) {
    if (this._disposed) return;
    const now = performance.now();
    const last = this._responseLastMs[kind] ?? -Infinity;
    if (now - last < RESPONSE_COOLDOWN_MS) return; // still on cooldown
    this._responseLastMs[kind] = now;

    // Specific voice line if one exists, otherwise the generic bark.
    const specific = `unit_${typeId}_${kind}`;
    const key = SOUND_MANIFEST.sfx[specific] ? specific : `response_${kind}`;
    // Acknowledgements play 2D (no position) — they're player feedback,
    // not world sounds, exactly like WC3.
    this.playSfx(key, { volume: 0.9 });
  }

  /**
   * Speak a short phrase via the Web Speech API (SpeechSynthesis). Zero-asset
   * voice feedback (PHASE5_PROMPT.md D2); a silent no-op where unsupported so a
   * browser without TTS still gets the toast. Per-text anti-spam keeps a mashed
   * button from stuttering the same line.
   * @param {string} text
   * @param {{dedupeMs?:number}} [opts]
   */
  speak(text, { dedupeMs = 1500 } = {}) {
    if (this._disposed) return;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return;
    const now = performance.now();
    if (now - (this._spokenAtMs.get(text) ?? -Infinity) < dedupeMs) return;
    this._spokenAtMs.set(text, now);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.volume = 0.7;
      u.rate = 1.0;
      u.pitch = 0.9;
      synth.speak(u);
    } catch {
      /* never let TTS take down the game */
    }
  }

  /**
   * EVENTS.COMMAND_REJECTED → speak the matching shortfall phrase.
   * @param {{reason:'GOLD'|'AETHER'|'SUPPLY'|'REQUIREMENTS', reqName?:string, isUpgradeRequirement?:boolean}} p
   * @private
   */
  _onCommandRejected(p) {
    let phrase = REJECTION_PHRASES[p?.reason];
    if (p?.reason === 'REQUIREMENTS') {
      if (p.isUpgradeRequirement) {
        phrase = `Need to research ${p.reqName}.`;
      } else {
        phrase = `Need to construct ${p.reqName}.`;
      }
    }
    if (phrase) this.speak(phrase);
  }

  /**
   * Set the global master volume (affects every Howl at once).
   * @param {number} v - 0 (mute) .. 1 (full).
   */
  setMasterVolume(v) {
    Howler.volume(Math.min(1, Math.max(0, v)));
  }

  /** Immediately stop every playing sound (music included, no fade). */
  stopAll() {
    for (const howl of this._howls.values()) howl.stop();
    this._music = null;
  }

  /**
   * Full teardown: stop + unload every Howl, detach every eventBus
   * subscription, and drop the camera reference. Safe to call twice.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    // Unsubscribe every eventBus listener registered in the constructor.
    for (const off of this._unsubscribes) off();
    this._unsubscribes.length = 0;

    this.stopAll();
    for (const howl of this._howls.values()) {
      howl.off(); // drop any pending 'fade'/'loaderror' callbacks
      howl.unload(); // free the decoded buffers / html5 nodes
    }
    this._howls.clear();
    this._dead.clear();
    this._spokenAtMs.clear();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    this._camera = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Lazily create (or fetch the cached) Howl for a manifest entry.
   * Unknown keys and previously-failed loads return null after at most one
   * console warning — callers just skip playback.
   * @param {'music'|'sfx'} category
   * @param {string} key
   * @returns {Howl|null}
   * @private
   */
  _getHowl(category, key) {
    const cacheKey = `${category}:${key}`;
    if (this._dead.has(cacheKey)) return null; // known-bad, already warned

    const cached = this._howls.get(cacheKey);
    if (cached) return cached;

    const src = SOUND_MANIFEST[category]?.[key];
    if (!src) {
      // Programmer error (typo'd key) — warn once, then stay quiet.
      this._dead.add(cacheKey);
      console.warn(`[AudioManager] Unknown sound key "${cacheKey}" — check SOUND_MANIFEST.`);
      return null;
    }

    const isMusic = category === 'music';
    const howl = new Howl({
      src: [src],
      loop: isMusic,
      // Stream long music tracks through an <audio> element instead of
      // decoding the whole file into memory; sfx use WebAudio buffers so
      // they can be spatialized per-instance.
      html5: isMusic,
      preload: true,
      onloaderror: () => {
        // THE fail-soft path: v1 ships zero audio files, so every key lands
        // here on first use. Warn once, mark dead, never throw, never retry.
        if (!this._dead.has(cacheKey)) {
          this._dead.add(cacheKey);
          console.warn(`[AudioManager] Missing audio file "${src}" (key ${cacheKey}) — failing soft.`);
        }
        // Drop the broken Howl so we don't keep a zombie in the cache.
        howl.unload();
        this._howls.delete(cacheKey);
        if (this._music && this._music.howl === howl) this._music = null;
      },
      onplayerror: () => {
        // Autoplay policy block: Howler retries automatically after the
        // next user gesture (autoUnlock). Nothing for us to do — but never
        // let it surface as an exception.
      },
    });

    this._howls.set(cacheKey, howl);
    return howl;
  }

  /**
   * EVENTS.UNIT_DAMAGED → throttled impact sfx at the victim's position.
   * Combat can emit dozens of these per second in a big fight, so a global
   * IMPACT_COOLDOWN_MS gate keeps the mix (and the CPU) sane.
   * @param {{entity: object, amount: number, attacker: object}} payload
   * @private
   */
  _onUnitDamaged({ entity, attacker }) {
    const now = performance.now();
    if (now - this._impactLastMs < IMPACT_COOLDOWN_MS) return;
    this._impactLastMs = now;

    // Ranged attackers get the projectile "thunk", everyone else the clang.
    const ranged = attacker?.type?.archetype === ARCHETYPE.RANGED;
    this.playSfx(ranged ? 'attack_ranged' : 'attack_melee', {
      position: entity?.position,
      volume: 0.8,
    });
  }

  /**
   * EVENTS.UNIT_DIED → death sfx where the unit fell.
   * @param {{entity: object, killer: object}} payload
   * @private
   */
  _onUnitDied({ entity }) {
    this.playSfx('unit_die', { position: entity?.position, volume: 0.9 });
  }

  /**
   * EVENTS.BUILDING_PLACED → construction thud at the build site.
   * @param {{entity: object}} payload
   * @private
   */
  _onBuildingPlaced({ entity }) {
    this.playSfx('build_place', { position: entity?.position });
  }
}
