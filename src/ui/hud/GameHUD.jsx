/**
 * GameHUD — the in-match overlay (screen === SCREENS.IN_GAME).
 *
 * Pointer-events contract (ARCHITECTURE.md §11): the root `div.hud-root` is
 * `pointer-events: none` so every click/drag that isn't on a widget falls
 * through to the RTS canvas below. Interactive islands opt back in with the
 * `.hud-interactive` class. The top bar is deliberately left pass-through —
 * it is display-only chrome, and eating pointermove there would break
 * edge-scrolling along the top of the screen; only its Menu button re-enables.
 *
 * Data flows ONE WAY: engine → useGameStore → these components. The HUD
 * never touches simulation objects — it renders the plain snapshots the
 * engine pushes on its throttled sync (HUD_SYNC_INTERVAL) and on selection
 * changes. Each region below is its own component with its own zustand
 * selector, so a clock tick re-renders the top bar without touching the
 * selection card grid, and vice versa.
 *
 * The ONLY engine-side import allowed here is GameBootstrap.js, used for the
 * exit path: teardownMatch() → exitToMenu() + resetGameState().
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../state/useGameStore.js';
import { useLobbyStore } from '../../state/useLobbyStore.js';
import { teardownMatch, getEngine } from '../../GameBootstrap.js';
import { getCommandCard, getBuildMenu } from '../../config/CommandCards.js';
import { get3DPortrait } from '../../world/PortraitRenderer.js';
import { getUpgradeIcon } from '../../world/UpgradeIconRenderer.js';
import Minimap from './Minimap.jsx';


/** Selection cards rendered before collapsing into a "+N more" chip. */
const MAX_SELECTION_CARDS = 24;

/* ════════════════════════════════════════════════════════════════════
   Small pure helpers
   ════════════════════════════════════════════════════════════════════ */

/**
 * Format elapsed game seconds as m:ss (RTS-style match clock).
 * @param {number} seconds
 * @returns {string}
 */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Map an hp fraction to its ui.css color class (green/amber/red).
 * @param {number} fraction 0..1
 * @returns {string}
 */
function hpClass(fraction) {
  if (fraction >= 0.66) return 'hp-high';
  if (fraction >= 0.33) return 'hp-mid';
  return 'hp-low';
}

/* ════════════════════════════════════════════════════════════════════
   Resource icons — tiny inline SVGs so the HUD ships zero image assets.
   Colors are hardcoded hex (SVG presentation attributes cannot resolve
   CSS custom properties); they mirror the ui.css tokens.
   ════════════════════════════════════════════════════════════════════ */

/** Gold coin. @returns {JSX.Element} */
function GoldIcon() {
  return (
    <svg className="res-icon" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5.4" fill="#c9a227" stroke="#f0cf6e" strokeWidth="1" />
      <circle cx="6.5" cy="6.5" r="2.6" fill="none" stroke="#7a5e14" strokeWidth="1" />
    </svg>
  );
}

/** Aether shard. @returns {JSX.Element} */
function AetherIcon() {
  return (
    <svg className="res-icon" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      {/* Four-point crystal shard with a bright core. */}
      <path d="M6.5 0.6 L8.4 6.5 L6.5 12.4 L4.6 6.5 Z" fill="#5fe0ff" opacity="0.9" />
      <path d="M0.6 6.5 L6.5 4.9 L12.4 6.5 L6.5 8.1 Z" fill="#5fe0ff" opacity="0.55" />
      <circle cx="6.5" cy="6.5" r="1.3" fill="#eafcff" />
    </svg>
  );
}

