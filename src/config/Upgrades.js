/**
 * Upgrades — technology research database for all factions.
 * Each faction has exactly 40 upgrades/research items.
 */

export const UPGRADES = {};

function add(id, name, race, costGold, costAether, buildTime, desc, modifiers = {}) {
  UPGRADES[id] = {
    id,
    name,
    race,
    cost: { gold: costGold, aether: costAether, supply: 0 },
    buildTime,
    desc,
    modifiers,
  };
}

// ── BIO HUMAN UPGRADES (40) ──────────────────────────────────────────────────
// Melee attack & armor upgrades (1-6)
add('BH_MELEE_ATK_1', 'Iron Weapons I', 'BIO_HUMAN', 95, 20, 25, 'Grinds blade edges and hardens steel tips, increasing melee unit damage by +2.', { meleeDamageAdd: 2 });
add('BH_MELEE_ATK_2', 'Steel Weapons II', 'BIO_HUMAN', 170, 70, 35, 'Forges weapons in carbon crucibles, increasing melee unit damage by +4.', { meleeDamageAdd: 4 });
add('BH_MELEE_ATK_3', 'Mithril Weapons III', 'BIO_HUMAN', 245, 120, 45, 'Inlays edges with rare lightweight mithril, increasing melee unit damage by +6.', { meleeDamageAdd: 6 });
add('BH_MELEE_ARM_1', 'Iron Plate I', 'BIO_HUMAN', 100, 25, 25, 'Rivet-joints heavy iron sheets to shields, increasing melee unit armor by +1.', { meleeArmorAdd: 1 });
add('BH_MELEE_ARM_2', 'Steel Plate II', 'BIO_HUMAN', 180, 75, 35, 'Tapers and tempers carbon steel breastplates, increasing melee unit armor by +2.', { meleeArmorAdd: 2 });
add('BH_MELEE_ARM_3', 'Mithril Plate III', 'BIO_HUMAN', 260, 130, 45, 'Weaves resilient myth-alloy fibers into armor, increasing melee unit armor by +3.', { meleeArmorAdd: 3 });

// Ranged attack & armor upgrades (7-12)
add('BH_RANGED_ATK_1', 'Steel Bolts I', 'BIO_HUMAN', 120, 45, 25, 'Caps arbalest bolts with steel tips, increasing ranged unit damage by +2.', { rangedDamageAdd: 2 });
add('BH_RANGED_ATK_2', 'Broadhead Bolts II', 'BIO_HUMAN', 195, 95, 35, 'Flares bolt heads to cause severe bleeding, increasing ranged unit damage by +4.', { rangedDamageAdd: 4 });
add('BH_RANGED_ATK_3', 'Aetheric Bolts III', 'BIO_HUMAN', 270, 140, 45, 'Channels ambient throne energies into bolt shafts, increasing ranged unit damage by +6.', { rangedDamageAdd: 6 });
add('BH_RANGED_ARM_1', 'Leather Vest I', 'BIO_HUMAN', 105, 20, 25, 'Fits workers and archers with boiled leather vests, increasing ranged unit armor by +1.', { rangedArmorAdd: 1 });
add('BH_RANGED_ARM_2', 'Studded Leather II', 'BIO_HUMAN', 175, 70, 35, 'Affixes metal rings to leather, increasing ranged unit armor by +2.', { rangedArmorAdd: 2 });
add('BH_RANGED_ARM_3', 'Runic Leather III', 'BIO_HUMAN', 250, 125, 45, 'Scribes protective light runes directly into hide, increasing ranged unit armor by +3.', { rangedArmorAdd: 3 });

// Economy and building upgrades (13-18)
add('BH_ECON_1', 'Acolyte Marching I', 'BIO_HUMAN', 70, 0, 15, 'Drills Acolytes in military marching cadences, increasing movement speed by +10%.', { workerSpeedMult: 1.1 });
add('BH_ECON_2', 'Leather Satchels II', 'BIO_HUMAN', 145, 45, 25, 'Supplies Acolytes with double-stitched satchels, increasing resource carrying limit by +2.', { workerCarryAdd: 2 });
add('BH_BUILD_HP_1', 'Limestone Masonry I', 'BIO_HUMAN', 115, 35, 25, 'Reinforces structural foundations with limestone mortar, increasing building hit points by +15%.', { buildingHpMult: 1.15 });
add('BH_BUILD_HP_2', 'Iron Arching II', 'BIO_HUMAN', 195, 75, 35, 'Bolts heavy steel arches into castle frames, increasing building hit points by +30%.', { buildingHpMult: 1.3 });
add('BH_SUPPLY_BOOST', 'Sanctum Blessing', 'BIO_HUMAN', 95, 20, 20, 'Consecrates Sanctums with holy water, increasing the supply they provide by +2.', { supplyProvideAdd: 2 });
add('BH_TAXES', 'Royal Taxes', 'BIO_HUMAN', 140, 70, 30, 'Levies a royal tax on gold mines, increasing gold gathering efficiency by +10%.', { goldMultiplier: 1.1 });

