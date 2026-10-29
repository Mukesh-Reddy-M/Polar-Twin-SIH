/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Procedural texture generator adhering strictly to the Three.js skill guide:
 * - Zero external assets or 404s
 * - Explicit sRGB color space on color textures
 * - High anisotropy for razor-sharp grazing angles
 */

export class StationTextureFactory {
  private static cache = new Map<string, THREE.Texture>();

  /** Release cached procedural textures during the React scene teardown. */
  public static disposeAll(): void {
    this.cache.forEach((texture) => texture.dispose());
    this.cache.clear();
  }

  /**
   * Generates Antarctic station insulated composite wall panels
   */
  public static getPanelTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'station_panel';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base off-white/light-grey aerodynamic composite panel
    ctx.fillStyle = '#d5dde5';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle brushed horizontal texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < 512; i += 4) {
      ctx.fillRect(0, i, 512, 2);
    }

    // Panel seams
    ctx.strokeStyle = '#8595a8';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 504, 504);

    // Horizontal split seam
    ctx.beginPath();
    ctx.moveTo(4, 256);
    ctx.lineTo(508, 256);
    ctx.stroke();

    // Rivet dots along edges
    ctx.fillStyle = '#64748b';
    const rivetSpacing = 32;
    for (let x = 16; x < 512; x += rivetSpacing) {
      ctx.beginPath();
      ctx.arc(x, 12, 2.5, 0, Math.PI * 2);
      ctx.arc(x, 248, 2.5, 0, Math.PI * 2);
      ctx.arc(x, 264, 2.5, 0, Math.PI * 2);
      ctx.arc(x, 500, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Corrugated orange-red Antarctic cargo container texture
   */
  public static getContainerTexture(color = '#ea580c', maxAnisotropy = 4): THREE.CanvasTexture {
    const key = `container_${color}`;
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Container base orange/red
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 256);

    // Corrugation vertical ridges (shadow and highlight pairs)
    const step = 16;
    for (let x = 0; x < 512; x += step) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(x, 0, step / 2, 256);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(x + step / 2, 0, step / 2, 256);
    }

    // Heavy corner casting frames
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 248);

    // Generic non-text stencil blocks avoid implying a specific cargo identity.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(30, 30, 120, 8);
    ctx.fillRect(30, 44, 74, 5);

    // High-visibility reflective corner strips
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(480, 16, 16, 40);
    ctx.fillRect(480, 200, 16, 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Ground terrain texture: Dark exposed Antarctic bedrock moraine with wind-blown snow patches
   */
  public static getGroundTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'antarctic_ground';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Dark basalt / schist bedrock base
    ctx.fillStyle = '#1c2430';
    ctx.fillRect(0, 0, 1024, 1024);

    // Moraine rock texture speckles
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = Math.random() * 2 + 0.5;
      const shade = Math.floor(Math.random() * 60 + 35);
      ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 12})`;
      ctx.fillRect(x, y, r, r);
    }

    // Sastrugi wind-sculpted snow drifts (drifting west-to-east streaks)
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const length = Math.random() * 140 + 40;
      const width = Math.random() * 18 + 4;
      const opacity = Math.random() * 0.45 + 0.35;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.25 + (Math.random() - 0.5) * 0.1); // consistent wind direction angle

      const grad = ctx.createLinearGradient(0, -width / 2, length, width / 2);
      grad.addColorStop(0, 'rgba(230, 240, 250, 0)');
      grad.addColorStop(0.3, `rgba(240, 246, 255, ${opacity})`);
      grad.addColorStop(0.7, `rgba(255, 255, 255, ${opacity})`);
      grad.addColorStop(1, 'rgba(220, 235, 250, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(length / 2, 0, length / 2, width / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Solar panel photovoltaic blue grid texture
   */
  public static getSolarTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'solar_pv';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0f244a';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    for (let i = 0; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Yellow & Black warning hazard tape
   */
  public static getHazardTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'hazard_tape';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = '#111827';
    const stripeW = 32;
    for (let x = -64; x < 320; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x, 64);
      ctx.lineTo(x - stripeW, 64);
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Indian Tricolor flag texture with 24-spoke Ashoka Chakra
   */
  public static getFlagTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'tricolor_flag';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    // India Saffron (top band)
    ctx.fillStyle = '#FF9933';
    ctx.fillRect(0, 0, 300, 66.67);

    // White (middle band)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 66.67, 300, 66.67);

    // India Green (bottom band)
    ctx.fillStyle = '#138808';
    ctx.fillRect(0, 133.34, 300, 66.67);

    // Ashoka Chakra (navy blue 24-spoke wheel in center)
    const centerX = 150;
    const centerY = 100;
    const radius = 24;

    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 2.5;

    // Outer circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Central hub
    ctx.fillStyle = '#000080';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 24 spokes
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Fuel Tank identification stencil
   */
  public static getFuelTankTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'fuel_tank_label';
    if (this.cache.has(key)) return this.cache.get(key) as THREE.CanvasTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Brushed polar white-gray metal
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 512, 256);

    // Weld ring bands
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(512, 64);
    ctx.moveTo(0, 192);
    ctx.lineTo(512, 192);
    ctx.stroke();

    // Abstract label bands only: the schematic carries no asserted fuel type or capacity.
    ctx.fillStyle = '#475569';
    ctx.fillRect(40, 96, 230, 8);
    ctx.fillRect(40, 116, 170, 6);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(40, 142, 195, 6);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    this.cache.set(key, texture);
    return texture;
  }
}
