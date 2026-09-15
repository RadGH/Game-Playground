import * as THREE from 'three';
import { SpellFx } from './spellfx.js';

/** Opt-in renderer for the existing spell vocabulary. Geometry effects are unchanged. */
export class BatchedSpellFx extends SpellFx {
  constructor(scene, opts = {}) {
    super(scene, opts);
    this.spriteRecords = new Map(); this.spriteBatches = new Map();
    this.batchRoot = new THREE.Group(); this.batchRoot.name = 'spell-sprite-batches'; scene.add(this.batchRoot);
    this._matrix = new THREE.Matrix4(); this._position = new THREE.Vector3(); this._scale = new THREE.Vector3();
    this._cameraRotation = new THREE.Quaternion(); this._rotation = new THREE.Quaternion();
    this._zRotation = new THREE.Quaternion(); this._zAxis = new THREE.Vector3(0, 0, 1);
    this.renderedSprites = 0; this.batchOverflow = 0;
  }
  _sprite(id, opts) {
    const sprite = super._sprite(id, opts);
    if (!sprite || this.spriteRecords.has(sprite)) return sprite;
    // Keep the original object's lifetime, transforms and visibility for the effect simulation.
    // Only its drawing moves to the batch. The normal camera does not enable layer 31.
    sprite.layers.set(31);
    const dispose = () => { this.spriteRecords.delete(sprite); sprite.material.removeEventListener('dispose', dispose); };
    sprite.material.addEventListener('dispose', dispose);
    this.spriteRecords.set(sprite, { sprite, dispose, depth: 0 });
    return sprite;
  }
  _batch(material) {
    const key = material.map.uuid + ':' + material.blending;
    if (this.spriteBatches.has(key)) return this.spriteBatches.get(key);
    const capacity = 512;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('batchOpacity', opacity);
    const mat = new THREE.MeshBasicMaterial({ map: material.map, transparent: true, depthWrite: false, blending: material.blending, toneMapped: false });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float batchOpacity; varying float vBatchOpacity;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBatchOpacity = batchOpacity;');
      shader.fragmentShader = 'varying float vBatchOpacity;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= vBatchOpacity;\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'spell-batch-opacity-v1';
    const mesh = new THREE.InstancedMesh(geometry, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
    this.batchRoot.add(mesh);
    const batch = { mesh, opacity, records: [], capacity };
    this.spriteBatches.set(key, batch); return batch;
  }
  update(dt) { super.update(dt); this.syncSprites(); }
  syncSprites() {
    if (!this.camera) return;
    this.scene.updateMatrixWorld(); this.camera.updateMatrixWorld();
    this.camera.getWorldQuaternion(this._cameraRotation);
    for (const b of this.spriteBatches.values()) b.records.length = 0;
    this.renderedSprites = 0; this.batchOverflow = 0;
    for (const record of this.spriteRecords.values()) {
      const s = record.sprite;
      if (!s.parent || !s.visible || s.material.opacity <= 0) continue;
      let parent = s.parent, attached = false, visible = true;
      while (parent) { if (!parent.visible) visible = false; if (parent === this.scene) { attached = true; break; } parent = parent.parent; }
      if (!attached || !visible) continue;
      record.depth = this._position.setFromMatrixPosition(s.matrixWorld).applyMatrix4(this.camera.matrixWorldInverse).z;
      this._batch(s.material).records.push(record);
    }
    for (const batch of this.spriteBatches.values()) {
      const { mesh, records, opacity, capacity } = batch;
      if (mesh.material.blending === THREE.NormalBlending) records.sort((a, b) => a.depth - b.depth);
      mesh.count = Math.min(capacity, records.length);
      this.batchOverflow += Math.max(0, records.length - capacity); this.renderedSprites += mesh.count;
      for (let i = 0; i < mesh.count; i++) {
        const s = records[i].sprite;
        this._position.setFromMatrixPosition(s.matrixWorld); this._scale.setFromMatrixScale(s.matrixWorld);
        this._zRotation.setFromAxisAngle(this._zAxis, s.material.rotation || 0);
        this._rotation.copy(this._cameraRotation).multiply(this._zRotation);
        this._matrix.compose(this._position, this._rotation, this._scale);
        mesh.setMatrixAt(i, this._matrix); mesh.setColorAt(i, s.material.color); opacity.setX(i, s.material.opacity);
      }
      if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; opacity.needsUpdate = true; }
    }
  }
  stats() { return { ...super.stats(), batchedSprites: this.renderedSprites, batches: [...this.spriteBatches.values()].filter(b => b.mesh.count).length, overflow: this.batchOverflow }; }
  dispose() {
    super.dispose(); this.clearPool();
    for (const { sprite, dispose } of this.spriteRecords.values()) sprite.material.removeEventListener('dispose', dispose);
    this.spriteRecords.clear();
    for (const b of this.spriteBatches.values()) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.mesh.dispose(); }
    this.spriteBatches.clear(); this.batchRoot.removeFromParent();
  }
}