// Unit-specific upgrades (19-40)
add('BH_KNIGHT_SPEED', 'Cavalier Barding', 'BIO_HUMAN', 140, 45, 28, 'Trims horse saddle plates, increasing Knight movement speed by +15%.', { knightSpeedMult: 1.15 });
add('BH_KNIGHT_SHIELD', 'Divine Aegis', 'BIO_HUMAN', 175, 70, 30, 'Enchants shield faces, increasing Knight max HP by +80.', { knightHpAdd: 80 });
add('BH_ARBALIST_RANGE', 'Reinforced Stirrups', 'BIO_HUMAN', 145, 70, 28, 'Tightens arbalest steel bows, increasing attack range by +2.', { arbalistRangeAdd: 2 });
add('BH_ARBALIST_SCOPE', 'Optic Monocles', 'BIO_HUMAN', 95, 25, 20, 'Gives Arbalists magnifying lenses, increasing sight radius by +3.', { arbalistSightAdd: 3 });
add('BH_RIFLE_DMG', 'Gunpowder Compression', 'BIO_HUMAN', 155, 75, 30, 'Increases gun chamber sealing, increasing Rifleman damage by +3.', { riflemanDamageAdd: 3 });
add('BH_HALBERD_ATK', 'Halberd Thrust', 'BIO_HUMAN', 135, 55, 25, 'Teaches halberdiers target-weakness thrusts, increasing damage by +3.', { halberdierDamageAdd: 3 });
add('BH_CATAPULT_PAYLOAD', 'Greek Fire', 'BIO_HUMAN', 190, 95, 35, 'Mixes brimstone and petroleum into catapult barrels, increasing damage by +10.', { catapultDamageAdd: 10 });
add('BH_GRYPHON_HASTE', 'Aether Feathers', 'BIO_HUMAN', 175, 85, 32, 'Grafts light-infused feathers onto wings, increasing Gryphon Rider speed by +12%.', { gryphonSpeedMult: 1.12 });
add('BH_PALADIN_RET', 'Righteous Crusade', 'BIO_HUMAN', 195, 95, 35, ' Paladins strike with divine vengeance, increasing damage by +5.', { paladinDamageAdd: 5 });
add('BH_ARCHMAGE_WIS', 'Leyline Attunement', 'BIO_HUMAN', 175, 95, 30, 'Archmages tap directly into raw throne paths, increasing mana regeneration by +20%.', { archmageManaRegenMult: 1.2 });
add('BH_WARDEN_ASS', 'Executioner Blade', 'BIO_HUMAN', 145, 70, 28, 'Sharpens Warden swords for lethal combat, increasing critical damage by +4.', { wardenDamageAdd: 4 });
add('BH_CLERIC_HEAL', 'Holy Mending', 'BIO_HUMAN', 115, 45, 22, 'Drills Clerics in deep prayers, increasing healing amount by +5.', { clericHealAdd: 5 });
add('BH_FOOTMAN_HP', 'Phalanx Training', 'BIO_HUMAN', 95, 20, 20, 'Coordinates footmen team drills, increasing max HP by +50.', { footmanHpAdd: 50 });
add('BH_DEFENDER_DEF', 'Fortress Shielding', 'BIO_HUMAN', 135, 45, 25, 'Affixes solid steel rims to shields, increasing Defender armor by +2.', { defenderArmorAdd: 2 });
add('BH_PRIEST_BUFF', 'Zealot Litany', 'BIO_HUMAN', 125, 55, 24, 'Lengthens Priest protective wards, increasing shield duration by +5s.', { priestBuffDurationAdd: 5 });
add('BH_LANCER_CHARGE', 'Spiraled Lances', 'BIO_HUMAN', 145, 45, 28, 'Hollows timber to lighten lances, increasing Lancer charge damage by +6.', { lancerDamageAdd: 6 });
add('BH_INQ_SILENCE', 'Magebane Seals', 'BIO_HUMAN', 155, 75, 30, 'Engraves silence sigils on weapons, increasing Inquisitor attack speed by +15%.', { inquisitorSpeedMult: 1.15 });
add('BH_DUELIST_REACTION', 'Fencer Reflexes', 'BIO_HUMAN', 125, 35, 25, 'Refines Duelist parrying, increasing attack speed by +10%.', { duelistSpeedMult: 1.1 });
add('BH_CHAMPION_VANGUARD', 'Banners of Glory', 'BIO_HUMAN', 175, 65, 32, 'Gilds champion breastplates with gold plating, increasing armor by +2.', { championArmorAdd: 2 });
add('BH_SENTINEL_TOWER', 'Eagle Eye', 'BIO_HUMAN', 115, 25, 22, 'Provides Sentinels with spyglasses, increasing attack range by +1.', { sentinelRangeAdd: 1 });
add('BH_CRUSADER_SHIELD', 'Aether Core Plating', 'BIO_HUMAN', 245, 140, 40, 'Integrates magical cores into armor, increasing Aether Crusader armor by +3.', { crusaderArmorAdd: 3 });
add('BH_ROYAL_HP', 'Sovereign Oath', 'BIO_HUMAN', 215, 115, 38, 'Instills royal loyalty, increasing Royal Guard max HP by +100.', { royalGuardHpAdd: 100 });
add('BH_TOWN_WATCH', 'Sentry Alerts', 'BIO_HUMAN', 95, 5, 15, 'Lights high-altitude watch fires, increasing building sight radius by +2.', { buildingSightAdd: 2 });
add('BH_REPAIR_KIT', 'Master Wrenches', 'BIO_HUMAN', 85, 15, 18, 'Supplies repairmen with iron-grip tools, increasing building repair speed by +25%.', { repairSpeedMult: 1.25 });


