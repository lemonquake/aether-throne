// Cache for generated upgrade icons (data URLs)
const iconCache = new Map();

/**
 * Generate a unique, themed, procedural 2D canvas icon for a research upgrade.
 * @param {string} upgradeId - The upgrade ID (e.g. 'BH_MELEE_ATK_2').
 * @param {string} [themeColor='#4da6ff'] - The race theme color for background gradient.
 * @returns {string} Base64 PNG data URL of the icon.
 */
export function getUpgradeIcon(upgradeId, themeColor = '#4da6ff') {
  const cacheKey = `${upgradeId}:${themeColor}`;
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey);
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // ── 1. Background Gradient ──
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    // Center glow uses the theme color
    grad.addColorStop(0, themeColor);
    // Outer edge is dark metallic/slate
    grad.addColorStop(0.8, '#0b0f19');
    grad.addColorStop(1, '#05070c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    // ── 2. Metallic Bezel Border ──
    ctx.strokeStyle = '#c9a227'; // gold bezel
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thin border line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(32, 32, 27, 0, Math.PI * 2);
    ctx.stroke();

    // ── 3. Draw Emblem Glyph based on upgrade type ──
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Add shadow glow for the glyph
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 6;

    const id = upgradeId.toUpperCase();
    
    if (id.includes('ATK')) {
      // Crossed Weapons (Swords / Axes)
      ctx.beginPath();
      // Weapon 1 (top-left to bottom-right)
      ctx.moveTo(18, 18); ctx.lineTo(46, 46);
      // Guard & Hilt
      ctx.moveTo(42, 46); ctx.lineTo(46, 42);
      ctx.moveTo(40, 40); ctx.lineTo(44, 40);
      
      // Weapon 2 (top-right to bottom-left)
      ctx.moveTo(46, 18); ctx.lineTo(18, 46);
      // Guard & Hilt
      ctx.moveTo(22, 46); ctx.lineTo(18, 42);
      ctx.moveTo(24, 40); ctx.lineTo(20, 40);
      ctx.stroke();
    } else if (id.includes('ARM')) {
      // Sturdy Shield
      ctx.beginPath();
      ctx.moveTo(32, 16);
      ctx.quadraticCurveTo(46, 16, 46, 26);
      ctx.quadraticCurveTo(46, 44, 32, 49);
      ctx.quadraticCurveTo(18, 44, 18, 26);
      ctx.quadraticCurveTo(18, 16, 32, 16);
      ctx.closePath();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.stroke();
      
      // Cross detail inside shield
      ctx.beginPath();
      ctx.moveTo(32, 16); ctx.lineTo(32, 49);
      ctx.moveTo(18, 28); ctx.lineTo(46, 28);
      ctx.stroke();
    } else if (id.includes('ECON') || id.includes('TAXES') || id.includes('COLLECT')) {
      // Gold bag / Coin & pickaxe
      // Gold coin
      ctx.beginPath();
      ctx.arc(32, 32, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201, 162, 39, 0.3)';
      ctx.fill();
      ctx.stroke();
      // Currency symbol
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 32, 32);
    } else if (id.includes('SPEED') || id.includes('HASTE') || id.includes('BOOST')) {
      // Winged boot / lightning arrows
      ctx.beginPath();
      // Fast chevrons pointing up
      ctx.moveTo(32, 16); ctx.lineTo(44, 28); ctx.moveTo(32, 16); ctx.lineTo(20, 28);
      ctx.moveTo(32, 26); ctx.lineTo(44, 38); ctx.moveTo(32, 26); ctx.lineTo(20, 38);
      ctx.moveTo(32, 36); ctx.lineTo(44, 48); ctx.moveTo(32, 36); ctx.lineTo(20, 48);
      ctx.stroke();
    } else if (id.includes('HP') || id.includes('BUILD') || id.includes('WALL') || id.includes('CAP') || id.includes('OBELISK')) {
      // Brick wall / Castle Keep
      ctx.beginPath();
      ctx.moveTo(18, 44); ctx.lineTo(18, 22);
      ctx.lineTo(24, 22); ctx.lineTo(24, 28);
      ctx.lineTo(30, 28); ctx.lineTo(30, 22);
      ctx.lineTo(34, 22); ctx.lineTo(34, 28);
      ctx.lineTo(40, 28); ctx.lineTo(40, 22);
      ctx.lineTo(46, 22); ctx.lineTo(46, 44);
      ctx.closePath();
      ctx.stroke();
      
      // Horizontal brick line
      ctx.beginPath();
      ctx.moveTo(18, 33); ctx.lineTo(46, 33);
      ctx.moveTo(27, 33); ctx.lineTo(27, 44);
      ctx.moveTo(37, 33); ctx.lineTo(37, 44);
      ctx.moveTo(32, 22); ctx.lineTo(32, 33);
      ctx.stroke();
    } else if (id.includes('RANGE') || id.includes('SCOPE') || id.includes('TOWER')) {
      // Crosshair Target
      ctx.beginPath();
      ctx.arc(32, 32, 14, 0, Math.PI * 2);
      ctx.arc(32, 32, 6, 0, Math.PI * 2);
      ctx.moveTo(32, 12); ctx.lineTo(32, 52);
      ctx.moveTo(12, 32); ctx.lineTo(52, 32);
      ctx.stroke();
    } else if (id.includes('TESLA') || id.includes('JUMP') || id.includes('BATTERY') || id.includes('SHOCK')) {
      // Lightning Bolt
      ctx.beginPath();
      ctx.moveTo(38, 14);
      ctx.lineTo(22, 34);
      ctx.lineTo(32, 34);
      ctx.lineTo(26, 50);
      ctx.lineTo(44, 28);
      ctx.lineTo(34, 28);
      ctx.closePath();
      ctx.stroke();
    } else if (id.includes('HEAL') || id.includes('BUFF') || id.includes('VIGOR')) {
      // Healing Holy Cross
      ctx.beginPath();
      ctx.moveTo(28, 14); ctx.lineTo(36, 14);
      ctx.lineTo(36, 24); ctx.lineTo(46, 24);
      ctx.lineTo(46, 32); ctx.lineTo(36, 32);
      ctx.lineTo(36, 50); ctx.lineTo(28, 50);
      ctx.lineTo(28, 32); ctx.lineTo(18, 32);
      ctx.lineTo(18, 24); ctx.lineTo(28, 24);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
      ctx.stroke();
    } else if (id.includes('WIS') || id.includes('WISDOM') || id.includes('RECALL')) {
      // Magic Spellbook
      ctx.beginPath();
      ctx.moveTo(32, 46); ctx.lineTo(46, 40); ctx.lineTo(46, 18); ctx.lineTo(32, 24); ctx.closePath();
      ctx.moveTo(32, 46); ctx.lineTo(18, 40); ctx.lineTo(18, 18); ctx.lineTo(32, 24); ctx.closePath();
      ctx.stroke();
      // Center spine
      ctx.beginPath();
      ctx.moveTo(32, 24); ctx.lineTo(32, 46);
      ctx.stroke();
    } else if (id.includes('GEAR') || id.includes('AUTOMATON')) {
      // Mechanics Gear
      ctx.beginPath();
      ctx.arc(32, 32, 10, 0, Math.PI * 2);
      // teeth
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.moveTo(32 + Math.cos(ang) * 9, 32 + Math.sin(ang) * 9);
        ctx.lineTo(32 + Math.cos(ang) * 15, 32 + Math.sin(ang) * 15);
      }
      ctx.stroke();
    } else {
      // Default: Mystical geometric magic rune
      ctx.beginPath();
      ctx.moveTo(32, 15); ctx.lineTo(47, 32); ctx.lineTo(32, 49); ctx.lineTo(17, 32); ctx.closePath();
      ctx.moveTo(32, 21); ctx.lineTo(41, 32); ctx.lineTo(32, 43); ctx.lineTo(23, 32); ctx.closePath();
      ctx.stroke();
      // Center dot
      ctx.beginPath();
      ctx.arc(32, 32, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Reset shadow for pips
    ctx.shadowBlur = 0;

    // ── 4. Draw Tier Pips (at bottom) ──
    const tierMatch = upgradeId.match(/_(\d)$/);
    if (tierMatch) {
      const tier = parseInt(tierMatch[1], 10);
      ctx.fillStyle = '#f0cf6e'; // gold/yellow pips
      
      const pipY = 53;
      if (tier === 1) {
        ctx.beginPath(); ctx.arc(32, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (tier === 2) {
        ctx.beginPath(); ctx.arc(28, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(36, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (tier === 3) {
        ctx.beginPath(); ctx.arc(24, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(32, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, pipY, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    iconCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('Failed to draw upgrade icon for', upgradeId, err);
    return '';
  }
}
