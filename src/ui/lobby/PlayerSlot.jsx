/**
 * PlayerSlot — one row of the custom-match lobby (8 rows total).
 *
 * Layout (grid columns shared with the header row via `.slot-grid`):
 *   [color swatch] [occupancy button] [name] [race] [team] [AI difficulty]
 *
 * Rules from ARCHITECTURE.md §11:
 *   - Slot 0 is the local human and its occupancy is LOCKED.
 *   - Other slots cycle AI ⇄ Closed via the occupancy button.
 *   - The color swatch is fixed per slot (WC3 tradition) — display only.
 *   - AI difficulty <select> renders for AI slots only.
 *   - Closed slots render dimmed with all controls disabled.
 *
 * Perf: wrapped in React.memo — the lobby store maps slot arrays
 * immutably, so untouched slot objects keep referential identity and only
 * the edited row re-renders.
 */
import React from 'react';
import { useLobbyStore } from '../../state/useLobbyStore.js';
import {
  SLOT_TYPES,
  TEAM_IDS,
  TEAM_LABELS,
  AI_LEVELS,
  AI_LEVEL_LABELS,
  AI_PERSONALITIES,
  AI_PERSONALITY_LABELS,
} from '../../config/GameConfig.js';
import { RACES, RACE_IDS } from '../../config/Races.js';

/** Display labels for the occupancy cycle button, per SLOT_TYPE. */
const OCCUPANCY_LABELS = {
  [SLOT_TYPES.HUMAN]: 'Human',
  [SLOT_TYPES.AI]: 'Computer',
  [SLOT_TYPES.CLOSED]: 'Closed',
};

/** Display labels for AI difficulty tiers. */
const DIFFICULTY_LABELS = {
  [AI_LEVELS.NOOB]: AI_LEVEL_LABELS[AI_LEVELS.NOOB],
  [AI_LEVELS.CASUAL]: AI_LEVEL_LABELS[AI_LEVELS.CASUAL],
  [AI_LEVELS.PRO]: AI_LEVEL_LABELS[AI_LEVELS.PRO],
};

/** Team options in display order (FFA first, like the classic lobby). */
const TEAM_OPTIONS = TEAM_IDS;

/**
 * A single lobby slot row.
 * @param {{ slot: {id:number, name:string, type:string, race:string,
 *                  team:string, difficulty:string, color:string} }} props
 * @returns {JSX.Element}
 */
function PlayerSlot({ slot }) {
  // Zustand v5: action references are stable, so these selectors never
  // cause re-renders — the row only updates when its `slot` prop changes.
  const cycleSlotType = useLobbyStore((s) => s.cycleSlotType);
  const setSlotRace = useLobbyStore((s) => s.setSlotRace);
  const setSlotTeam = useLobbyStore((s) => s.setSlotTeam);
  const setSlotDifficulty = useLobbyStore((s) => s.setSlotDifficulty);
  const setSlotPersonality = useLobbyStore((s) => s.setSlotPersonality);
  const setSlotColor = useLobbyStore((s) => s.setSlotColor);
  const setSelectedSlotId = useLobbyStore((s) => s.setSelectedSlotId);
  const selectedSlotId = useLobbyStore((s) => s.selectedSlotId);

  const isLocalSlot = slot.id === 0;
  const isHuman = slot.type === SLOT_TYPES.HUMAN;
  const isClosed = slot.type === SLOT_TYPES.CLOSED;
  const isAI = slot.type === SLOT_TYPES.AI;

  // Row modifier classes drive the dim/highlight styling in ui.css.
  const rowClass = [
    'slot-grid',
    'slot-row',
    isLocalSlot && isHuman ? 'is-human' : '',
    selectedSlotId === slot.id && !isClosed ? 'is-selected' : '',
    isClosed ? 'is-closed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const occClass = isHuman
    ? 'occ-human'
    : isAI
      ? 'occ-ai'
      : 'occ-closed';

  return (
    <div
      className={rowClass}
      onClick={() => {
        if (!isClosed) setSelectedSlotId(slot.id);
      }}
    >
      <input
        type="color"
        className="slot-color-swatch"
        value={slot.color}
        disabled={isClosed}
        title={`Player color ${slot.id + 1}`}
        aria-label={`Player color for slot ${slot.id + 1}`}
        onChange={(e) => setSlotColor(slot.id, e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Occupancy cycle button. Slot 0 is a locked "Human" chip. */}
      <button
        type="button"
        className={`slot-occ-btn ${occClass}`}
        onClick={() => cycleSlotType(slot.id)}
        title={
          isLocalSlot
            ? 'Toggle between playing and observing an AI-controlled slot'
            : isAI
              ? 'Click to close this slot'
              : 'Click to add a computer player'
        }
        aria-label={
          isLocalSlot
            ? `Slot ${slot.id + 1}: ${OCCUPANCY_LABELS[slot.type]} - click to toggle observer mode`
            : `Slot ${slot.id + 1}: ${OCCUPANCY_LABELS[slot.type]} — click to toggle`
        }
      >
        {OCCUPANCY_LABELS[slot.type]}
      </button>

      {/* Player name (from the store; "You" for slot 0). */}
      <span className="slot-name">
        {slot.name}
        {isLocalSlot && isHuman && <span className="slot-you-tag">(you)</span>}
      </span>

      {/* Race select — enabled for any open (HUMAN/AI) slot. */}
      <select
        className="select"
        value={slot.race}
        disabled={isClosed}
        onChange={(e) => setSlotRace(slot.id, e.target.value)}
        aria-label={`Race for slot ${slot.id + 1}`}
      >
        {RACE_IDS.map((raceId) => (
          <option key={raceId} value={raceId}>
            {RACES[raceId].name}
          </option>
        ))}
      </select>

      {/* Team select — FFA / Team 1 / Team 2 via TEAM_LABELS. */}
      <select
        className="select"
        value={slot.team}
        disabled={isClosed}
        onChange={(e) => setSlotTeam(slot.id, e.target.value)}
        aria-label={`Team for slot ${slot.id + 1}`}
      >
        {TEAM_OPTIONS.map((team) => (
          <option key={team} value={team}>
            {TEAM_LABELS[team]}
          </option>
        ))}
      </select>

      {/* AI difficulty — AI slots only; others show a dash to keep the
          grid columns aligned (no layout jump when cycling occupancy). */}
      {isAI ? (
        <select
          className="select"
          value={slot.difficulty}
          onChange={(e) => setSlotDifficulty(slot.id, e.target.value)}
          aria-label={`AI difficulty for slot ${slot.id + 1}`}
        >
          {Object.keys(DIFFICULTY_LABELS).map((tier) => (
            <option key={tier} value={tier}>
              {DIFFICULTY_LABELS[tier]}
            </option>
          ))}
        </select>
      ) : (
        <span className="slot-cell-dash" aria-hidden="true">
          —
        </span>
      )}

      {isAI ? (
        <select
          className="select"
          value={slot.personality}
          onChange={(e) => setSlotPersonality(slot.id, e.target.value)}
          aria-label={`AI personality for slot ${slot.id + 1}`}
        >
          {Object.values(AI_PERSONALITIES).map((personality) => (
            <option key={personality} value={personality}>
              {AI_PERSONALITY_LABELS[personality] ?? personality}
            </option>
          ))}
        </select>
      ) : (
        <span className="slot-cell-dash" aria-hidden="true">
          -
        </span>
      )}
    </div>
  );
}

export default React.memo(PlayerSlot);