// ── ARTIFICE HORDE UPGRADES (40) ──────────────────────────────────────────────
// Melee attack & armor upgrades (1-6)
add('AH_MELEE_ATK_1', 'Sharpened Blades I', 'ARTIFICE_HORDE', 95, 20, 25, 'Files teeth on buzzsaws, increasing melee unit damage by +2.', { meleeDamageAdd: 2 });
add('AH_MELEE_ATK_2', 'Serrated Gears II', 'ARTIFICE_HORDE', 170, 70, 35, 'Fits double-cut gears into gears, increasing melee unit damage by +4.', { meleeDamageAdd: 4 });
add('AH_MELEE_ATK_3', 'Titanium Teeth III', 'ARTIFICE_HORDE', 245, 120, 45, 'Welds hard titanium blades to gears, increasing melee unit damage by +6.', { meleeDamageAdd: 6 });
add('AH_MELEE_ARM_1', 'Riveted Tin I', 'ARTIFICE_HORDE', 100, 25, 25, 'Adds thin metal sheets over gears, increasing melee unit armor by +1.', { meleeArmorAdd: 1 });
add('AH_MELEE_ARM_2', 'Reinforced Brass II', 'ARTIFICE_HORDE', 180, 75, 35, 'Casts heavy brass frames for plating, increasing melee unit armor by +2.', { meleeArmorAdd: 2 });
add('AH_MELEE_ARM_3', 'Plated Steel III', 'ARTIFICE_HORDE', 260, 130, 45, 'Mounts thick vanadium steel hulls, increasing melee unit armor by +3.', { meleeArmorAdd: 3 });

// Ranged attack & armor upgrades (7-12)
add('AH_RANGED_ATK_1', 'Copper Wires I', 'ARTIFICE_HORDE', 120, 45, 25, 'Fits thin copper wiring into dynamos, increasing ranged unit damage by +2.', { rangedDamageAdd: 2 });
add('AH_RANGED_ATK_2', 'Tesla Coils II', 'ARTIFICE_HORDE', 195, 95, 35, 'Mounts larger magnetic coils, increasing ranged unit damage by +4.', { rangedDamageAdd: 4 });
add('AH_RANGED_ATK_3', 'Voltaic Capacitors III', 'ARTIFICE_HORDE', 270, 140, 45, 'Integrates high-capacity spark units, increasing ranged unit damage by +6.', { rangedDamageAdd: 6 });
add('AH_RANGED_ARM_1', 'Rubber Insulation I', 'ARTIFICE_HORDE', 105, 20, 25, 'Wraps cables in natural gum rubber, increasing ranged unit armor by +1.', { rangedArmorAdd: 1 });
add('AH_RANGED_ARM_2', 'Lead Sheathing II', 'ARTIFICE_HORDE', 175, 70, 35, 'Insulates power lines with lead, increasing ranged unit armor by +2.', { rangedArmorAdd: 2 });
add('AH_RANGED_ARM_3', 'Faraday Shell III', 'ARTIFICE_HORDE', 250, 125, 45, 'Surrounds cores in conductive mesh, increasing ranged unit armor by +3.', { rangedArmorAdd: 3 });

// Economy and building upgrades (13-18)
add('AH_ECON_1', 'Overclocked Pistons', 'ARTIFICE_HORDE', 75, 10, 18, 'Raises steam engine boiler temperatures, increasing Thrall speed by +12%.', { workerSpeedMult: 1.12 });
add('AH_ECON_2', 'Magnetic Grips', 'ARTIFICE_HORDE', 135, 55, 26, 'Fits industrial electromagnets onto hands, increasing resource carry capacity by +2.', { workerCarryAdd: 2 });
add('AH_BUILD_HP_1', 'Welded Seams I', 'ARTIFICE_HORDE', 115, 45, 25, 'Applies dual-pass welding to joints, increasing building hit points by +15%.', { buildingHpMult: 1.15 });
add('AH_BUILD_HP_2', 'Steel Struts II', 'ARTIFICE_HORDE', 215, 85, 35, 'Braces building walls with structural steel, increasing building hit points by +30%.', { buildingHpMult: 1.3 });
add('AH_OBELISK_CAP', 'Aether Grid', 'ARTIFICE_HORDE', 105, 25, 22, 'Overclocks local transmission leylines, increasing supply from Obelisks by +2.', { supplyProvideAdd: 2 });
add('AH_AETHER_COLLECT', 'Aether Condensers', 'ARTIFICE_HORDE', 145, 75, 28, 'Condenses atmospheric magic, increasing gathered aether by +15%.', { aetherMultiplier: 1.15 });

