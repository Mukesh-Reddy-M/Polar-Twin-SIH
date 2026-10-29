/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { StationTextureFactory } from './textures';
import { ZoneId, ZoneStatus } from '../../types/station';

export interface StationSceneHierarchy {
  root: THREE.Group;
  zoneGroups: Map<ZoneId, THREE.Group>;
  zoneBBoxes: Map<ZoneId, THREE.Box3>;
  materials: {
    panel: THREE.MeshStandardMaterial;
    accentTrim: THREE.MeshStandardMaterial;
    stiltSteel: THREE.MeshStandardMaterial;
    windowGlow: THREE.MeshStandardMaterial;
    containerOrange: THREE.MeshStandardMaterial;
    containerRed: THREE.MeshStandardMaterial;
    fuelTank: THREE.MeshStandardMaterial;
    solarPv: THREE.MeshStandardMaterial;
    radomeWhite: THREE.MeshStandardMaterial;
    ground: THREE.MeshStandardMaterial;
    hazard: THREE.MeshStandardMaterial;
    zoneIndicator: THREE.MeshBasicMaterial;
  };
  zoneHighlights: Map<ZoneId, THREE.Mesh>;
  colliders: THREE.Mesh[];
  animatables: {
    radarDish?: THREE.Group;
    anemometer?: THREE.Group;
    windVane?: THREE.Group;
    flagMesh?: THREE.Mesh;
    pulseRings?: THREE.Mesh[];
  };
}