/** Supply banner/tent. @returns {JSX.Element} */
function SupplyIcon() {
  return (
    <svg className="res-icon" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      {/* A simple war banner: pole + pennant. */}
      <rect x="2.6" y="1" width="1.4" height="11" rx="0.7" fill="#9a96a8" />
      <path d="M4 1.6 L11.4 3.4 L4 5.8 Z" fill="#e8e4d8" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HUD regions
   ════════════════════════════════════════════════════════════════════ */

/**
 * Top bar: match clock, gold/aether/supply, fps, and the Menu button.
 * Subscribes to the throttled engine sync fields only.
 * @param {{ menuOpen: boolean, onToggleMenu: () => void }} props
 * @returns {JSX.Element}
 */
function TopBar({ menuOpen, onToggleMenu }) {
  // `resources` is replaced wholesale by the engine sync, so object identity
  // is a correct (and cheap) change signal for this selector.
  const resources = useGameStore((s) => s.resources);
  const gameTime = useGameStore((s) => s.gameTime);
  const fps = useGameStore((s) => s.fps);
  const resourceAlert = useGameStore((s) => s.resourceAlert);
  const resourceAlertSeq = useGameStore((s) => s.resourceAlertSeq);
  const clearResourceAlert = useGameStore((s) => s.clearResourceAlert);
  const observer = useGameStore((s) => s.observer);

  // A blocked purchase flashes the offending chip red, then clears itself.
  useEffect(() => {
    if (!resourceAlert) return undefined;
    const t = setTimeout(clearResourceAlert, 700);
    return () => clearTimeout(t);
  }, [resourceAlert, resourceAlertSeq, clearResourceAlert]);

  // WC3-style supply block warning: used has reached cap.
  const supplyBlocked = resources.supplyCap > 0 && resources.supplyUsed >= resources.supplyCap;

  return (
    <div className="hud-topbar">
      <span className="hud-clock" title="Match time">
        {formatClock(gameTime)}
      </span>

      <div className="res-group">
        {observer.enabled && <span className="fps-chip observer-chip" title="Observer mode">Observer</span>}
        <span className={`res-chip res-gold${resourceAlert === 'GOLD' ? ' res-flash' : ''}`} title="Gold">
          <GoldIcon />
          {Math.floor(resources.gold)}
        </span>
        <span className={`res-chip res-aether${resourceAlert === 'AETHER' ? ' res-flash' : ''}`} title="Aether">
          <AetherIcon />
          {Math.floor(resources.aether)}
        </span>
        <span
          className={`res-chip res-supply${supplyBlocked ? ' supply-blocked' : ''}${
            resourceAlert === 'SUPPLY' ? ' res-flash' : ''
          }`}
          title={supplyBlocked ? 'Supply blocked — build more supply structures' : 'Supply'}
        >
          <SupplyIcon />
          {resources.supplyUsed}/{resources.supplyCap}
        </span>

        <span className="fps-chip" title="Frames per second">
          {Math.round(fps)} fps
        </span>

        {/* The bar itself is pass-through; only this button takes clicks. */}
        <button
          type="button"
          className="btn btn-small hud-menu-btn hud-interactive"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          onClick={onToggleMenu}
        >
          Menu
        </button>
      </div>
    </div>
  );
}

/**
 * The in-game menu popover: resume or surrender/exit.
 * @param {{ onClose: () => void, onSurrender: () => void }} props
 * @returns {JSX.Element}
 */
function MenuPopover({ onClose, onSurrender }) {
  return (
    <div className="panel hud-menu-pop hud-interactive" role="menu" aria-label="Game menu">
      <h3>War Council</h3>
      <button type="button" className="btn btn-small" role="menuitem" onClick={onClose}>
        Return to Battle
      </button>
      {/* TODO(phase-5): Options entry (audio sliders via AudioManager, camera
          sensitivity) and Save/Load once persistence exists. */}
      <button
        type="button"
        className="btn btn-small btn-danger"
        role="menuitem"
        onClick={onSurrender}
      >
        Surrender &amp; Exit
      </button>
    </div>
  );
}

/* ── Group formation bar (Phase 5 §3.10) ─────────────────────────────── */

/** Formation buttons — ids match FormationController.FORMATIONS. */
const FORMATION_BUTTONS = [
  { id: 'LOOSE', label: 'Loose' },
  { id: 'BOX', label: 'Box' },
  { id: 'LINE', label: 'Line' },
  { id: 'COLUMN', label: 'Column' },
  { id: 'WEDGE', label: 'Wedge' },
];

/** Building archetypes never counted toward "a group of units". */
const BUILDING_ARCHETYPES = new Set(['HALL', 'BARRACKS', 'SUPPLY']);

/**
 * Formation switcher — shown only when 2+ of your own units are selected.
 * Buttons drive engine.ui.setFormation, which re-forms the group in place.
 * @returns {JSX.Element|null}
 */
function FormationBar() {
  const selection = useGameStore((s) => s.selection);
  const [active, setActive] = useState('LOOSE');

  const ownUnits = selection.filter((u) => u.own && !BUILDING_ARCHETYPES.has(u.archetype)).length;
  if (ownUnits < 2) return null;

  return (
    <div className="panel hud-formations hud-interactive" aria-label="Group formation">
      <span className="fmt-label">Formation</span>
      <div className="fmt-btns">
        {FORMATION_BUTTONS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`fmt-btn${active === f.id ? ' fmt-active' : ''}`}
            onClick={() => { setActive(f.id); getEngine()?.ui.setFormation(f.id); }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Unit portraits (procedural crests) ──────────────────────────────── */

/** Archetype → simple SVG glyph path (24×24 viewBox). */
const ARCHETYPE_GLYPH = {
  WORKER: 'M5 19 L13 11 M9 8 A6 6 0 0 1 16 15',
  MELEE: 'M12 3 L12 16 M8 13 L16 13 M12 20 L12 16',
  RANGED: 'M4 20 L20 4 M20 4 L14 4 M20 4 L20 10 M4 20 L4 15 M4 20 L9 20',
  HALL: 'M4 20 L4 9 L8 9 L8 6 L11 6 L11 9 L14 9 L14 6 L17 6 L17 9 L20 9 L20 20 Z',
  BARRACKS: 'M7 3 L7 21 M7 4 L18 6 L7 11 Z',
  SUPPLY: 'M4 20 L12 5 L20 20 Z M12 20 L12 13',
};
const DEFAULT_GLYPH = 'M12 3 L20 12 L12 21 L4 12 Z';

/**
 * A procedural "portrait" crest: a dark shield tinted with the owner's color
 * and stamped with an archetype glyph. Zero art assets (PHASE5_PROMPT.md D4);
 * a live 3D portrait render is a documented stretch goal.
 * @param {{archetype:?string, color:string, size?:number}} props
 * @returns {JSX.Element}
 */
function Portrait({ archetype, color, size = 64, typeId = null }) {
  if (typeId) {
    const portraitUrl = get3DPortrait(typeId, color);
    if (portraitUrl) {
      return (
        <div className="portrait-container" style={{ width: size, height: size, position: 'relative' }}>
          <img 
            className="portrait-img" 
            src={portraitUrl} 
            alt={archetype} 
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover', 
              borderRadius: '4px',
              border: `1px solid ${color}`,
              background: '#070b16'
            }} 
          />
        </div>
      );
    }
  }
  const glyph = ARCHETYPE_GLYPH[archetype] ?? DEFAULT_GLYPH;
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="4" fill="#070b16" />
      <rect x="1" y="1" width="22" height="22" rx="4" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
      <path d={glyph} fill="none" stroke="#f0cf6e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Capitalize a SHOUTY enum label for display ('PIERCE' → 'Pierce'). */
function titleCase(s) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
}

/**
 * WC3-style stat readout for a single selected unit (PHASE5_PROMPT.md §3.7).
 * @param {{u:object}} props
 * @returns {JSX.Element}
 */
function UnitDetails({ u }) {
  const hpFrac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
  return (
    <div className="unit-details">
      <div className="ud-name">{u.name}</div>
      <div className="ud-stats">
        {u.damageMax > 0 && (
          <div className="ud-stat"><span className="k">Attack</span><span className="v">{u.damageMin}–{u.damageMax} {titleCase(u.attackType)}</span></div>
        )}
        <div className="ud-stat"><span className="k">Armor</span><span className="v">{u.armor} {titleCase(u.armorType)}</span></div>
        {u.attackRange > 0 && (
          <div className="ud-stat"><span className="k">Range</span><span className="v">{u.attackRange}</span></div>
        )}
        {u.moveSpeed > 0 && (
          <div className="ud-stat"><span className="k">Speed</span><span className="v">{u.moveSpeed}</span></div>
        )}
        <div className="ud-stat"><span className="k">Sight</span><span className="v">{u.sight}</span></div>
      </div>
      <div className="ud-bars">
        <div className="ud-bar-row">
          <span className="k">HP</span>
          <div className="stat-bar">
            <div className={`stat-bar-fill ${hpClass(hpFrac)}`} style={{ width: `${Math.max(0, Math.min(1, hpFrac)) * 100}%` }} />
          </div>
          <span className="ud-bar-num">{Math.ceil(u.hp)}/{u.maxHp}</span>
        </div>
        {u.maxMana > 0 && (
          <div className="ud-bar-row">
            <span className="k">MP</span>
            <div className="stat-bar mana-bar">
              <div className="stat-bar-fill mana-fill" style={{ width: `${Math.max(0, Math.min(1, u.mana / u.maxMana)) * 100}%` }} />
            </div>
            <span className="ud-bar-num">{Math.ceil(u.mana)}/{u.maxMana}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bottom-left unit panel: a portrait plus either a single-unit stat readout or
 * a multi-select wireframe grid. Renders only the plain snapshots pushed by
 * SelectionSystem. Interactive so clicks don't fall through and clear the
 * selection; double-clicking a card selects all of that type on screen (§3.6).
 * @returns {JSX.Element|null}
 */
function SelectionPanel() {
  const selection = useGameStore((s) => s.selection);
  if (selection.length === 0) return null;

  const single = selection.length === 1;
  const primary = selection[0];
  const visible = selection.slice(0, MAX_SELECTION_CARDS);
  const overflow = selection.length - visible.length;

  return (
    <div className="panel hud-selection hud-interactive" aria-label="Selected units">
      <div className="sel-portrait-col">
        <Portrait archetype={primary.archetype} color={primary.color} size={74} typeId={primary.typeId} />
        {!single && <span className="sel-count">{selection.length}</span>}
      </div>

      {single ? (
        <UnitDetails u={primary} />
      ) : (
        <div className="sel-grid">
          {visible.map((u) => {
            const hpFrac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
            return (
              <div
                className="sel-card"
                key={u.id}
                title={`${u.name} — ${Math.ceil(u.hp)}/${u.maxHp} HP (double-click: select all of type)`}
                onDoubleClick={() => u.own && getEngine()?.selection.selectAllOfTypeOnScreen(u.typeId)}
              >
                <Portrait archetype={u.archetype} color={u.color} size={40} typeId={u.typeId} />
                <div className="stat-bar">
                  <div className={`stat-bar-fill ${hpClass(hpFrac)}`} style={{ width: `${Math.max(0, Math.min(1, hpFrac)) * 100}%` }} />
                </div>
                {u.maxMana > 0 && (
                  <div className="stat-bar mana-bar">
                    <div className="stat-bar-fill mana-fill" style={{ width: `${Math.max(0, Math.min(1, u.mana / u.maxMana)) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {overflow > 0 && (
            <span className="sel-more" title={`${overflow} more units selected`}>+{overflow} more</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Command card (functional, Phase 5 §3.8) ─────────────────────────── */

/** Basic-command action glyphs (24×24 viewBox). */
const BASIC_GLYPH = {
  attack: 'M4 20 L20 4 M14 4 L20 4 L20 10 M4 20 L4 15 M4 20 L9 20',
  stop: 'M6 6 H18 V18 H6 Z',
  hold: 'M12 3 L19 6 V12 C19 17 12 21 12 21 C12 21 5 17 5 12 V6 Z',
  rally: 'M7 3 L7 21 M7 4 L18 6 L7 11 Z',
  // Wrench for repair.
  repair: 'M15 4 A5 5 0 0 0 10.5 11.2 L4 17.5 L6.5 20 L13 13.5 A5 5 0 0 0 20 9 L17 12 L14 11 L13 8 Z',
  // Coin + downward arrow for "gather gold".
  gathergold: 'M12 3 A5 5 0 1 0 12.01 3 M12 12 V20 M8.5 16.5 L12 20 L15.5 16.5',
  // Crystal + downward arrow for "gather aether".
  gatheraether: 'M12 3 L15 9 L12 13 L9 9 Z M12 13 V20 M8.5 16.5 L12 20 L15.5 16.5',
};

/** Build/hammer glyph for the workers' BUILD submenu button. */
const BUILD_GLYPH = 'M3 11 L11 3 L14 6 L6 14 Z M13 5 L19 11 L16 14 L10 8 M14 17 L20 17 M17 14 L17 20';

/** Atom/beaker representation for upgrade research. */
const RESEARCH_GLYPH = 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 M12 6 V12 L16 14';

/** The glyph shown inside a command button. @returns {JSX.Element} */
function SlotGlyph({ slot, playerColor }) {
  if (slot.kind === 'train' || slot.kind === 'build') {
    const portraitUrl = get3DPortrait(slot.typeId, playerColor);
    if (portraitUrl) {
      return <img className="cmd-portrait-img" src={portraitUrl} alt={slot.label} />;
    }
  } else if (slot.kind === 'research') {
    let themeColor = '#4da6ff'; // default blue
    if (slot.upgradeId.startsWith('AH_')) themeColor = '#b06ef2';
    else if (slot.upgradeId.startsWith('TB_')) themeColor = '#ff8a3d';
    else if (slot.upgradeId.startsWith('CD_')) themeColor = '#4dff4d';
    
    const iconUrl = getUpgradeIcon(slot.upgradeId, themeColor);
    if (iconUrl) {
      return <img className="cmd-portrait-img" src={iconUrl} alt={slot.label} />;
    }
  }

  let d;
  if (slot.kind === 'submenu') d = BUILD_GLYPH;
  else if (slot.kind === 'basic') d = BASIC_GLYPH[slot.action] ?? DEFAULT_GLYPH;
  else if (slot.kind === 'research') d = RESEARCH_GLYPH;
  else d = ARCHETYPE_GLYPH[slot.archetype] ?? DEFAULT_GLYPH;
  return (
    <svg className="cmd-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="#f0cf6e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One populated command-card button. Hovering it raises the rich tooltip via
 * onHover(slot) / onHover(null); clicking runs onActivate(slot).
 * @returns {JSX.Element}
 */
function CommandButton({ slot, onActivate, onHover, playerColor }) {
  const cost = slot.cost;
  const resources = useGameStore((s) => s.resources);
  const goldUnaffordable = cost && cost.gold > resources.gold;
  const aetherUnaffordable = cost && cost.aether > resources.aether;
  return (
    <button
      type="button"
      className={`cmd-slot cmd-btn${slot.disabled ? ' disabled' : ''}`}
      aria-disabled={slot.disabled ? 'true' : undefined}
      onClick={() => onActivate(slot)}
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(slot)}
      onBlur={() => onHover(null)}
    >
      <span className="cmd-hotkey">{slot.hotkey}</span>
      <SlotGlyph slot={slot} playerColor={playerColor} />
      {cost && (cost.gold > 0 || cost.aether > 0) && (
        <span className="cmd-cost">
          {cost.gold > 0 && <span className={`cc-gold ${goldUnaffordable ? 'unaffordable' : ''}`}>{cost.gold}</span>}
          {cost.aether > 0 && <span className={`cc-aether ${aetherUnaffordable ? 'unaffordable' : ''}`}>{cost.aether}</span>}
        </span>
      )}
    </button>
  );
}

/**
 * The rich hover tooltip for a command-card button: name + hotkey, cost line,
 * and a one-line description. Rendered above the command card.
 * @param {{slot: object}} props @returns {JSX.Element}
 */
function CommandTooltip({ slot }) {
  const cost = slot.cost;
  const resources = useGameStore((s) => s.resources);
  const goldUnaffordable = cost && cost.gold > resources.gold;
  const aetherUnaffordable = cost && cost.aether > resources.aether;
  const supplyUnaffordable = cost && cost.supply && (resources.supplyUsed + cost.supply > resources.supplyCap);
  return (
    <div className="cmd-tooltip" role="tooltip">
      <div className="ctt-head">
        <span className="ctt-name">{slot.label}</span>
        <span className="ctt-key">{slot.hotkey}</span>
      </div>
      {cost && (cost.gold > 0 || cost.aether > 0 || cost.supply > 0) && (
        <div className="ctt-cost">
          {cost.gold > 0 && <span className={`cc-gold ${goldUnaffordable ? 'unaffordable' : ''}`}>{cost.gold} gold</span>}
          {cost.aether > 0 && <span className={`cc-aether ${aetherUnaffordable ? 'unaffordable' : ''}`}>{cost.aether} aether</span>}
          {cost.supply > 0 && <span className={`cc-supply ${supplyUnaffordable ? 'unaffordable' : ''}`}>{cost.supply} supply</span>}
        </div>
      )}
      {slot.desc && <div className="ctt-desc">{slot.desc}</div>}
      
      {slot.requiresList && slot.requiresList.length > 0 && (
        <div className="ctt-reqs">
          <div className="ctt-reqs-title">Requirements:</div>
          <div className="ctt-reqs-list">
            {slot.requiresList.map((req, idx) => (
              <span key={idx} className={`ctt-req-item ${req.met ? 'met' : 'unmet'}`}>
                {req.name}{idx < slot.requiresList.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Live production queue for a selected building (click an item to cancel). */
function QueueStrip({ building }) {
  return (
    <div className="cmd-queue" aria-label="Production queue">
      {building.queue.map((q, i) => {
        const frac = q.total > 0 ? 1 - q.remaining / q.total : 0;
        return (
          <button
            type="button"
            key={i}
            className="queue-item"
            title={`${q.name} — click to cancel`}
            onClick={() => getEngine()?.ui.cancelQueueSlot(i)}
          >
            {i === 0 && (
              <span className="queue-prog" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
            )}
            <span className="queue-hotkey">{q.name.charAt(0)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bottom-right command card — context-sensitive to the selection, with working
 * train/build/basic actions, hotkeys, and a live production queue (§3.8).
 * @returns {JSX.Element}
 */
function CommandCard() {
  const selection = useGameStore((s) => s.selection);
  const completedBuildings = useGameStore((s) => s.completedBuildings ?? []);
  const researchedUpgrades = useGameStore((s) => s.researchedUpgrades ?? []);
  const primary = selection[0];
  const [buildOpen, setBuildOpen] = useState(null); // null | 'basic' | 'advanced'
  const [buildPage, setBuildPage] = useState(0);
  const [commandPage, setCommandPage] = useState(0);
  const [hovered, setHovered] = useState(null);

  // Recompute the slot layout only when the *shape* of the selection changes
  // (not on the 5 Hz hp refresh), keyed by a cheap signature.
  const sig = !primary
    ? ''
    : `${primary.typeId}|${primary.own}|${selection.some((u) => u.archetype === 'WORKER')}|${completedBuildings.join(',')}|${researchedUpgrades.join(',')}`;
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const card = useMemo(() => getCommandCard(selection, completedBuildings, researchedUpgrades, commandPage), [sig, completedBuildings, researchedUpgrades, commandPage]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buildCard = useMemo(() => getBuildMenu(selection, buildOpen === 'advanced', completedBuildings, researchedUpgrades, buildPage), [sig, buildOpen, completedBuildings, researchedUpgrades, buildPage]);

  // Close the build submenu whenever the selection shape changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setBuildOpen(null); setBuildPage(0); setCommandPage(0); setHovered(null); }, [sig]);

  // Route a slot activation: submenus/cancel are UI-local; everything else goes
  // to the engine intent facade.
  const activate = useCallback((slot) => {
    const ui = getEngine()?.ui;
    if (slot.kind === 'submenu' && slot.action === 'build_basic') { setBuildOpen('basic'); setBuildPage(0); return; }
    if (slot.kind === 'submenu' && slot.action === 'build_adv') { setBuildOpen('advanced'); setBuildPage(0); return; }
    if (slot.action === 'build_prev' && !slot.disabled) { setBuildPage((p) => Math.max(0, p - 1)); return; }
    if (slot.action === 'build_next' && !slot.disabled) { setBuildPage((p) => p + 1); return; }
    if (slot.action === 'cmd_prev' && !slot.disabled) { setCommandPage((p) => Math.max(0, p - 1)); return; }
    if (slot.action === 'cmd_next' && !slot.disabled) { setCommandPage((p) => p + 1); return; }
    if (slot.action === 'cancelbuild') { setBuildOpen(null); setBuildPage(0); return; }
    if (!ui) return;
    if (slot.disabled) return;
    switch (slot.kind) {
      case 'train': ui.train(slot.typeId); break;
      case 'build': ui.beginBuild(slot.typeId); setBuildOpen(null); break;
      case 'research': ui.research(slot.upgradeId); break;
      case 'basic': ui.runBasic(slot.action); break;
      default: break;
    }
  }, []);

  const active = buildOpen ? buildCard : card;

  // Command-card hotkeys (QWER/ASDF/ZXCV) for whichever card is showing. Skip
  // A/S — the engine already binds attack-move (A) and stop (S) on the canvas.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'Escape' && buildOpen) { setBuildOpen(null); return; }
      const slot = active.find((s) => s.kind !== 'empty' && e.code === `Key${s.hotkey}`);
      if (!slot || slot.hotkey === 'A' || slot.hotkey === 'S') return;
      activate(slot);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, buildOpen, activate]);

  const building = primary && primary.isBuilding ? primary : null;
  const showQueue = building && building.queue && building.queue.length > 0 && !buildOpen;

  return (
    <div className="panel hud-commandcard hud-interactive" aria-label="Command card">
      {hovered && <CommandTooltip slot={hovered} />}
      {showQueue && <QueueStrip building={building} />}
      <div className="cmd-grid">
        {active.map((slot) => {
          const primary = selection[0];
          const playerColor = primary ? primary.color : '#4da6ff';
          return slot.kind === 'empty'
            ? <div className="cmd-slot" key={slot.slot} />
            : <CommandButton key={slot.slot} slot={slot} onActivate={activate} onHover={setHovered} playerColor={playerColor} />
        })}
      </div>
      <span className="cmd-label">{buildOpen ? 'Build Structure' : 'Command Card'}</span>
    </div>
  );
}

function ObserverPanel() {
  const observer = useGameStore((s) => s.observer);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  if (!observer.enabled) return null;

  const players = observer.players ?? [];
  const teamOptions = (observer.teams ?? []).filter((team) => team.id !== 'FFA');
  const focusKind = observer.focusKind ?? 'ALL';
  const selectedPlayer = observer.focusPlayerId ?? players[0]?.id ?? '';
  const selectedTeam = observer.focusTeam ?? teamOptions[0]?.id ?? '';
  const engine = getEngine();
  const updateView = (patch) => engine?.setObserverView(patch);

  return (
    <div className="panel observer-panel hud-interactive" aria-label="Observer controls">
      <div className="observer-row">
        <label className="observer-toggle">
          <input
            type="checkbox"
            checked={!!observer.revealAll}
            onChange={(e) => updateView({ revealAll: e.target.checked })}
          />
          Reveal All
        </label>
        <select
          className="select observer-select"
          value={focusKind}
          onChange={(e) => updateView({ focusKind: e.target.value })}
          aria-label="Observer vision focus"
        >
          <option value="ALL">All</option>
          <option value="PLAYER">Player</option>
          <option value="TEAM" disabled={teamOptions.length === 0}>Team</option>
        </select>
        {focusKind === 'PLAYER' && (
          <select
            className="select observer-select"
            value={selectedPlayer}
            onChange={(e) => updateView({ focusPlayerId: Number(e.target.value), focusKind: 'PLAYER' })}
            aria-label="Focused player"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {focusKind === 'TEAM' && (
          <select
            className="select observer-select"
            value={selectedTeam}
            onChange={(e) => updateView({ focusTeam: e.target.value, focusKind: 'TEAM' })}
            aria-label="Focused team"
          >
            {teamOptions.map((team) => (
              <option key={team.id} value={team.id}>{team.label}</option>
            ))}
          </select>
        )}
      </div>
      <div className="observer-row">
        <button type="button" className="fmt-btn" onClick={() => engine?.focusObserverTarget('base')}>Base</button>
        <button type="button" className="fmt-btn" onClick={() => engine?.focusObserverTarget('army')}>Army</button>
        <button type="button" className="fmt-btn" onClick={() => engine?.focusObserverTarget('battle')}>Battle</button>
        <button type="button" className={`fmt-btn${showDiagnostics ? ' fmt-active' : ''}`} onClick={() => setShowDiagnostics((v) => !v)}>
          AI
        </button>
      </div>
      {showDiagnostics && (
        <div className="observer-diag">
          {(observer.diagnostics ?? []).map((d) => (
            <div className="observer-diag-row" key={d.playerId}>
              <span className="diag-name">{d.name}</span>
              <span>{d.state}</span>
              <span>W {d.workers?.total ?? 0}</span>
              <span>A {d.armyCount} / {d.armyPower}</span>
              <span>{d.personality ?? d.combo ?? 'AI'}</span>
              <span>{d.stuckReason ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen victory/defeat banner shown when the CombatSystem victory
 * sweep resolves the match.
 * @param {{ outcome: 'VICTORY'|'DEFEAT', onReturn: () => void }} props
 * @returns {JSX.Element}
 */
function OutcomeBanner({ outcome, onReturn }) {
  const victory = outcome === 'VICTORY';
  const observed = outcome === 'OBSERVED';
  return (
    <div className="hud-banner hud-interactive" role="alertdialog" aria-label="Match result">
      <div className="panel banner-panel">
        <h1 className={`banner-title ${victory || observed ? 'victory' : 'defeat'}`}>
          {observed ? 'Match Complete' : victory ? 'Victory' : 'Defeat'}
        </h1>
        <p className="banner-sub">
          {observed
            ? 'The AI war has resolved'
            : victory
            ? 'The Aether Throne is yours'
            : 'Your banners are broken — the throne slips away'}
        </p>
        <button
          type="button"
          className={`btn ${victory || observed ? 'btn-primary' : ''}`}
          onClick={onReturn}
        >
          Return to Menu
        </button>
      </div>
    </div>
  );
}

/**
 * Transient toast stack fed by useGameStore.notifications. Click a toast to
 * dismiss it.
 * @returns {JSX.Element|null}
 */
function ToastStack() {
  const notifications = useGameStore((s) => s.notifications);
  const dismissNotification = useGameStore((s) => s.dismissNotification);

  useEffect(() => {
    if (notifications.length === 0) return undefined;
    const timers = notifications.map((n) => {
      return setTimeout(() => {
        dismissNotification(n.id);
      }, 4000); // auto-clear notifications after 4 seconds
    });
    return () => timers.forEach(clearTimeout);
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) return null;

  return (
    <div className="toast-stack" role="log" aria-live="polite">
      {notifications.map((n) => (
        <button
          type="button"
          key={n.id}
          className={`toast hud-interactive${
            n.kind === 'warn' ? ' toast-warn' : n.kind === 'error' ? ' toast-error' : ''
          }`}
          onClick={() => dismissNotification(n.id)}
          title="Dismiss"
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}

/**
 * World-hover tooltip: when the cursor is over a unit/building/resource, show
 * its Name and Owner near the pointer, colored by relation — RED for enemies,
 * GREEN for own/allied, YELLOW for neutral (resources). Fed by CursorController
 * → useGameStore.hoverInfo. Purely display; pointer-events off.
 * @returns {JSX.Element|null}
 */
function HoverTooltip() {
  const info = useGameStore((s) => s.hoverInfo);
  if (!info) return null;
  // Clamp near the pointer but keep it on-screen-ish (offset up-right).
  const style = { left: `${info.x + 16}px`, top: `${info.y + 18}px` };
  return (
    <div className={`hover-tip hover-${info.relation}`} style={style} aria-hidden="true">
      <div className="hover-name">{info.name}</div>
      {info.owner && <div className="hover-owner">{info.owner}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Root
   ════════════════════════════════════════════════════════════════════ */

/**
 * The HUD root. Owns the exit path (teardown → menu) and the in-game menu
 * popover state; everything else is delegated to the region components above.
 * @returns {JSX.Element}
 */
export default function GameHUD() {
  const matchOutcome = useGameStore((s) => s.matchOutcome);
  const observer = useGameStore((s) => s.observer);
  const [menuOpen, setMenuOpen] = useState(false);

  // Guards the exit path against double-clicks / Escape spam while the async
  // teardown is in flight. A ref (not state): no re-render needed.
  const exitingRef = useRef(false);

  /**
   * THE exit path (contract §11): dispose the engine, then route the UI back
   * to the main menu and wipe HUD state. Runs for Surrender, banner Return,
   * and any future exit affordance. Even if teardown throws we still route
   * out — a stuck HUD over a dead engine is the worst failure mode.
   */
  const handleExitToMenu = useCallback(async () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    try {
      await teardownMatch();
    } catch (err) {
      console.error('[GameHUD] match teardown failed:', err);
    } finally {
      useLobbyStore.getState().exitToMenu();
      useGameStore.getState().resetGameState();
      // No need to reset exitingRef — this component unmounts with the
      // screen change triggered above.
    }
  }, []);

  // ── Escape toggles the in-game menu (classic RTS binding) ─────────
  // Own window listener with full cleanup; the engine's InputManager also
  // sees Escape but no simulation binding uses it, so there is no conflict.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Escape') setMenuOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const matchOver = matchOutcome !== 'RUNNING';

  return (
    <div className="hud-root">
      <TopBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />

      {/* Ornate full-width command console backdrop (WC3-style stone + gold
          filigree). Purely decorative + pass-through; the interactive minimap /
          portrait / command card sit on top of it. */}
      <div className="hud-console" aria-hidden="true">
        <span className="console-orn console-orn-l" />
        <span className="console-orn console-orn-r" />
      </div>

      {/* Popover hides once the match resolves — the banner takes over. */}
      {menuOpen && !matchOver && (
        <MenuPopover onClose={() => setMenuOpen(false)} onSurrender={handleExitToMenu} />
      )}

      <ToastStack />
      <CenterError />
      <GameAlertsStack />
      <HoverTooltip />
      <ObserverPanel />
      <Minimap />
      {!observer.enabled && <FormationBar />}
      <SelectionPanel />
      {!observer.enabled && <CommandCard />}

      {matchOver && <OutcomeBanner outcome={matchOutcome} onReturn={handleExitToMenu} />}
    </div>
  );
}

/**
 * Center screen error alerts (e.g. "Insufficient Gold").
 * @returns {JSX.Element|null}
 */
function CenterError() {
  const centerError = useGameStore((s) => s.centerError);
  const centerErrorSeq = useGameStore((s) => s.centerErrorSeq);
  const clearCenterError = useGameStore((s) => s.clearCenterError);

  useEffect(() => {
    if (!centerError) return undefined;
    const t = setTimeout(clearCenterError, 2500); // auto-clear after 2.5s
    return () => clearTimeout(t);
  }, [centerError, centerErrorSeq, clearCenterError]);

  if (!centerError) return null;

  return (
    <div className="center-error-container" key={centerErrorSeq}>
      <span className="center-error-text">{centerError}</span>
    </div>
  );
}

/**
 * Upper-left notifications / alerts panel (completed buildings, units trained, attacks).
 * @returns {JSX.Element|null}
 */
function GameAlertsStack() {
  const alerts = useGameStore((s) => s.gameAlerts ?? []);
  const dismissAlert = useGameStore((s) => s.dismissGameAlert);

  useEffect(() => {
    if (alerts.length === 0) return undefined;
    const timers = alerts.map((a) => {
      return setTimeout(() => {
        dismissAlert(a.id);
      }, 4000); // auto-clear alerts after 4 seconds
    });
    return () => timers.forEach(clearTimeout);
  }, [alerts, dismissAlert]);

  if (alerts.length === 0) return null;

  return (
    <div className="game-alerts-stack" role="log" aria-live="polite">
      {alerts.map((a) => (
        <button
          type="button"
          key={a.id}
          className={`game-alert game-alert-${a.kind}`}
          onClick={() => dismissAlert(a.id)}
          title="Dismiss alert"
        >
          {a.text}
        </button>
      ))}
    </div>
  );
}