// Unit-specific upgrades (19-40)
add('AH_GEARGUARD_HP', 'Riveted Chassis', 'ARTIFICE_HORDE', 105, 25, 22, 'Bolts extra iron panels onto chassis, increasing Gearguard max HP by +60.', { gearguardHpAdd: 60 });
add('AH_STEAM_SPEED', 'Superheated Fuel', 'ARTIFICE_HORDE', 155, 55, 28, 'Burns oil-coal fuels in furnace, increasing Steam Hulk speed by +15%.', { steamHulkSpeedMult: 1.15 });
add('AH_AUTOMATON_DMG', 'Hydraulic Punch', 'ARTIFICE_HORDE', 145, 65, 26, 'Fits high-pressure piston valves, increasing Automaton damage by +4.', { automatonDamageAdd: 4 });
add('AH_CLOCKWORK_BATTERY', 'Coiled Springs', 'ARTIFICE_HORDE', 115, 35, 22, 'Winds springs using dense alloys, increasing Clockwork Soldier attack speed by +12%.', { clockworkSpeedMult: 1.12 });
add('AH_TESLA_JUMP', 'Lightning Chains', 'ARTIFICE_HORDE', 175, 85, 32, 'Fits multi-frequency discharge rods, increasing Tesla Reaver damage by +5.', { teslaReaverDamageAdd: 5 });
add('AH_THUNDER_RANGE', 'Extended Barrels', 'ARTIFICE_HORDE', 145, 70, 28, 'Lengthens magnetic accelerator rails, increasing Thunderer range by +2.', { thundererRangeAdd: 2 });
add('AH_BOMBARD_RADIUS', 'Volatile Mortar', 'ARTIFICE_HORDE', 195, 105, 35, 'Charges bombard mortar shells with explosive fuel, increasing damage by +12.', { bombardDamageAdd: 12 });
add('AH_REPAIR_NANO', 'Nanite Welder', 'ARTIFICE_HORDE', 135, 55, 25, 'Replaces solder tools with nanite arcs, increasing Repair Drone healing speed by +20%.', { repairDroneHealMult: 1.2 });
add('AH_CHRONO_HASTE', 'Hyper-Clocking', 'ARTIFICE_HORDE', 165, 85, 30, 'Increases temporal engine cycling, increasing Chrono Weaver attack speed by +15%.', { chronoWeaverSpeedMult: 1.15 });
add('AH_NULL_SHIELD', 'Shield Diffuser', 'ARTIFICE_HORDE', 155, 75, 30, 'Fits magic-reflection foils, increasing Nullifier armor by +2.', { nullifierArmorAdd: 2 });
add('AH_COLOSSUS_BEAM', 'Heat-Ray Focus', 'ARTIFICE_HORDE', 235, 135, 40, 'Uses high-index lenses to focus ray emitters, increasing Colossus damage by +10.', { colossusDamageAdd: 10 });
add('AH_AVIATOR_FUEL', 'Aether Fuel Mix', 'ARTIFICE_HORDE', 145, 55, 26, 'Mixes light aether into fuel tanks, increasing Brass Aviator speed by +15%.', { aviatorSpeedMult: 1.15 });
add('AH_GOLEM_ARMOR', 'Cast-Iron Hulls', 'ARTIFICE_HORDE', 175, 75, 30, 'Coats golem frames in cast iron plates, increasing Steam Golem armor by +2.', { steamGolemArmorAdd: 2 });
add('AH_SCOUT_SIGHT', 'Optical Lenses', 'ARTIFICE_HORDE', 95, 25, 20, 'Installs curved magnifying lenses, increasing Mechanized Scout sight radius by +4.', { scoutSightAdd: 4 });
add('AH_PYRO_BURST', 'Napalm Squirts', 'ARTIFICE_HORDE', 155, 75, 28, 'Boosts fuel pressure lines, increasing Pyroclastic Machine attack speed by +10%.', { pyroclasticSpeedMult: 1.1 });
add('AH_STEEL_SPIKE', 'Chrome Ram', 'ARTIFICE_HORDE', 135, 45, 24, 'Mounts sharp chrome tips to rams, increasing Steel Charger speed by +12%.', { steelChargerSpeedMult: 1.12 });
add('AH_FORGE_HEAT', 'Welding Jet', 'ARTIFICE_HORDE', 165, 65, 30, 'Overheats sentinel welding arcs, increasing Forge Sentinel attack speed by +15%.', { forgeSentinelSpeedMult: 1.15 });
add('AH_SHOCK_BATTERY', 'Overcharged Cells', 'ARTIFICE_HORDE', 145, 55, 26, 'Supplies sentinels with high-capacity cells, increasing Shock Sentinel damage by +4.', { shockSentinelDamageAdd: 4 });
add('AH_OVERCHARGED_REACTOR', 'Core Unload', 'ARTIFICE_HORDE', 195, 115, 35, 'Releases energy limiters in walker cores, increasing Overcharged Core damage by +8.', { overchargedCoreDamageAdd: 8 });
add('AH_TINKER_UPGRADE', 'Tinker Shielding', 'ARTIFICE_HORDE', 175, 85, 32, 'Grafts secondary hydraulic rigs, increasing Tinker attack speed by +12%.', { tinkerSpeedMult: 1.12 });
add('AH_SCRAP_SALVAGE', 'Scrap Recyclers', 'ARTIFICE_HORDE', 115, 35, 20, 'Recycles workshop waste, reducing mechanical unit costs by -10% gold.', { mechGoldCostMult: 0.9 });
add('AH_CHRONO_RECALL', 'Temporal Buffer', 'ARTIFICE_HORDE', 155, 95, 30, 'Buffers chronological fields, increasing Chrono Weaver mana capacity by +50.', { chronoWeaverManaAdd: 50 });