export function buildAntarcticStation(
  maxAnisotropy: number = 4,
  isSoftwareGl: boolean = false
): StationSceneHierarchy {
  const root = new THREE.Group();
  root.name = 'AntarcticStationComplex';

  const zoneGroups = new Map<ZoneId, THREE.Group>();
  const zoneBBoxes = new Map<ZoneId, THREE.Box3>();
  const zoneHighlights = new Map<ZoneId, THREE.Mesh>();
  const colliders: THREE.Mesh[] = [];

  // 1. Shared Materials Palette (PolarTwin Dark Navy & Insulated Off-White Theme)
  const panelTexture = StationTextureFactory.getPanelTexture(maxAnisotropy);
  const containerOrangeTex = StationTextureFactory.getContainerTexture('#ea580c', maxAnisotropy);
  const containerRedTex = StationTextureFactory.getContainerTexture('#c2410c', maxAnisotropy);
  const groundTexture = StationTextureFactory.getGroundTexture(maxAnisotropy);
  const solarTexture = StationTextureFactory.getSolarTexture(maxAnisotropy);
  const hazardTexture = StationTextureFactory.getHazardTexture(maxAnisotropy);
  const fuelTankTexture = StationTextureFactory.getFuelTankTexture(maxAnisotropy);
  const flagTexture = StationTextureFactory.getFlagTexture(maxAnisotropy);

  const materials = {
    panel: new THREE.MeshStandardMaterial({
      map: panelTexture,
      roughness: 0.45,
      metalness: 0.15,
      color: 0xedf2f7,
    }),
    accentTrim: new THREE.MeshStandardMaterial({
      color: 0x0ea5e9, // Polar cyan trim band
      roughness: 0.35,
      metalness: 0.4,
    }),
    darkHull: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
    }),
    stiltSteel: new THREE.MeshStandardMaterial({
      color: 0x475569, // Heavy galvanized steel stilts
      roughness: 0.4,
      metalness: 0.75,
    }),
    concreteFooting: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
      metalness: 0.05,
    }),
    windowGlow: new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.9,
    }),
    containerOrange: new THREE.MeshStandardMaterial({
      map: containerOrangeTex,
      roughness: 0.6,
      metalness: 0.25,
    }),
    containerRed: new THREE.MeshStandardMaterial({
      map: containerRedTex,
      roughness: 0.6,
      metalness: 0.25,
    }),
    fuelTank: new THREE.MeshStandardMaterial({
      map: fuelTankTexture,
      roughness: 0.35,
      metalness: 0.55,
    }),
    solarPv: new THREE.MeshStandardMaterial({
      map: solarTexture,
      roughness: 0.2,
      metalness: 0.8,
    }),
    radomeWhite: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.05,
    }),
    ground: new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.88,
      metalness: 0.1,
    }),
    hazard: new THREE.MeshStandardMaterial({
      map: hazardTexture,
      roughness: 0.5,
      metalness: 0.2,
    }),
    zoneIndicator: new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.45,
      wireframe: true,
    }),
  };

  // Helper to create click/hover collider box
  const registerZoneCollider = (group: THREE.Group, zoneId: ZoneId, size: THREE.Vector3, center: THREE.Vector3) => {
    const colliderGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const colliderMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    const collider = new THREE.Mesh(colliderGeo, colliderMat);
    collider.position.copy(center);
    collider.userData = { zoneId, isCollider: true };
    group.add(collider);
    colliders.push(collider);

    // Glowing ground projection bracket
    const bracketGeo = new THREE.RingGeometry(size.x * 0.4, size.x * 0.44, 32);
    bracketGeo.rotateX(-Math.PI / 2);
    const bracketMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.position.set(center.x, 0.06, center.z);
    root.add(bracket);
    zoneHighlights.set(zoneId, bracket);
  };

  // Reusable geometry factories
  const stiltLegGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.8, 12);
  const stiltPadGeo = new THREE.BoxGeometry(0.8, 0.25, 0.8);
  const braceGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8);

  const createStiltColumn = (x: number, z: number, height = 2.8): THREE.Group => {
    const col = new THREE.Group();
    col.position.set(x, 0, z);

    // Rock concrete footing
    const pad = new THREE.Mesh(stiltPadGeo, materials.concreteFooting);
    pad.position.y = 0.125;
    pad.castShadow = !isSoftwareGl;
    pad.receiveShadow = !isSoftwareGl;
    col.add(pad);

    // Tubular steel stilt
    const leg = new THREE.Mesh(stiltLegGeo, materials.stiltSteel);
    leg.position.y = height / 2;
    leg.scale.y = height / 2.8;
    leg.castShadow = !isSoftwareGl;
    leg.receiveShadow = !isSoftwareGl;
    col.add(leg);

    // Hydraulic leveling collar ring
    const collarGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 12);
    const collar = new THREE.Mesh(collarGeo, materials.accentTrim);
    collar.position.y = height * 0.75;
    col.add(collar);

    return col;
  };

  // ==========================================
  // ZONE 1: HABITAT / HEATING COMPLEX (L-SHAPED MODULAR WING)
  // ==========================================
  const habitatGroup = new THREE.Group();
  habitatGroup.name = 'Zone_Habitat';
  habitatGroup.userData = { zoneId: 'habitat' };
  root.add(habitatGroup);
  zoneGroups.set('habitat', habitatGroup);

  // Elevation height of main building underside = 2.6m above ground
  const habFloorY = 2.6;
  const habHeight = 3.6;
  const habCenterY = habFloorY + habHeight / 2;

  // Primary Spine Module (along Z: 28m long, 9m wide)
  const spineLength = 28;
  const spineWidth = 9;
  const spineGeo = new THREE.BoxGeometry(spineWidth, habHeight, spineLength);
  const spineMesh = new THREE.Mesh(spineGeo, materials.panel);
  spineMesh.position.set(0, habCenterY, 0);
  spineMesh.castShadow = !isSoftwareGl;
  spineMesh.receiveShadow = !isSoftwareGl;
  habitatGroup.add(spineMesh);

  // Aerodynamic nose cap (smoothly caps the southern end of the habitat module)
  const noseGeo = new THREE.CylinderGeometry(spineWidth / 2, spineWidth / 2, habHeight, 20, 1, false, 0, Math.PI);
  const noseMesh = new THREE.Mesh(noseGeo, materials.panel);
  noseMesh.position.set(0, habCenterY, spineLength / 2);
  noseMesh.rotation.y = 0; // Aligns the curved front towards +Z
  noseMesh.castShadow = !isSoftwareGl;
  noseMesh.receiveShadow = !isSoftwareGl;
  habitatGroup.add(noseMesh);

  // Secondary Wing (creating the distinct L-shape inspired by reference image)
  // Extending eastward along +X: 16m long, 8m wide
  const wingLength = 16;
  const wingWidth = 8;
  const wingGeo = new THREE.BoxGeometry(wingLength, habHeight, wingWidth);
  const wingMesh = new THREE.Mesh(wingGeo, materials.panel);
  // Attached to northern half of spine
  wingMesh.position.set(spineWidth / 2 + wingLength / 2, habCenterY, -6);
  wingMesh.castShadow = !isSoftwareGl;
  wingMesh.receiveShadow = !isSoftwareGl;
  habitatGroup.add(wingMesh);

  // Cyan & Dark accent trim bands along outer walls
  const trimSpineGeo = new THREE.BoxGeometry(spineWidth + 0.1, 0.4, spineLength + 0.1);
  const trimSpine = new THREE.Mesh(trimSpineGeo, materials.accentTrim);
  trimSpine.position.set(0, habFloorY + habHeight * 0.5, 0);
  habitatGroup.add(trimSpine);

  const trimWingGeo = new THREE.BoxGeometry(wingLength + 0.1, 0.4, wingWidth + 0.1);
  const trimWing = new THREE.Mesh(trimWingGeo, materials.accentTrim);
  trimWing.position.set(spineWidth / 2 + wingLength / 2, habFloorY + habHeight * 0.5, -6);
  habitatGroup.add(trimWing);

  // Ribbon Observation Windows (triple-glazed polar windows with warm interior glow)
  const windowRibbonGeo = new THREE.BoxGeometry(0.15, 0.9, 18);
  const windowLeft = new THREE.Mesh(windowRibbonGeo, materials.windowGlow);
  windowLeft.position.set(-spineWidth / 2 - 0.05, habCenterY + 0.4, 0);
  habitatGroup.add(windowLeft);

  const windowRight = new THREE.Mesh(windowRibbonGeo, materials.windowGlow);
  windowRight.position.set(spineWidth / 2 + 0.05, habCenterY + 0.4, 4);
  habitatGroup.add(windowRight);

  // Wing windows
  const wingWindowGeo = new THREE.BoxGeometry(10, 0.9, 0.15);
  const wingWindow = new THREE.Mesh(wingWindowGeo, materials.windowGlow);
  wingWindow.position.set(spineWidth / 2 + wingLength / 2, habCenterY + 0.4, -6 - wingWidth / 2 - 0.05);
  habitatGroup.add(wingWindow);

  // Elevated Stilt Columns & Cross-Trusses underneath Habitat
  // Stilt grid under spine: 2 columns wide (X = ±3.6), 5 pairs along Z (-11, -5.5, 0, 5.5, 11)
  const zOffsets = [-11, -5.5, 0, 5.5, 11];
  zOffsets.forEach((z) => {
    habitatGroup.add(createStiltColumn(-3.6, z, habFloorY));
    habitatGroup.add(createStiltColumn(3.6, z, habFloorY));

    // Diagonal X-bracing truss between columns
    const brace1 = new THREE.Mesh(braceGeo, materials.stiltSteel);
    brace1.position.set(0, habFloorY / 2, z);
    brace1.rotation.z = Math.atan2(habFloorY, 7.2);
    habitatGroup.add(brace1);

    const brace2 = new THREE.Mesh(braceGeo, materials.stiltSteel);
    brace2.position.set(0, habFloorY / 2, z);
    brace2.rotation.z = -Math.atan2(habFloorY, 7.2);
    habitatGroup.add(brace2);
  });

  // Stilt columns under L-wing: X offsets (8, 13, 18), Z offsets (-3, -9)
  [8, 13, 18].forEach((x) => {
    habitatGroup.add(createStiltColumn(x, -3, habFloorY));
    habitatGroup.add(createStiltColumn(x, -9, habFloorY));
  });

  // Access Stairs & Gangway Walkway (from ground level to airlock entrance)
  const stairGroup = new THREE.Group();
  stairGroup.position.set(-spineWidth / 2 - 1.8, 0, 8);
  const gangwayGeo = new THREE.BoxGeometry(3.6, 0.2, 2.2);
  const gangwayPlatform = new THREE.Mesh(gangwayGeo, materials.stiltSteel);
  gangwayPlatform.position.set(0, habFloorY, 0);
  stairGroup.add(gangwayPlatform);

  // Sloped flight of industrial stairs
  const flightLength = Math.sqrt(habFloorY * habFloorY + 4 * 4);
  const stairFlightGeo = new THREE.BoxGeometry(1.4, 0.15, flightLength);
  const stairFlight = new THREE.Mesh(stairFlightGeo, materials.stiltSteel);
  stairFlight.position.set(-0.8, habFloorY / 2, 2);
  stairFlight.rotation.x = Math.atan2(habFloorY, 4);
  stairGroup.add(stairFlight);

  // Safety handrails (yellow)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 });
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, flightLength, 6);
  const rail = new THREE.Mesh(railGeo, railMat);
  rail.position.set(-1.5, habFloorY / 2 + 0.8, 2);
  rail.rotation.x = Math.atan2(habFloorY, 4);
  stairGroup.add(rail);

  habitatGroup.add(stairGroup);

  // Rooftop HVAC units, air intake hoods, and thermal heat recovery plenums
  const hvacGeo = new THREE.BoxGeometry(2.4, 1.2, 3.2);
  const hvac1 = new THREE.Mesh(hvacGeo, materials.darkHull);
  hvac1.position.set(-1.8, habFloorY + habHeight + 0.6, -4);
  habitatGroup.add(hvac1);

  const hvac2 = new THREE.Mesh(hvacGeo, materials.darkHull);
  hvac2.position.set(1.8, habFloorY + habHeight + 0.6, 2);
  habitatGroup.add(hvac2);

  // Rooftop Solar PV panels (tilted 30° toward north for low polar sun)
  const solarFrameGeo = new THREE.BoxGeometry(5.2, 0.1, 2.6);
  for (let i = 0; i < 3; i++) {
    const solarPanel = new THREE.Mesh(solarFrameGeo, materials.solarPv);
    solarPanel.position.set(0, habFloorY + habHeight + 0.5, -9 + i * 3.4);
    solarPanel.rotation.x = -0.45; // Polar sun tilt
    solarPanel.castShadow = !isSoftwareGl;
    habitatGroup.add(solarPanel);
  }

  // Register Habitat Collider
  registerZoneCollider(
    habitatGroup,
    'habitat',
    new THREE.Vector3(spineWidth + wingLength + 2, habHeight + 3, spineLength + 4),
    new THREE.Vector3(4, habCenterY, 0)
  );

  // ==========================================
  // ZONE 2: COMMUNICATIONS ZONE (RADOME, DISH & COMMS MAST)
  // ==========================================
  const commsGroup = new THREE.Group();
  commsGroup.name = 'Zone_Communications';
  commsGroup.userData = { zoneId: 'communications' };
  root.add(commsGroup);
  zoneGroups.set('communications', commsGroup);

  // Platform on the rooftop of habitat spine (south end)
  const commsPlatformGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.3, 16);
  const commsPlatform = new THREE.Mesh(commsPlatformGeo, materials.stiltSteel);
  commsPlatform.position.set(0, habFloorY + habHeight + 0.15, 9);
  commsGroup.add(commsPlatform);

  // Large Geodesic Satellite Radome (White sphere with low-poly facets)
  const radomeGeo = new THREE.IcosahedronGeometry(2.2, 2);
  const radome = new THREE.Mesh(radomeGeo, materials.radomeWhite);
  radome.position.set(0, habFloorY + habHeight + 2.3, 9);
  radome.castShadow = !isSoftwareGl;
  commsGroup.add(radome);

  // Parabolic Ku-Band Steerable Satellite Dish
  const dishGroup = new THREE.Group();
  dishGroup.position.set(-2.5, habFloorY + habHeight + 1.2, 6);
  const dishGeo = new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 3);
  const dish = new THREE.Mesh(dishGeo, materials.radomeWhite);
  dish.rotation.x = 1.2;
  dishGroup.add(dish);

  // Dish feed horn
  const feedHornGeo = new THREE.CylinderGeometry(0.04, 0.08, 0.8, 8);
  const feedHorn = new THREE.Mesh(feedHornGeo, materials.stiltSteel);
  feedHorn.position.set(0, 0.5, 0.4);
  feedHorn.rotation.x = 1.2;
  dishGroup.add(feedHorn);
  commsGroup.add(dishGroup);

  // Lattice Communications Tower & Meteorology Array
  const towerHeight = 9.5;
  const mastGeo = new THREE.CylinderGeometry(0.12, 0.28, towerHeight, 8);
  const mast = new THREE.Mesh(mastGeo, materials.stiltSteel);
  mast.position.set(2.8, habFloorY + habHeight + towerHeight / 2, 8);
  commsGroup.add(mast);

  // Anemometer (3-cup wind sensor)
  const anemometerGroup = new THREE.Group();
  anemometerGroup.position.set(2.8, habFloorY + habHeight + towerHeight + 0.4, 8);
  const cupArmGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6);
  for (let c = 0; c < 3; c++) {
    const arm = new THREE.Mesh(cupArmGeo, materials.stiltSteel);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = (c * Math.PI * 2) / 3;
    const cupGeo = new THREE.SphereGeometry(0.12, 8, 8, 0, Math.PI);
    const cup = new THREE.Mesh(cupGeo, materials.stiltSteel);
    cup.position.x = 0.4;
    arm.add(cup);
    anemometerGroup.add(arm);
  }
  commsGroup.add(anemometerGroup);

  registerZoneCollider(
    commsGroup,
    'communications',
    new THREE.Vector3(8, 12, 8),
    new THREE.Vector3(0, habFloorY + habHeight + 4, 8)
  );

  // ==========================================
  // ZONE 3: POWER / GENERATOR UTILITY AREA
  // ==========================================
  const powerGroup = new THREE.Group();
  powerGroup.name = 'Zone_Power';
  powerGroup.userData = { zoneId: 'power' };
  root.add(powerGroup);
  zoneGroups.set('power', powerGroup);

  // Located on west flank: X = -14, Z = -2
  const powerBaseX = -15;
  const powerBaseZ = -3;
  const powerElevation = 1.8;

  // Heavy steel equipment deck on stilts
  const powerDeckGeo = new THREE.BoxGeometry(11, 0.4, 9);
  const powerDeck = new THREE.Mesh(powerDeckGeo, materials.stiltSteel);
  powerDeck.position.set(powerBaseX, powerElevation, powerBaseZ);
  powerDeck.castShadow = !isSoftwareGl;
  powerGroup.add(powerDeck);

  // 6 heavy stilts beneath power deck
  [-4.5, 0, 4.5].forEach((dx) => {
    [-3.5, 3.5].forEach((dz) => {
      powerGroup.add(createStiltColumn(powerBaseX + dx, powerBaseZ + dz, powerElevation));
    });
  });

  // Cogeneration Diesel Gen-Set Modular Enclosures (Unit #1 & Unit #2)
  const genBoxGeo = new THREE.BoxGeometry(3.6, 2.6, 6.2);
  const gen1 = new THREE.Mesh(genBoxGeo, materials.darkHull);
  gen1.position.set(powerBaseX - 2.4, powerElevation + 1.5, powerBaseZ);
  gen1.castShadow = !isSoftwareGl;
  powerGroup.add(gen1);

  const gen2 = new THREE.Mesh(genBoxGeo, materials.darkHull);
  gen2.position.set(powerBaseX + 2.4, powerElevation + 1.5, powerBaseZ);
  gen2.castShadow = !isSoftwareGl;
  powerGroup.add(gen2);

  // Acoustic radiator louvers & cooling fans
  const fanVentGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
  fanVentGeo.rotateZ(Math.PI / 2);
  const fanVent1 = new THREE.Mesh(fanVentGeo, materials.stiltSteel);
  fanVent1.position.set(powerBaseX - 2.4, powerElevation + 2.2, powerBaseZ - 3.15);
  powerGroup.add(fanVent1);

  const fanVent2 = new THREE.Mesh(fanVentGeo, materials.stiltSteel);
  fanVent2.position.set(powerBaseX + 2.4, powerElevation + 2.2, powerBaseZ - 3.15);
  powerGroup.add(fanVent2);

  // Tall vertical insulated exhaust chimneys with spark arrestors
  const stackHeight = 5.2;
  const stackGeo = new THREE.CylinderGeometry(0.2, 0.2, stackHeight, 12);
  const stack1 = new THREE.Mesh(stackGeo, materials.stiltSteel);
  stack1.position.set(powerBaseX - 2.4, powerElevation + 2.8 + stackHeight / 2, powerBaseZ + 2.2);
  powerGroup.add(stack1);

  const stack2 = new THREE.Mesh(stackGeo, materials.stiltSteel);
  stack2.position.set(powerBaseX + 2.4, powerElevation + 2.8 + stackHeight / 2, powerBaseZ + 2.2);
  powerGroup.add(stack2);

  // Electrical Step-up Transformer Station & High-Voltage Cage
  const transformerGeo = new THREE.BoxGeometry(2.2, 1.8, 2.2);
  const transformer = new THREE.Mesh(transformerGeo, materials.darkHull);
  transformer.position.set(powerBaseX, powerElevation + 1.1, powerBaseZ + 3.2);
  powerGroup.add(transformer);

  // Cooling radiator fins on transformer
  for (let f = -0.8; f <= 0.8; f += 0.25) {
    const finGeo = new THREE.BoxGeometry(0.04, 1.4, 2.4);
    const fin = new THREE.Mesh(finGeo, materials.stiltSteel);
    fin.position.set(powerBaseX + f, powerElevation + 1.1, powerBaseZ + 3.2);
    powerGroup.add(fin);
  }

  // Insulated thermal heat-recovery pipeline running from power plant into main habitat
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(powerBaseX + 4.5, powerElevation + 1.2, powerBaseZ),
    new THREE.Vector3(-9.5, 2.2, -1.5),
    new THREE.Vector3(-spineWidth / 2, 2.4, 0),
  ]);
  const pipeGeo = new THREE.TubeGeometry(pipeCurve, 20, 0.22, 8, false);
  const heatPipe = new THREE.Mesh(pipeGeo, materials.accentTrim);
  powerGroup.add(heatPipe);

  registerZoneCollider(
    powerGroup,
    'power',
    new THREE.Vector3(13, 10, 11),
    new THREE.Vector3(powerBaseX, powerElevation + 3, powerBaseZ)
  );

  // ==========================================
  // ZONE 4: FUEL STORAGE AREA
  // ==========================================
  const fuelGroup = new THREE.Group();
  fuelGroup.name = 'Zone_Fuel';
  fuelGroup.userData = { zoneId: 'fuel' };
  root.add(fuelGroup);
  zoneGroups.set('fuel', fuelGroup);

  // Positioned southwest: X = -17, Z = 12
  const fuelBaseX = -17;
  const fuelBaseZ = 12;

  // Secondary containment bund (safety berm to contain any polar spill)
  const bundWidth = 14;
  const bundLength = 11;
  const bundWallH = 0.8;
  const bundWallThick = 0.5;

  const bundMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.9,
    metalness: 0.1,
  });

  // Bund concrete pad floor
  const bundFloorGeo = new THREE.BoxGeometry(bundWidth, 0.2, bundLength);
  const bundFloor = new THREE.Mesh(bundFloorGeo, materials.concreteFooting);
  bundFloor.position.set(fuelBaseX, 0.1, fuelBaseZ);
  fuelGroup.add(bundFloor);

  // Bund perimeter walls
  const wallNGeo = new THREE.BoxGeometry(bundWidth, bundWallH, bundWallThick);
  const wallN = new THREE.Mesh(wallNGeo, bundMat);
  wallN.position.set(fuelBaseX, bundWallH / 2, fuelBaseZ - bundLength / 2);
  fuelGroup.add(wallN);

  const wallS = new THREE.Mesh(wallNGeo, bundMat);
  wallS.position.set(fuelBaseX, bundWallH / 2, fuelBaseZ + bundLength / 2);
  fuelGroup.add(wallS);

  const wallWGeo = new THREE.BoxGeometry(bundWallThick, bundWallH, bundLength);
  const wallW = new THREE.Mesh(wallWGeo, bundMat);
  wallW.position.set(fuelBaseX - bundWidth / 2, bundWallH / 2, fuelBaseZ);
  fuelGroup.add(wallW);

  const wallE = new THREE.Mesh(wallWGeo, bundMat);
  wallE.position.set(fuelBaseX + bundWidth / 2, bundWallH / 2, fuelBaseZ);
  fuelGroup.add(wallE);

  // Four large horizontal polar fuel tanks (cylindrical with dished heads)
  const tankRadius = 1.35;
  const tankLength = 6.8;
  const tankCylinderGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankLength, 20);
  tankCylinderGeo.rotateZ(Math.PI / 2);

  const tankDomeGeo = new THREE.SphereGeometry(tankRadius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  tankDomeGeo.rotateZ(Math.PI / 2);

  const tankSpacingZ = 3.2;
  const tankXOffsets = [-2.8, 2.8];

  [-1, 1].forEach((dirZ, rowIdx) => {
    tankXOffsets.forEach((offsetX, colIdx) => {
      const tankObj = new THREE.Group();
      const tankZ = fuelBaseZ + (rowIdx - 0.5) * tankSpacingZ;
      const tankX = fuelBaseX + offsetX;
      tankObj.position.set(tankX, bundWallH + tankRadius * 0.9, tankZ);

      // Main cylinder body
      const cylinder = new THREE.Mesh(tankCylinderGeo, materials.fuelTank);
      cylinder.castShadow = !isSoftwareGl;
      cylinder.receiveShadow = !isSoftwareGl;
      tankObj.add(cylinder);

      // Dished end caps
      const endCap1 = new THREE.Mesh(tankDomeGeo, materials.fuelTank);
      endCap1.position.x = tankLength / 2;
      tankObj.add(endCap1);

      const endCap2 = new THREE.Mesh(tankDomeGeo, materials.fuelTank);
      endCap2.position.x = -tankLength / 2;
      endCap2.rotation.y = Math.PI;
      tankObj.add(endCap2);

      // Cradle saddle supports
      const saddleGeo = new THREE.BoxGeometry(0.4, 0.6, tankRadius * 2.2);
      const saddle1 = new THREE.Mesh(saddleGeo, materials.darkHull);
      saddle1.position.set(-tankLength * 0.3, -tankRadius * 0.7, 0);
      tankObj.add(saddle1);

      const saddle2 = new THREE.Mesh(saddleGeo, materials.darkHull);
      saddle2.position.set(tankLength * 0.3, -tankRadius * 0.7, 0);
      tankObj.add(saddle2);

      fuelGroup.add(tankObj);
    });
  });

  // Fuel pumping skid & manifold valves
  const pumpSkidGeo = new THREE.BoxGeometry(2.4, 1.4, 3.2);
  const pumpSkid = new THREE.Mesh(pumpSkidGeo, materials.accentTrim);
  pumpSkid.position.set(fuelBaseX + bundWidth / 2 + 1.8, 0.7, fuelBaseZ);
  fuelGroup.add(pumpSkid);

  // Insulated pipeline on stanchions running from fuel farm to power station
  const fuelLineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(fuelBaseX, 1.2, fuelBaseZ - bundLength / 2),
    new THREE.Vector3(fuelBaseX + 1.0, 1.2, (fuelBaseZ + powerBaseZ) / 2),
    new THREE.Vector3(powerBaseX, 1.2, powerBaseZ + 4.5),
  ]);
  const fuelLineGeo = new THREE.TubeGeometry(fuelLineCurve, 16, 0.14, 8, false);
  const fuelLine = new THREE.Mesh(fuelLineGeo, materials.hazard);
  fuelGroup.add(fuelLine);

  registerZoneCollider(
    fuelGroup,
    'fuel',
    new THREE.Vector3(bundWidth + 4, 6, bundLength + 4),
    new THREE.Vector3(fuelBaseX, 2, fuelBaseZ)
  );

  // ==========================================
  // ZONE 5: LOGISTICS / CARGO APRON (ORANGE-RED SHIPPING CONTAINERS)
  // ==========================================
  const logisticsGroup = new THREE.Group();
  logisticsGroup.name = 'Zone_Logistics';
  logisticsGroup.userData = { zoneId: 'logistics' };
  root.add(logisticsGroup);
  zoneGroups.set('logistics', logisticsGroup);

  // Located on east & northeast staging grounds: X = 12 to 24, Z = 4 to 18
  const container20Geo = new THREE.BoxGeometry(2.6, 2.6, 6.0); // Standard 20ft container (approx scale)
  const container40Geo = new THREE.BoxGeometry(2.6, 2.6, 12.0); // 40ft high cube container

  // Container placement data (position, rotation Y, color, stacked)
  const containerLayout = [
    { x: 12, z: 8, rot: 0, is40: true, isRed: false },
    { x: 15.2, z: 8, rot: 0, is40: true, isRed: true },
    { x: 12, z: 8, rot: 0, is40: true, isRed: false, stack: 1 }, // Stacked 2-high!
    { x: 19, z: 6, rot: 0.35, is40: false, isRed: false },
    { x: 22, z: 7.2, rot: 0.35, is40: false, isRed: true },
    { x: 10, z: 17, rot: Math.PI / 2, is40: true, isRed: false },
    { x: 10, z: 20.2, rot: Math.PI / 2, is40: true, isRed: true },
    { x: 18, z: 15, rot: 0.1, is40: false, isRed: false },
    { x: 21.2, z: 15.5, rot: 0.1, is40: false, isRed: true },
    { x: 18, z: 15, rot: 0.1, is40: false, isRed: true, stack: 1 }, // Stacked
  ];

  containerLayout.forEach((c) => {
    const geo = c.is40 ? container40Geo : container20Geo;
    const mat = c.isRed ? materials.containerRed : materials.containerOrange;
    const mesh = new THREE.Mesh(geo, mat);

    const elevation = c.stack ? 2.6 * c.stack + 1.3 : 1.3;
    mesh.position.set(c.x, elevation, c.z);
    mesh.rotation.y = c.rot;
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = !isSoftwareGl;
    logisticsGroup.add(mesh);

    // Hardened timber dunnage blocks under containers
    if (!c.stack) {
      const blockGeo = new THREE.BoxGeometry(2.8, 0.2, 0.4);
      const block1 = new THREE.Mesh(blockGeo, materials.concreteFooting);
      block1.position.set(c.x, 0.1, c.z - (c.is40 ? 4.5 : 2.2));
      block1.rotation.y = c.rot;
      logisticsGroup.add(block1);

      const block2 = new THREE.Mesh(blockGeo, materials.concreteFooting);
      block2.position.set(c.x, 0.1, c.z + (c.is40 ? 4.5 : 2.2));
      block2.rotation.y = c.rot;
      logisticsGroup.add(block2);
    }
  });

  // Polar Tracked Vehicle (PistenBully / Snowcat schematic model)
  const snowcat = new THREE.Group();
  snowcat.position.set(16, 0, -2);
  snowcat.rotation.y = -0.5;

  // Rubber tracks (black)
  const trackGeo = new THREE.BoxGeometry(0.8, 0.7, 4.2);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });
  const leftTrack = new THREE.Mesh(trackGeo, trackMat);
  leftTrack.position.set(-1.1, 0.35, 0);
  snowcat.add(leftTrack);

  const rightTrack = new THREE.Mesh(trackGeo, trackMat);
  rightTrack.position.set(1.1, 0.35, 0);
  snowcat.add(rightTrack);

  // Red polar cabin chassis
  const cabinGeo = new THREE.BoxGeometry(2.4, 1.4, 3.2);
  const redChassisMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  const cabin = new THREE.Mesh(cabinGeo, redChassisMat);
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = !isSoftwareGl;
  snowcat.add(cabin);

  // Tinted windshield
  const windShieldGeo = new THREE.BoxGeometry(2.0, 0.7, 0.1);
  const windshield = new THREE.Mesh(windShieldGeo, materials.windowGlow);
  windshield.position.set(0, 1.5, 1.4);
  snowcat.add(windshield);

  // Snow pusher front blade
  const bladeGeo = new THREE.BoxGeometry(3.2, 0.6, 0.15);
  const blade = new THREE.Mesh(bladeGeo, materials.stiltSteel);
  blade.position.set(0, 0.4, 2.5);
  snowcat.add(blade);

  logisticsGroup.add(snowcat);

  registerZoneCollider(
    logisticsGroup,
    'logistics',
    new THREE.Vector3(18, 8, 22),
    new THREE.Vector3(16, 3, 11)
  );

  // ==========================================
  // INDIAN TRICOLOR STATION MARKER FLAG
  // ==========================================
  // Situated on a natural rock plinth beside the main entrance gangway stairs
  const flagGroup = new THREE.Group();
  flagGroup.position.set(-spineWidth / 2 - 3.8, 0, 7.5);

  // Raised stone cairn plinth
  const cairnGeo = new THREE.CylinderGeometry(0.7, 0.9, 0.6, 8);
  const cairn = new THREE.Mesh(cairnGeo, materials.concreteFooting);
  cairn.position.y = 0.3;
  flagGroup.add(cairn);

  // Stainless steel flagpole mast
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.06, 5.2, 8);
  const pole = new THREE.Mesh(poleGeo, materials.stiltSteel);
  pole.position.y = 0.6 + 2.6;
  flagGroup.add(pole);

  // Gold finial sphere atop pole
  const finialGeo = new THREE.SphereGeometry(0.09, 8, 8);
  const finialMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
  const finial = new THREE.Mesh(finialGeo, finialMat);
  finial.position.y = 0.6 + 5.2;
  flagGroup.add(finial);

  // Waving Tricolor flag cloth
  const flagGeo = new THREE.PlaneGeometry(1.5, 1.0, 12, 8);
  flagGeo.translate(0.75, 0, 0); // Pivot at hoist edge
  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTexture,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.set(0, 0.6 + 4.5, 0);
  flagMesh.rotation.y = -0.3; // Fluttering with wind direction
  flagGroup.add(flagMesh);

  root.add(flagGroup);

  // ==========================================
  // ANTARCTIC GROUND & SURROUNDING MORAINE TERRAIN
  // ==========================================
  const groundSize = 160;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 48, 48);
  groundGeo.rotateX(-Math.PI / 2);

  // Modulate vertices for subtle natural undulations & rocky ridges
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    // Keep the station center flat for supports, undulate outward
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter > 25) {
      const noise =
        Math.sin(x * 0.04) * Math.cos(z * 0.04) * 2.2 +
        Math.sin(x * 0.1 + z * 0.08) * 0.8;
      posAttr.setY(i, noise);
    } else {
      // Gentle slope near station
      posAttr.setY(i, (Math.random() - 0.5) * 0.08);
    }
  }
  groundGeo.computeVertexNormals();

  const groundMesh = new THREE.Mesh(groundGeo, materials.ground);
  groundMesh.position.y = 0;
  groundMesh.receiveShadow = !isSoftwareGl;
  root.add(groundMesh);

  // Moraine boulders and rocks scattered naturally around footings
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 1);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x273142, roughness: 0.95 });
  const rockCount = isSoftwareGl ? 25 : 60;
  for (let r = 0; r < rockCount; r++) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * 32 + 8;
    const rx = Math.cos(angle) * rad;
    const rz = Math.sin(angle) * rad;
    const scale = Math.random() * 1.4 + 0.4;
    rock.scale.set(scale, scale * 0.6, scale);
    rock.position.set(rx, scale * 0.25, rz);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    rock.receiveShadow = !isSoftwareGl;
    root.add(rock);
  }

  // Restrained distant nunatak mountain ridges (low jagged peaks on horizon)
  const ridgeGroup = new THREE.Group();
  ridgeGroup.position.set(0, 0, -85);
  for (let p = -5; p <= 5; p++) {
    const peakH = 12 + Math.abs(p) * 2.5 + Math.random() * 4;
    const peakGeo = new THREE.ConeGeometry(14 + Math.random() * 6, peakH, 5);
    const peakMat = new THREE.MeshStandardMaterial({
      color: 0x182234, // Dark atmospheric silhouette
      roughness: 0.9,
    });
    const peak = new THREE.Mesh(peakGeo, peakMat);
    peak.position.set(p * 18 + (Math.random() - 0.5) * 6, peakH / 2 - 2, (Math.random() - 0.5) * 12);
    peak.rotation.y = Math.random() * Math.PI;
    ridgeGroup.add(peak);
  }
  root.add(ridgeGroup);

  // Compute bounding boxes for each zone
  zoneGroups.forEach((group, id) => {
    const bbox = new THREE.Box3().setFromObject(group);
    zoneBBoxes.set(id, bbox);
  });

  return {
    root,
    zoneGroups,
    zoneBBoxes,
    materials,
    zoneHighlights,
    colliders,
    animatables: {
      radarDish: dishGroup,
      anemometer: anemometerGroup,
      flagMesh,
    },
  };
}

