/**
 * AIManager — owns one AIPlayerController per AI player and ticks them all.
 *
 * The engine calls `registerPlayer(player)` for every MatchConfig player of
 * type 'AI' at init, then `update(dt)` every frame. Controllers self-throttle
 * (each brain gates its own think/tick on the difficulty cadence) and start
 * with staggered phase offsets so multiple AIs never all "think" on the same
 * frame — keeping the AI cost spread smoothly across frames.
 */
import { AI_LEVELS, resolveAIProfile } from '../config/GameConfig.js';
import { MacroBrain } from './macro/MacroBrain.js';
import { MicroBrain } from './micro/MicroBrain.js';

/**
 * One AI player's brain pair (macro economy/production + micro combat).
 */
export class AIPlayerController {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   * @param {import('../engine/Player.js').Player} player
   */
  constructor(engine, player) {
    this.engine = engine;
    this.player = player;
    /** Difficulty profile (cadence, aggression, cheats). */
    this.profile = player.aiProfile ?? resolveAIProfile(player.difficulty ?? AI_LEVELS.CASUAL, player.personality);

    this.macro = new MacroBrain(engine, player, this.profile);
    this.micro = new MicroBrain(engine, player, this.profile);
    // Wire the macro→micro objective channel.
    this.macro.micro = this.micro;
  }

  /**
   * Tick both brains. Each internally gates on its own cadence, so calling
   * every frame is cheap for the many frames a brain decides to skip.
   * @param {number} dt
   */
  update(dt) {
    if (this.player.isDefeated) return;
    this.macro.update(dt);
    this.micro.update(dt);
  }

  getDiagnostics() {
    return this.macro.getDiagnostics();
  }

  dispose() {
    this.macro.dispose();
    this.micro.dispose();
    this.engine = null;
    this.player = null;
  }
}

export class AIManager {
  /**
   * @param {import('../engine/GameEngine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    /** @type {Map<number, AIPlayerController>} playerId → controller. */
    this.controllers = new Map();
  }

  /**
   * Register an AI player. Ignored for human players.
   * @param {import('../engine/Player.js').Player} player
   */
  registerPlayer(player) {
    if (player.type !== 'AI') return;
    this.controllers.set(player.id, new AIPlayerController(this.engine, player));
  }

  /**
   * Tick every controller.
   * @param {number} dt
   */
  update(dt) {
    for (const controller of this.controllers.values()) controller.update(dt);
  }

  getDiagnostics() {
    return [...this.controllers.values()].map((controller) => controller.getDiagnostics());
  }

  /** Dispose every controller. */
  dispose() {
    for (const controller of this.controllers.values()) controller.dispose();
    this.controllers.clear();
    this.engine = null;
  }
}