// ── TERRA BORN UPGRADES (40) ──────────────────────────────────────────────────
// Melee attack & armor upgrades (1-6)
add('TB_MELEE_ATK_1', 'Sharp Pebbles I', 'TERRA_BORN', 95, 20, 25, 'Scribes sharp runic lines on fists, increasing melee unit damage by +2.', { meleeDamageAdd: 2 });
add('TB_MELEE_ATK_2', 'Basalt Claws II', 'TERRA_BORN', 170, 70, 35, 'Grafts hard basalt spikes to fists, increasing melee unit damage by +4.', { meleeDamageAdd: 4 });
add('TB_MELEE_ATK_3', 'Runic Spikes III', 'TERRA_BORN', 245, 120, 45, 'Invokes volcanic magma channels inside spikes, increasing melee unit damage by +6.', { meleeDamageAdd: 6 });
add('TB_MELEE_ARM_1', 'Clay Skin I', 'TERRA_BORN', 100, 25, 25, 'Bakes thick mud over elemental bodies, increasing melee unit armor by +1.', { meleeArmorAdd: 1 });
add('TB_MELEE_ARM_2', 'Basalt Shell II', 'TERRA_BORN', 180, 75, 35, 'Coats skin in overlapping basalt blocks, increasing melee unit armor by +2.', { meleeArmorAdd: 2 });
add('TB_MELEE_ARM_3', 'Obsidian Crust III', 'TERRA_BORN', 260, 130, 45, 'Weaves a shell of volcanic glass, increasing melee unit armor by +3.', { meleeArmorAdd: 3 });

// Ranged attack & armor upgrades (7-12)
add('TB_RANGED_ATK_1', 'Heated Stones I', 'TERRA_BORN', 120, 45, 25, 'Heats ranged shards in small fires, increasing ranged unit damage by +2.', { rangedDamageAdd: 2 });
add('TB_RANGED_ATK_2', 'Magma Core II', 'TERRA_BORN', 195, 95, 35, 'Infuses shards with magma, increasing ranged unit damage by +4.', { rangedDamageAdd: 4 });
add('TB_RANGED_ATK_3', 'Volcanic Heart III', 'TERRA_BORN', 270, 140, 45, 'Awakens crystal cores with deep volcanic fire, increasing ranged unit damage by +6.', { rangedDamageAdd: 6 });
add('TB_RANGED_ARM_1', 'Crystal Shell I', 'TERRA_BORN', 105, 20, 25, 'Grows crystal clusters on ranged constructs, increasing ranged unit armor by +1.', { rangedArmorAdd: 1 });
add('TB_RANGED_ARM_2', 'Runic Crystal II', 'TERRA_BORN', 175, 70, 35, 'Invokes protective earth barriers on crystal plates, increasing ranged unit armor by +2.', { rangedArmorAdd: 2 });
add('TB_RANGED_ARM_3', 'Prismatic Aegis III', 'TERRA_BORN', 250, 125, 45, 'Refines crystal surfaces to deflect projectiles, increasing ranged unit armor by +3.', { rangedArmorAdd: 3 });

// Economy and building upgrades (13-18)
add('TB_ECON_1', 'Stone Strides', 'TERRA_BORN', 70, 5, 16, 'Summons tectonic vibrations, increasing Golemling speed by +10%.', { workerSpeedMult: 1.1 });
add('TB_ECON_2', 'Heavy Grasp', 'TERRA_BORN', 135, 45, 25, 'Widens Golemling stone grips, increasing resource carry limit by +2.', { workerCarryAdd: 2 });
add('TB_BUILD_HP_1', 'Bedrock Foundations I', 'TERRA_BORN', 125, 40, 25, 'Anchors buildings deep into bedrock, increasing building hit points by +15%.', { buildingHpMult: 1.15 });
add('TB_BUILD_HP_2', 'Basalt Framing II', 'TERRA_BORN', 205, 85, 35, 'Constructs heavy basalt support pillars, increasing building hit points by +30%.', { buildingHpMult: 1.3 });
add('TB_CONDUIT_SUPPLY', 'Crystal Focus', 'TERRA_BORN', 105, 20, 20, 'Resonates conduit light, increasing supply from Conduits by +2.', { supplyProvideAdd: 2 });
add('TB_GEODE_MINING', 'Geode Extraction', 'TERRA_BORN', 155, 75, 28, 'Scribes drills with mineral detection runes, increasing gold and aether gathering by +10%.', { resourceMultiplier: 1.1 });