/**
 * Updates 3D highlights based on selected zone and status
 */
export function applyZoneHighlightState(
  sceneHierarchy: StationSceneHierarchy,
  selectedZoneId: ZoneId | null,
  hoveredZoneId: ZoneId | null,
  zoneStatuses: Map<ZoneId, ZoneStatus>
) {
  const statusColors: Record<ZoneStatus, number> = {
    normal: 0x06b6d4, // Cyan/Teal
    warning: 0xf59e0b, // Amber
    critical: 0xef4444, // Red
    unknown: 0x64748b, // Neutral slate when the API has no zone-specific reading
  };
  const idleOpacity: Record<ZoneStatus, number> = {
    normal: 0.16,
    warning: 0.28,
    critical: 0.38,
    unknown: 0.12,
  };

  sceneHierarchy.zoneHighlights.forEach((ring, zoneId) => {
    const isSelected = selectedZoneId === zoneId;
    const isHovered = hoveredZoneId === zoneId;
    const status = zoneStatuses.get(zoneId) || 'normal';
    const colorHex = statusColors[status];

    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.color.setHex(colorHex);

    if (isSelected) {
      mat.opacity = 0.85;
      ring.scale.set(1.15, 1.15, 1.15);
    } else if (isHovered) {
      mat.opacity = 0.45;
      ring.scale.set(1.05, 1.05, 1.05);
    } else {
      mat.opacity = idleOpacity[status];
      ring.scale.set(1, 1, 1);
    }
  });

  // Emissive accent tint on the primary zone models
  sceneHierarchy.zoneGroups.forEach((group, zoneId) => {
    const isSelected = selectedZoneId === zoneId;
    const isHovered = hoveredZoneId === zoneId;
    const status = zoneStatuses.get(zoneId) || 'normal';
    const colorHex = statusColors[status];

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // Only modulate non-ground, non-window materials
        if (
          child.material !== sceneHierarchy.materials.ground &&
          child.material !== sceneHierarchy.materials.windowGlow
        ) {
          if (isSelected) {
            child.material.emissive.setHex(colorHex);
            child.material.emissiveIntensity = 0.22;
          } else if (isHovered) {
            child.material.emissive.setHex(colorHex);
            child.material.emissiveIntensity = 0.1;
          } else {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }
      }
    });
  });
}
