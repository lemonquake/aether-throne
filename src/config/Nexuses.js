/**
 * NEXUSES — the selectable battlegrounds for the new Aetheric Matrix System.
 * 
 * Each nexus represents a floating dimensional energy grid with distinct
 * properties and resonance.
 */

export const NEXUSES = {
  aether_core: {
    id: 'aether_core',
    name: 'Aether Core',
    resonanceColor: '#00ffff', // Cyan glow
    gridSize: 400,
    doodadDensity: 0.45,
    coreStability: 'Stable Resonance',
    blurb: 'A perfectly symmetrical, high-energy matrix with balanced resources and stable navigation lanes.',
  },
  void_matrix: {
    id: 'void_matrix',
    name: 'Void Matrix',
    resonanceColor: '#9b30ff', // Purple glow
    gridSize: 480,
    doodadDensity: 0.6,
    coreStability: 'Fluctuating Void',
    blurb: 'An expansive dark sector. Large distances separate bases, and static void spires disrupt pathways.',
  },
  solar_lattice: {
    id: 'solar_lattice',
    name: 'Solar Lattice',
    resonanceColor: '#ffaa00', // Amber/gold glow
    gridSize: 320,
    doodadDensity: 0.3,
    coreStability: 'High Thermal Flux',
    blurb: 'A compact, aggressive grid. Resource cores are clustered closer together, encouraging early conflicts.',
  },
};

export const DEFAULT_NEXUS = 'aether_core';

export function getNexusType(nexusId) {
  return NEXUSES[nexusId] || NEXUSES[DEFAULT_NEXUS];
}

export function getAvailableNexuses() {
  return NEXUSES;
}