// Unit-specific upgrades (19-40)
add('TB_STONE_HP', 'Granite Infusion', 'TERRA_BORN', 115, 35, 22, 'Grafts granite veins into elemental limbs, increasing Stone Crusher HP by +60.', { stoneCrusherHpAdd: 60 });
add('TB_OBSIDIAN_SHARP', 'Glass Razors', 'TERRA_BORN', 145, 70, 28, 'Sharpens glass blades to cut deep, increasing Obsidian Shard damage by +4.', { obsidianShardDamageAdd: 4 });
add('TB_MUD_SLOW', 'Silt Pools', 'TERRA_BORN', 125, 45, 24, 'Lubricates elemental mud bodies, increasing Mud Elemental speed by +12%.', { mudElementalSpeedMult: 1.12 });
add('TB_GRAVEL_RANGE', 'Gravel Slings', 'TERRA_BORN', 135, 55, 25, 'Ties high tension leather straps to slings, increasing Gravel Hurler range by +1.5.', { gravelHurlerRangeAdd: 1.5 });
add('TB_TREMOR_STOMP', 'Quake Wave', 'TERRA_BORN', 175, 75, 30, 'Vibrates tremor beast hooves, increasing Tremor Beast attack speed by +15%.', { tremorBeastSpeedMult: 1.15 });
add('TB_GIANT_THROW', 'Boulder Pitching', 'TERRA_BORN', 205, 105, 35, 'Drills Giants in target tracking, increasing Mountain Giant damage by +12.', { mountainGiantDamageAdd: 12 });
add('TB_CRYSTAL_HEALING', 'Prismatic Mending', 'TERRA_BORN', 145, 55, 26, 'Aligns crystal healer beams to heal stone joints, increasing healing amount by +6.', { crystalHealerHealAdd: 6 });
add('TB_GEODE_DMG', 'Geode Shatter', 'TERRA_BORN', 155, 65, 28, 'Overcharges crystal points, increasing Geode Lurker ambush damage by +8.', { geodeLurkerDamageAdd: 8 });
add('TB_LAVA_FIRE', 'Magma Spit', 'TERRA_BORN', 145, 70, 28, 'Insulates spit tubes, increasing Lava Spitter attack range by +2.', { lavaSpitterRangeAdd: 2 });
add('TB_BOULDER_DMG', 'Heavy Crushing', 'TERRA_BORN', 175, 85, 32, 'Supplies hurlers with heavy granite stones, increasing Boulder Hurler damage by +8.', { boulderHurlerDamageAdd: 8 });
add('TB_GRANITE_WALL', 'Shield Monolith', 'TERRA_BORN', 155, 55, 28, 'Scribes walling runes on shield slabs, increasing Granite Shield armor by +3.', { graniteShieldArmorAdd: 3 });
add('TB_GARGOYLE_WINGS', 'Basalt Wings', 'TERRA_BORN', 145, 65, 26, 'Trims basalt wings to float, increasing Ironstone Gargoyle speed by +15%.', { gargoyleSpeedMult: 1.15 });
add('TB_SAND_WEAVER', 'Sand Whistle', 'TERRA_BORN', 105, 25, 20, 'Gives Sand Weavers sand wind sensors, increasing sight radius by +3.', { sandWeaverSightAdd: 3 });
add('TB_GUARDIAN_CORE', 'Magma Chambering', 'TERRA_BORN', 185, 85, 32, 'Fits extra lava traps in hulls, increasing Core Guardian armor by +2.', { coreGuardianArmorAdd: 2 });
add('TB_EARTH_HP', 'Seismic Vitality', 'TERRA_BORN', 195, 95, 35, 'Fills cracks in constructs with seismic clay, increasing Earthshaker max HP by +120.', { earthshakerHpAdd: 120 });
add('TB_MAGMA_BURST', 'Volcanic Heat', 'TERRA_BORN', 215, 105, 36, 'Accelerates basalt circulation, increasing Magma Lord attack speed by +12%.', { magmaLordSpeedMult: 1.12 });
add('TB_DUST_HASTE', 'Sprite Flurry', 'TERRA_BORN', 115, 35, 22, 'Grafts swirling breeze runes into dust, increasing Dust Sprite attack speed by +15%.', { dustSpriteSpeedMult: 1.15 });
add('TB_STALAGMITE_DEF', 'Rock Spikes', 'TERRA_BORN', 135, 45, 25, 'Grows spiky rocks on shoulders, increasing Stalagmite Sentinel armor by +2.', { stalagmiteArmorAdd: 2 });
add('TB_GOLEM_CAPACITY', 'Leyline Fusion', 'TERRA_BORN', 245, 145, 40, 'Overloads crystal power arrays, increasing Aether Golem damage by +10.', { aetherGolemDamageAdd: 10 });
add('TB_ARCHON_BLAST', 'Terran Monolith Beam', 'TERRA_BORN', 235, 145, 42, 'Taps planetary leyline grids, increasing Terra Archon damage by +12.', { terraArchonDamageAdd: 12 });
add('TB_BASALT_HEAL', 'Lava Regeneration', 'TERRA_BORN', 125, 55, 25, 'Melts stone slowly to heal wounds, increasing Terra Born units health regen speed.', { terraRegenAdd: 1 });
add('TB_EARTH_ALLIANCE', 'Earthen Unity', 'TERRA_BORN', 145, 75, 28, 'Aligns mineral fields, increasing elemental unit armor by +1.', { elementalArmorAdd: 1 });


