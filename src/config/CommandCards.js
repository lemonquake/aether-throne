import { ARCHETYPE, getUnitType } from './UnitTypes.js';
import { getUpgradeType } from './Upgrades.js';
import { RACES } from './Races.js';
import {
  getBuildMenuForRace,
  getProductionForBuilding,
  getResearchForBuilding,
  getRequirementName,
  getUpgradeRequirements,
  satisfiesRequirement,
} from './TechTree.js';

/** Slot index -> hotkey letter (KeyboardEvent.code is `Key${hotkey}`). */
export const HOTKEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];

export { getUpgradeRequirements, satisfiesRequirement };

const ACTION_DESC = {
  attack: 'Attack-move to a point. Your units engage every enemy along the way and clear everything around the target area.',
  stop: 'Immediately cancel all current orders and stand down.',
  hold: 'Hold position: stand ground and strike anything that comes in range without chasing.',
  rally: 'Set the rally point where newly trained units will gather.',
  repair: 'Send workers to repair a damaged or unfinished friendly structure.',
  gathergold: 'Send the selected workers to mine the nearest gold mine.',
  gatheraether: 'Send the selected workers to harvest the nearest aether well.',
  build_basic: 'Open the basic structures build menu.',
  build_adv: 'Open the advanced structures build menu.',
  build_prev: 'Previous build page.',
  build_next: 'Next build page.',
  cmd_prev: 'Previous command page.',
  cmd_next: 'Next command page.',
  cancelbuild: 'Back to the command card.',
};

const ARCH_DESC = {
  WORKER: 'Gathers gold and aether, constructs buildings, and repairs structures.',
  MELEE: 'Frontline soldier: durable, fast, and cheap.',
  RANGED: 'Ranged attacker: fragile but deals strong damage from a safe distance.',
  HALL: 'Town hall: trains workers, receives gathered resources, and grants supply.',
  BARRACKS: 'Production structure: trains combat units or unlocks advanced technology.',
  SUPPLY: 'Raises your supply cap so you can field a larger army.',
};

const COMMAND_PAGE_SIZE = 9;
const BUILD_PAGE_SIZE = 9;

function empty(slot) {
  return { slot, kind: 'empty', hotkey: HOTKEYS[slot], label: '' };
}

function basic(slot, action, label, meta = {}) {
  return { slot, kind: 'basic', action, hotkey: HOTKEYS[slot], label, desc: ACTION_DESC[action] ?? '', ...meta };
}

function submenu(slot, action, label) {
  return { slot, kind: 'submenu', action, hotkey: HOTKEYS[slot], label, desc: ACTION_DESC[action] ?? '' };
}

function typeRequirementState(type, completedBuildings) {
  const requiresList = [];
  let reqsMet = true;
  for (const reqId of type.requires ?? []) {
    const met = completedBuildings.some((hasId) => satisfiesRequirement(reqId, hasId));
    if (!met) reqsMet = false;
    requiresList.push({ name: getRequirementName(reqId), met });
  }
  return { reqsMet, requiresList };
}

function produce(slot, kind, typeId, completedBuildings = []) {
  const t = getUnitType(typeId);
  const cost = t.cost;
  const costLine = `${cost.gold} gold${cost.aether ? `, ${cost.aether} aether` : ''}${cost.supply ? `, ${cost.supply} supply` : ''}`;
  const { reqsMet, requiresList } = typeRequirementState(t, completedBuildings);
  const unmet = requiresList.filter((r) => !r.met).map((r) => r.name);
  const reqsText = unmet.length > 0 ? ` Requires: ${unmet.join(', ')}.` : '';

  return {
    slot,
    kind,
    typeId,
    archetype: t.archetype,
    hotkey: HOTKEYS[slot],
    label: t.name,
    cost,
    desc: `${t.description ?? ARCH_DESC[t.archetype] ?? ''} Cost: ${costLine}. Build time: ${t.buildTime}s.${reqsText}`,
    disabled: !reqsMet,
    requiresList,
  };
}

function research(slot, upgradeId, researchedUpgrades = [], completedBuildings = []) {
  if (researchedUpgrades.includes(upgradeId)) return empty(slot);
  const up = getUpgradeType(upgradeId);
  const cost = up.cost;
  const costLine = `${cost.gold} gold${cost.aether ? `, ${cost.aether} aether` : ''}`;
  const requiresList = [];
  let reqsMet = true;

  for (const req of getUpgradeRequirements(upgradeId)) {
    let met = false;
    if (req.type === 'upgrade') {
      met = researchedUpgrades.includes(req.id);
    } else if (req.type === 'building') {
      met = completedBuildings.some((hasId) => satisfiesRequirement(req.id, hasId));
    }
    if (!met) reqsMet = false;
    requiresList.push({ name: getRequirementName(req.id), met });
  }

  const unmet = requiresList.filter((r) => !r.met).map((r) => r.name);
  const reqsText = unmet.length > 0 ? ` Requires: ${unmet.join(', ')}.` : '';

  return {
    slot,
    kind: 'research',
    upgradeId,
    hotkey: HOTKEYS[slot],
    label: up.name,
    cost,
    desc: `${up.desc} Cost: ${costLine}. Research time: ${up.buildTime}s.${reqsText}`,
    disabled: !reqsMet,
    requiresList,
  };
}

