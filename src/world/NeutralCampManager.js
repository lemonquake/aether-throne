import * as THREE from 'three';
import { eventBus, EVENTS } from '../engine/EventBus.js';

export class NeutralCampManager {
  constructor(engine) {
    this.engine = engine;
    this.camps = new Map();
    this._unsubs = [
      eventBus.on(EVENTS.UNIT_DIED, (payload) => this._onUnitDied(payload)),
    ];
  }

  spawnFromLayout(layout) {
    this.camps.clear();
    const camps = layout?.neutralCamps ?? [];
    for (const data of camps) {
      const totalUnits = (data.units ?? []).reduce((sum, u) => sum + (u.count ?? 1), 0);
      const state = {
        data,
        unitIds: new Set(),
        totalUnits: Math.max(1, totalUnits),
        respawnAt: 0,
      };
      this.camps.set(data.id, state);
      this._spawnCamp(state);
    }
  }

  update() {
    const now = this.engine.gameTime;
    for (const camp of this.camps.values()) {
      if (camp.unitIds.size > 0 || camp.respawnAt <= 0 || now < camp.respawnAt) continue;
      camp.respawnAt = 0;
      this._spawnCamp(camp);
    }
  }

  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs.length = 0;
    this.camps.clear();
  }

  _spawnCamp(camp) {
    const data = camp.data;
    const owner = this.engine.neutralPlayer;
    if (!owner || !this.engine.entities) return;
    const radius = Math.max(2, data.radius ?? 12);
    let index = 0;

    for (const entry of data.units ?? []) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        const angle = (index / Math.max(1, camp.totalUnits)) * Math.PI * 2 + (data.x * 0.013 + data.z * 0.017);
        const dist = radius * (0.22 + 0.34 * ((index % 3) / 2));
        const x = data.x + Math.cos(angle) * dist;
        const z = data.z + Math.sin(angle) * dist;
        const y = this.engine.nexus ? this.engine.nexus.getHeightAt(x, z) : 0;
        const unit = this.engine.entities.spawnUnit(entry.typeId, owner, new THREE.Vector3(x, y, z));
        unit.neutralCampId = data.id;
        unit.neutralBountyGold = Math.max(5, Math.round((data.rewardGold ?? 60) / camp.totalUnits));
        unit.guardPosition = new THREE.Vector3(data.x, this.engine.nexus ? this.engine.nexus.getHeightAt(data.x, data.z) : 0, data.z);
        camp.unitIds.add(unit.id);
        index++;
      }
    }
  }

  _onUnitDied(payload) {
    const unit = payload?.entity;
    const campId = unit?.neutralCampId;
    if (!campId) return;
    const camp = this.camps.get(campId);
    if (!camp) return;

    camp.unitIds.delete(unit.id);
    const killerPlayer = payload?.killer?.player;
    if (killerPlayer && !killerPlayer.isNeutralHostile) {
      killerPlayer.grantBounty({ gold: unit.neutralBountyGold ?? 10 });
    }

    if (camp.unitIds.size === 0) {
      camp.respawnAt = this.engine.gameTime + (camp.data.respawnSeconds ?? 60);
    }
  }
}