// ── CHAOS DEEP UPGRADES (40) ──────────────────────────────────────────────────
// Melee attack & armor upgrades (1-6)
add('CD_MELEE_ATK_1', 'Toxic Claws I', 'CHAOS_DEEP', 95, 20, 25, 'Grafts poison-secreting glands into claws, increasing melee unit damage by +2.', { meleeDamageAdd: 2 });
add('CD_MELEE_ATK_2', 'Acidic Bites II', 'CHAOS_DEEP', 170, 70, 35, 'Concentrates jaw acids, increasing melee unit damage by +4.', { meleeDamageAdd: 4 });
add('CD_MELEE_ATK_3', 'Corrosive Fangs III', 'CHAOS_DEEP', 245, 120, 45, 'Mutates teeth to secret bio-acid, increasing melee unit damage by +6.', { meleeDamageAdd: 6 });
add('CD_MELEE_ARM_1', 'Thin Carapace I', 'CHAOS_DEEP', 100, 25, 25, 'Thickens worker and fiend skin membranes, increasing melee unit armor by +1.', { meleeArmorAdd: 1 });
add('CD_MELEE_ARM_2', 'Chitinous Shell II', 'CHAOS_DEEP', 180, 75, 35, 'Grows overlapping chitinous scale layers, increasing melee unit armor by +2.', { meleeArmorAdd: 2 });
add('CD_MELEE_ARM_3', 'Hardened Bone III', 'CHAOS_DEEP', 260, 130, 45, 'Mutates shell plates to calcified bone, increasing melee unit armor by +3.', { meleeArmorAdd: 3 });

// Ranged attack & armor upgrades (7-12)
add('CD_RANGED_ATK_1', 'Bone Needles I', 'CHAOS_DEEP', 120, 45, 25, 'Hardens needle tips inside striders, increasing ranged unit damage by +2.', { rangedDamageAdd: 2 });
add('CD_RANGED_ATK_2', 'Barbed Spines II', 'CHAOS_DEEP', 195, 95, 35, 'Adds barbs to spines to drag flesh, increasing ranged unit damage by +4.', { rangedDamageAdd: 4 });
add('CD_RANGED_ATK_3', 'Acidic Spits III', 'CHAOS_DEEP', 270, 140, 45, 'Infects needles with dissolving venom, increasing ranged unit damage by +6.', { rangedDamageAdd: 6 });
add('CD_RANGED_ARM_1', 'Epidermal Scales I', 'CHAOS_DEEP', 105, 20, 25, 'Grows small scales over soft skins, increasing ranged unit armor by +1.', { rangedArmorAdd: 1 });
add('CD_RANGED_ARM_2', 'Fibrous Leather II', 'CHAOS_DEEP', 175, 70, 35, 'Hardens skin layers with tough fibers, increasing ranged unit armor by +2.', { rangedArmorAdd: 2 });
add('CD_RANGED_ARM_3', 'Plated Scales III', 'CHAOS_DEEP', 250, 125, 45, 'Mutates scales into calcified shell sections, increasing ranged unit armor by +3.', { rangedArmorAdd: 3 });

// Economy and building upgrades (13-18)
add('CD_ECON_1', 'Limb Growth', 'CHAOS_DEEP', 75, 15, 16, 'Grows secondary walking appendages, increasing Larval Dredger speed by +15%.', { workerSpeedMult: 1.15 });
add('CD_ECON_2', 'Regurgitate Sacks', 'CHAOS_DEEP', 115, 35, 24, 'Expands internal storage sacs, increasing Larval Dredger resource carry by +2.', { workerCarryAdd: 2 });
add('CD_BUILD_HP_1', 'Bio-Membranes I', 'CHAOS_DEEP', 105, 35, 25, 'Coats hive walls with sticky slime glands, increasing building hit points by +15%.', { buildingHpMult: 1.15 });
add('CD_BUILD_HP_2', 'Chitin Walls II', 'CHAOS_DEEP', 195, 75, 35, 'Grows calcified shell layers over structures, increasing building hit points by +30%.', { buildingHpMult: 1.3 });
add('CD_SUPPLY_UP', 'Sack Expansion', 'CHAOS_DEEP', 95, 15, 20, 'Mutates Spore-Sacks to grow larger gas bags, increasing supply they provide by +2.', { supplyProvideAdd: 2 });
add('CD_CREEP_SPEED', 'Synaptic Mucus', 'CHAOS_DEEP', 115, 45, 22, 'Vibrates background leylines on creep, increasing all unit speed by +10%.', { globalSpeedMult: 1.1 });