function fillPagedCommandItems(card, items, pageIndex) {
  const totalPages = Math.max(1, Math.ceil(items.length / COMMAND_PAGE_SIZE));
  const page = Math.max(0, Math.min(totalPages - 1, pageIndex | 0));
  const start = page * COMMAND_PAGE_SIZE;
  const pageItems = items.slice(start, start + COMMAND_PAGE_SIZE);
  for (let i = 0; i < pageItems.length; i++) card[i] = pageItems[i](i);
  if (totalPages > 1) {
    card[9] = basic(9, 'cmd_prev', 'Prev', { disabled: page <= 0 });
    card[10] = basic(10, 'cmd_next', 'Next', { disabled: page >= totalPages - 1 });
  }
  return { page, totalPages };
}

/**
 * Build the 12-slot command card for the current selection snapshot.
 * @param {Array<object>} selection
 * @param {Array<string>} completedBuildings
 * @param {Array<string>} researchedUpgrades
 * @param {number} pageIndex
 * @returns {Array<object>}
 */
export function getCommandCard(selection, completedBuildings = [], researchedUpgrades = [], pageIndex = 0) {
  const card = [];
  for (let i = 0; i < 12; i++) card.push(empty(i));

  if (!selection || selection.length === 0) return card;
  const primary = selection[0];
  if (!primary.own) return card;

  const race = RACES[primary.race];
  const typeId = primary.typeId;

  const hasWorker = selection.some((u) => u.archetype === ARCHETYPE.WORKER);
  if (hasWorker && race) {
    card[0] = submenu(0, 'build_basic', 'Build Basic');
    card[1] = submenu(1, 'build_adv', 'Build Advanced');
    card[3] = basic(3, 'repair', 'Repair');
    card[4] = basic(4, 'attack', 'Attack');
    card[5] = basic(5, 'stop', 'Stop');
    card[6] = basic(6, 'hold', 'Hold Position');
    card[8] = basic(8, 'gathergold', 'Gather Gold');
    card[9] = basic(9, 'gatheraether', 'Gather Aether');
    return card;
  }

  if (primary.isBuilding) {
    const production = getProductionForBuilding(typeId);
    const researchIds = getResearchForBuilding(typeId).filter((id) => !researchedUpgrades.includes(id));
    const items = [
      ...production.map((id) => (slot) => produce(slot, 'train', id, completedBuildings)),
      ...researchIds.map((id) => (slot) => research(slot, id, researchedUpgrades, completedBuildings)),
    ];

    if (items.length > 0) fillPagedCommandItems(card, items, pageIndex);
    if (production.length > 0) card[11] = basic(11, 'rally', 'Set Rally Point');
    return card;
  }

  card[4] = basic(4, 'attack', 'Attack');
  card[5] = basic(5, 'stop', 'Stop');
  card[6] = basic(6, 'hold', 'Hold Position');
  return card;
}

/**
 * The BUILD submenus for a worker selection.
 * @param {Array<object>} selection
 * @param {boolean} isAdvanced
 * @param {Array<string>} completedBuildings
 * @param {Array<string>} researchedUpgrades
 * @param {number} pageIndex
 * @returns {Array<object>}
 */
export function getBuildMenu(selection, isAdvanced = false, completedBuildings = [], researchedUpgrades = [], pageIndex = 0) {
  void researchedUpgrades;
  const card = [];
  for (let i = 0; i < 12; i++) card.push(empty(i));
  const primary = selection?.[0];
  if (!primary || !RACES[primary.race]) return card;

  const menu = getBuildMenuForRace(primary.race, isAdvanced ? 'advanced' : 'basic', pageIndex, BUILD_PAGE_SIZE);
  for (let i = 0; i < menu.typeIds.length; i++) {
    card[i] = produce(i, 'build', menu.typeIds[i], completedBuildings);
  }
  if (menu.totalPages > 1) {
    card[9] = basic(9, 'build_prev', 'Prev', { disabled: !menu.hasPrev });
    card[10] = basic(10, 'build_next', 'Next', { disabled: !menu.hasNext });
  }
  card[11] = basic(11, 'cancelbuild', 'Cancel');
  return card;
}