// Unit-specific upgrades (19-40)
add('CD_MAULER_REGEN', 'Cellular Overdrive', 'CHAOS_DEEP', 135, 55, 26, 'Speeds up beetle flesh mending, increasing Plated Mauler health regeneration speed.', { maulerRegenAdd: 2 });
add('CD_MANTA_SPEED', 'Air Sacs', 'CHAOS_DEEP', 155, 75, 28, 'Mutates larger gas bladder sacs, increasing Spore-Manta speed by +15%.', { mantaSpeedMult: 1.15 });
add('CD_STRIDER_RANGE', 'Needle Squirters', 'CHAOS_DEEP', 145, 70, 28, 'Fits high-pressure lung pumps, increasing Needle-Strider range by +2.', { striderRangeAdd: 2 });
add('CD_IMPALER_BURROW', 'Spike Volley', 'CHAOS_DEEP', 165, 85, 30, 'Extends spike lengths, increasing Lurking Impaler damage by +6.', { impalerDamageAdd: 6 });
add('CD_BURSTER_BURST', 'Bile Expansion', 'CHAOS_DEEP', 135, 55, 24, 'Concentrates burster belly acid, increasing Bile-Vessel explosion damage by +8.', { bursterDamageAdd: 8 });
add('CD_BEHEMOTH_PLATING', 'Juggernaut Plates', 'CHAOS_DEEP', 235, 125, 40, 'Adds dense armored sheets to hulls, increasing Dread-Behemoth armor by +3.', { behemothArmorAdd: 3 });
add('CD_MATRIARCH_VIGOR', 'Larval Birthing', 'CHAOS_DEEP', 115, 45, 22, 'Grows secondary birth glands, increasing Brood-Matriarch mana capacity by +50.', { matriarchManaAdd: 50 });
add('CD_DART_SENSE', 'Suicide Rockets', 'CHAOS_DEEP', 95, 35, 20, 'Fits compressed gas nozzles in tails, increasing Bile-Dart speed by +20%.', { dartSpeedMult: 1.2 });
add('CD_WATCHER_EYES', 'Broad Sight', 'CHAOS_DEEP', 105, 25, 22, 'Mutates wide panoramic eye retinas, increasing Abyssal Watcher sight radius by +4.', { watcherSightAdd: 4 });
add('CD_LASHER_SPIT', 'Acid Splashes', 'CHAOS_DEEP', 155, 75, 28, 'Concentrates lasher mouth spikes, increasing Spore-Lasher damage by +4.', { lasherDamageAdd: 4 });
add('CD_CASTER_BILE', 'Bile Volley', 'CHAOS_DEEP', 175, 85, 32, 'Increases backline mortar ranges, increasing Bile-Caster damage by +5.', { casterDamageAdd: 5 });
add('CD_SPORELING_ATK', 'Larval Teeth', 'CHAOS_DEEP', 165, 85, 30, 'Mutates sharper mandibles on sporelings, increasing spawnling damage by +3.', { sporelingDamageAdd: 3 });
add('CD_MONARCH_SYNERGY', 'Monarch Brain', 'CHAOS_DEEP', 245, 135, 40, 'Integrates fast synaptic brains, increasing Swarm-Monarch attack speed by +15%.', { monarchSpeedMult: 1.15 });
add('CD_FIEND_ENERGY', 'Web Energy', 'CHAOS_DEEP', 175, 95, 32, 'Fits large weave glands, increasing Grip-Fiend starting mana by +50.', { fiendManaAdd: 50 });
add('CD_THRALL_SPEED', 'Plague Run', 'CHAOS_DEEP', 105, 25, 20, 'Drills thralls in twitch movements, increasing Plague-Thrall speed by +15%.', { thrallSpeedMult: 1.15 });
add('CD_APEX_SIPHON', 'Vampire Claws', 'CHAOS_DEEP', 215, 115, 38, 'Siphons host blood on claw strikes, increasing Apex Tyrant damage by +8.', { apexDamageAdd: 8 });
add('CD_WORM_SPEED', 'Centipede Speed', 'CHAOS_DEEP', 145, 45, 26, 'Speeds up body contractions, reducing Chasm-Worm loading time by +25%.', { wormSpeedMult: 1.25 });
add('CD_SPORELING_HP', 'Sporeling Hulls', 'CHAOS_DEEP', 85, 15, 16, 'Hardens spawnling carapaces, increasing Sporeling max HP by +25.', { sporelingHpAdd: 25 });
add('CD_SENTINEL_SIGHT', 'Turret Eye', 'CHAOS_DEEP', 175, 85, 32, 'Overclocks sentinel eye nodes, increasing Swarm Sentinel range by +1.5.', { sentinelRangeAdd: 1.5 });
add('CD_WEAVER_GLANDS', 'Parasite Glands', 'CHAOS_DEEP', 165, 75, 30, 'Enlarges weaver poison sacks, increasing Parasitic Weaver starting mana by +25.', { weaverManaAdd: 25 });
add('CD_REGEN_AURA', 'Spore Regeneration', 'CHAOS_DEEP', 145, 55, 26, 'Vibrates health spores in air, increasing all Chaos Deep units health regen by +0.5.', { globalRegenAdd: 0.5 });
add('CD_CARAPACE_HARD', 'Bug Shells', 'CHAOS_DEEP', 135, 45, 24, 'Grows hard plates on small fiends, increasing Rift-Fiend HP by +15.', { riftFiendHpAdd: 15 });

export function getUpgradeType(id) {
  const up = UPGRADES[id];
  if (!up) throw new Error(`Unknown upgrade: ${id}`);
  return up;
}
