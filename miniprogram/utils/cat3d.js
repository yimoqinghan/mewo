// Three.js cat renderer for the home hero.
// The adapter bundles Three.js 0.108.0 for the WeChat mini-program WebGL canvas.
// The runtime prefers the Blender GLB rig; independently named procedural parts
// remain only as a compatibility fallback for environments that cannot parse GLB.
const { createScopedThreejs } = require('../libs/threejs-miniprogram');
const installGLTFLoader = require('../libs/gltf-loader');
const adapter = require('./adapter');
const { asset, baseUrl: assetBaseUrl } = require('./assets');

function makeCat3D(canvas, options) {
  const THREE = createScopedThreejs(canvas);
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(() => callback(Date.now()), 16);
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
  const config = options || {};
  const width = Number(config.width) || canvas.width || 375;
  const height = Number(config.height) || canvas.height || 650;
  const pixelRatio = Math.min(adapter.getSystemInfoSync().pixelRatio || 1, 2);
  const lerp = (from, to, amount) => from + (to - from) * amount;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const GLTFLoader = installGLTFLoader(THREE);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 100);
  camera.position.set(0, 1.42, 7.9);
  camera.lookAt(0, 1.18, 0);

  scene.add(new THREE.HemisphereLight(0xfff8ff, 0x8db8e6, 2.25));
  const keyLight = new THREE.DirectionalLight(0xfff6e7, 3.3);
  keyLight.position.set(-3.2, 6.2, 5.4);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xb9ddff, 1.55);
  fillLight.position.set(4, 3.6, -3.5);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffb6dc, 1.25);
  rimLight.position.set(-4, 2.4, -4.5);
  scene.add(rimLight);

  const materials = {
    fur: new THREE.MeshStandardMaterial({ color: 0x2b2430, roughness: 0.88, metalness: 0.02 }),
    furDark: new THREE.MeshStandardMaterial({ color: 0x17121e, roughness: 0.86 }),
    furEdge: new THREE.MeshStandardMaterial({ color: 0x514354, roughness: 0.92 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd22f, roughness: 0.3, metalness: 0.04 }),
    yellowLight: new THREE.MeshStandardMaterial({ color: 0xffe56a, roughness: 0.36 }),
    pink: new THREE.MeshStandardMaterial({ color: 0xff86ad, roughness: 0.58 }),
    pinkLight: new THREE.MeshStandardMaterial({ color: 0xffb8cc, roughness: 0.66 }),
    white: new THREE.MeshStandardMaterial({ color: 0xfffaf8, roughness: 0.92 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x201a27, roughness: 0.16, metalness: 0.12 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x392e4e, roughness: 0.18, metalness: 0.28, transparent: true, opacity: 0.92 }),
    bag: new THREE.MeshStandardMaterial({ color: 0xffd23b, roughness: 0.48 }),
    bagDark: new THREE.MeshStandardMaterial({ color: 0xf1ab19, roughness: 0.5 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x694c86, transparent: true, opacity: 0.18 })
  };

  const root = new THREE.Group();
  root.name = 'cat_root';
  root.position.y = 0.24;
  root.scale.set(0.9, 0.9, 0.9);
  root.rotation.y = -0.08;
  scene.add(root);

  // The Blender GLBs are the preferred heroes. Keep one independently loaded
  // rig for each approved home/touch/menu state and retain procedural geometry
  // only as a runtime fallback for older WeChat environments.
  const glbRoots = {};
  ['home', 'touch', 'menu'].forEach((variant) => {
    const modelRoot = new THREE.Group();
    modelRoot.name = `cat_glb_${variant}`;
    modelRoot.rotation.x = 0;
    modelRoot.rotation.y = 0;
    modelRoot.scale.set(0.58, 0.58, 0.58);
    modelRoot.position.y = -0.02;
    modelRoot.visible = false;
    root.add(modelRoot);
    glbRoots[variant] = modelRoot;
  });
  const glbRoot = glbRoots.home;

  function ell(parent, name, material, x, y, z, sx, sy, sz, segments) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments || 28, 20), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function box(parent, name, material, x, y, z, sx, sy, sz, rotationZ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 3, 3, 2), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotationZ || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent, name, material, x, y, z, radius, depth, rotationX, rotationZ) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotationX || 0;
    mesh.rotation.z = rotationZ || 0;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // A soft translucent floor shadow is kept separate from the body for future scene replacement.
  const floorShadow = new THREE.Mesh(new THREE.CircleGeometry(1.12, 40), materials.shadow);
  floorShadow.name = 'cat_floor_shadow';
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.set(0, 0.015, 0.02);
  floorShadow.scale.set(1.25, 0.42, 1);
  root.add(floorShadow);

  const body = ell(root, 'body_mesh', materials.fur, 0, 0.86, 0, 0.82, 0.95, 0.64);
  body.scale.y = 1.02;
  ell(root, 'chest_patch', materials.white, 0, 0.77, 0.49, 0.37, 0.61, 0.19);
  ell(root, 'chest_shadow', materials.pinkLight, 0, 0.57, 0.54, 0.2, 0.22, 0.08);

  const headJoint = new THREE.Group();
  headJoint.name = 'head_joint';
  headJoint.position.set(0, 1.83, 0.02);
  root.add(headJoint);
  ell(headJoint, 'head_mesh', materials.fur, 0, 0.03, 0.12, 1.04, 0.86, 0.78);

  function makeEar(sign) {
    const ear = new THREE.Group();
    ear.name = sign < 0 ? 'ear_left' : 'ear_right';
    ear.position.set(sign * 0.68, 0.57, 0.05);
    headJoint.add(ear);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.84, 4), materials.furDark);
    outer.name = 'ear_outer';
    outer.position.y = 0.3;
    outer.rotation.z = sign * -0.12;
    outer.castShadow = true;
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.55, 4), materials.pink);
    inner.name = 'ear_inner';
    inner.position.set(0, 0.29, 0.09);
    inner.rotation.z = sign * -0.12;
    ear.add(inner);
    return ear;
  }
  const ears = [makeEar(-1), makeEar(1)];

  const eyes = [];
  [-1, 1].forEach((sign) => {
    const eye = new THREE.Group();
    eye.name = sign < 0 ? 'eye_left' : 'eye_right';
    eye.position.set(sign * 0.43, 1.89, 0.78);
    // Eye group lives at world-like coordinates so it follows the head through the parent.
    eye.position.y = 0.06;
    headJoint.add(eye);
    ell(eye, 'sclera', materials.yellow, 0, 0, 0, 0.31, 0.34, 0.12);
    ell(eye, 'pupil', materials.eye, sign * 0.018, -0.015, 0.12, 0.115, 0.22, 0.06);
    ell(eye, 'glint', materials.white, -0.065, 0.1, 0.18, 0.048, 0.056, 0.02);
    const lid = ell(eye, 'eyelid', materials.furDark, 0, 0.36, 0.09, 0.34, 0.01, 0.14);
    eyes.push({ group: eye, lid });
  });

  ell(headJoint, 'muzzle_left', materials.furEdge, -0.17, -0.38, 0.76, 0.28, 0.25, 0.18);
  ell(headJoint, 'muzzle_right', materials.furEdge, 0.17, -0.38, 0.76, 0.28, 0.25, 0.18);
  ell(headJoint, 'nose', materials.pink, 0, -0.25, 0.94, 0.105, 0.07, 0.055);
  const mouth = ell(headJoint, 'mouth', materials.furDark, 0, -0.52, 0.91, 0.14, 0.06, 0.04);
  ell(headJoint, 'mouth_glow', materials.pink, 0, -0.56, 0.92, 0.08, 0.035, 0.025);

  // Sunglasses are separate rings, bridge and lenses, making the hero match the supplied cat reference.
  const glasses = new THREE.Group();
  glasses.name = 'sunglasses';
  glasses.position.set(0, 0.34, 0.7);
  headJoint.add(glasses);
  [-1, 1].forEach((sign) => {
    const frame = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.31, 32), materials.yellow);
    frame.name = sign < 0 ? 'glasses_frame_left' : 'glasses_frame_right';
    frame.position.x = sign * 0.34;
    frame.scale.y = 0.78;
    frame.castShadow = true;
    glasses.add(frame);
    const lens = ell(glasses, sign < 0 ? 'glasses_lens_left' : 'glasses_lens_right', materials.lens, sign * 0.34, 0, 0.015, 0.25, 0.18, 0.028);
    lens.rotation.z = sign * -0.05;
  });
  box(glasses, 'glasses_bridge', materials.yellow, 0, 0.01, 0.02, 0.18, 0.07, 0.08, 0);

  // Pink headphones sit behind the cheeks.
  const headphones = new THREE.Group();
  headphones.name = 'pink_headphones';
  headJoint.add(headphones);
  box(headphones, 'headphone_band', materials.pink, 0, 0.47, 0.02, 1.18, 0.08, 0.08, 0);
  [-1, 1].forEach((sign) => {
    cylinder(headphones, sign < 0 ? 'headphone_left' : 'headphone_right', materials.pink, sign * 0.84, -0.02, 0.15, 0.22, 0.14, Math.PI / 2, 0);
    cylinder(headphones, sign < 0 ? 'headphone_pad_left' : 'headphone_pad_right', materials.white, sign * 0.84, -0.02, 0.235, 0.125, 0.05, Math.PI / 2, 0);
  });

  const paws = [];
  [-1, 1].forEach((sign) => {
    const shoulder = new THREE.Group();
    shoulder.name = sign < 0 ? 'front_left_joint' : 'front_right_joint';
    shoulder.position.set(sign * 0.56, 1.12, 0.31);
    root.add(shoulder);
    ell(shoulder, 'front_leg', materials.fur, 0, -0.38, 0, 0.27, 0.48, 0.27);
    const paw = ell(shoulder, 'paw', materials.white, 0, -0.78, 0.2, 0.31, 0.2, 0.31);
    ell(shoulder, 'paw_pad', materials.pink, 0, -0.78, 0.38, 0.13, 0.08, 0.035, 16);
    paws.push({ shoulder, paw });
    ell(root, sign < 0 ? 'back_left_foot' : 'back_right_foot', materials.fur, sign * 0.55, 0.22, -0.28, 0.38, 0.29, 0.55);
    ell(root, sign < 0 ? 'back_left_toes' : 'back_right_toes', materials.white, sign * 0.55, 0.15, 0.11, 0.35, 0.16, 0.3);
  });

  const tailRig = new THREE.Group();
  tailRig.name = 'tail_root';
  tailRig.position.set(-0.7, 0.67, -0.42);
  root.add(tailRig);
  const tailOne = ell(tailRig, 'tail_segment_1', materials.fur, -0.43, 0.22, -0.08, 0.3, 0.68, 0.3);
  tailOne.rotation.z = -0.56;
  const tailTwo = ell(tailRig, 'tail_segment_2', materials.fur, -0.71, 0.7, -0.08, 0.29, 0.5, 0.29);
  tailTwo.rotation.z = 0.26;
  ell(tailRig, 'tail_tip_highlight', materials.furEdge, -0.76, 0.93, 0.01, 0.18, 0.24, 0.18);

  ell(root, 'yellow_collar', materials.yellow, 0, 1.48, 0.01, 0.63, 0.09, 0.59);
  ell(root, 'pink_charm', materials.pink, 0, 1.39, 0.6, 0.13, 0.14, 0.07);

  // Yellow cross-body bag with strap, flap and two cat badges.
  const bag = new THREE.Group();
  bag.name = 'yellow_bag';
  bag.position.set(0.46, 0.75, 0.55);
  bag.rotation.z = -0.18;
  root.add(bag);
  box(bag, 'bag_body', materials.bag, 0, 0, 0, 0.62, 0.48, 0.26, 0);
  box(bag, 'bag_flap', materials.yellowLight, 0, 0.17, 0.145, 0.56, 0.18, 0.06, 0);
  cylinder(bag, 'bag_buckle', materials.bagDark, 0.18, 0.18, 0.19, 0.055, 0.08, Math.PI / 2, 0);
  ell(bag, 'bag_badge_yellow', materials.yellowLight, -0.15, 0.14, 0.2, 0.08, 0.08, 0.03, 16);
  ell(bag, 'bag_badge_black', materials.furDark, 0.02, 0.14, 0.2, 0.06, 0.06, 0.03, 16);
  const bagStrap = box(root, 'bag_strap', materials.yellow, 0.12, 1.12, 0.22, 0.095, 1.4, 0.085, -0.42);

  const state = {
    mode: 'idle',
    activeUntil: 0,
    turnTarget: root.rotation.y,
    turnCurrent: root.rotation.y,
    running: true,
    frame: 0,
    last: Date.now(),
    nextBlink: 1.8,
    blinkUntil: 0,
    activeModel: 'procedural',
    variant: 'home',
    mixers: {},
    clips: {},
    glbScenes: {},
    glbReady: false
  };

  function playGlbClip(variant, mode) {
    const mixer = state.mixers[variant];
    const clips = state.clips[variant] || [];
    if (!mixer || !clips.length) return;
    const wanted = mode === 'pet' ? 'TOUCH' : mode === 'wave' ? 'WAVE' : 'IDLE';
    const clip = clips.find((item) => String(item.name || '').toUpperCase().indexOf(wanted) >= 0) || clips[0];
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().fadeIn(0.14).play();
  }

  function activateGlb(gltf, variant) {
    if (!gltf || !gltf.scene) return;
    const targetRoot = glbRoots[variant] || glbRoot;
    const glbScene = gltf.scene;
    glbScene.name = `yanmiao_blender_cat_${variant}`;
    targetRoot.add(glbScene);
    targetRoot.visible = state.variant === variant;
    state.glbScenes[variant] = glbScene;
    state.clips[variant] = gltf.animations || [];
    state.activeModel = 'glb';
    state.glbReady = Boolean(state.glbScenes.home);
    if (THREE.AnimationMixer && gltf.animations && gltf.animations.length) {
      state.mixers[variant] = new THREE.AnimationMixer(glbScene);
      playGlbClip(variant, state.mode);
    }
    if (state.glbReady) {
      root.children.forEach((child) => {
        if (child !== floorShadow && child !== glbRoots.home && child !== glbRoots.touch && child !== glbRoots.menu) child.visible = false;
      });
    }
  }

  function loadBlenderCat(variant) {
    try {
      const loader = new GLTFLoader();
      const file = `models/yanmiao-cat${variant === 'home' ? '' : `-${variant}`}.glb`;
      adapter.downloadFile(asset(file))
        .then((result) => adapter.readFileAsArrayBuffer(result))
        .then((buffer) => loader.parse(buffer, `${assetBaseUrl}/assets/models/`, (gltf) => activateGlb(gltf, variant), (error) => {
          console.warn(`言喵 Blender ${variant} GLB 解析失败，继续使用程序化模型`, error);
        }))
        .catch((error) => console.warn(`言喵 Blender ${variant} GLB 读取失败，继续使用程序化模型`, error));
    } catch (error) {
      console.warn('言喵 GLTFLoader 初始化失败，继续使用程序化模型', error);
    }
  }

  ['home', 'touch', 'menu'].forEach(loadBlenderCat);

  function setMode(mode, duration) {
    state.mode = mode || 'idle';
    state.activeUntil = Date.now() + (duration || 950);
    state.variant = state.mode === 'menu' ? 'menu' : state.mode === 'pet' ? 'touch' : 'home';
    Object.keys(glbRoots).forEach((variant) => {
      glbRoots[variant].visible = Boolean(state.glbScenes[variant]) && state.variant === variant;
    });
    playGlbClip(state.variant, state.mode);
  }

  function turnBy(deltaX, scale) {
    state.turnTarget += (Number(deltaX) || 0) * (Number(scale) || 0.012);
  }

  function animate() {
    if (!state.running) return;
    state.frame = raf(animate);
    const now = Date.now();
    const time = now / 1000;
    const dt = Math.min((now - state.last) / 1000, 0.04);
    state.last = now;
    if (time > state.nextBlink) {
      state.blinkUntil = time + 0.2;
      state.nextBlink = time + 2.4 + Math.random() * 3.6;
    }
    const blink = state.blinkUntil > time ? Math.max(0, 1 - Math.abs(time - (state.blinkUntil - 0.1)) / 0.1) : 0;
    eyes.forEach((eye) => {
      eye.lid.position.y = 0.36 - blink * 0.31;
      eye.lid.scale.y = Math.max(0.02, blink * 0.38);
    });

    if (state.mixers[state.variant]) state.mixers[state.variant].update(dt);
    const active = now < state.activeUntil;
    const petting = active && state.mode === 'pet';
    const waving = active && state.mode === 'wave';
    const idleBreath = Math.sin(time * 2.3);
    body.scale.y = 1.02 + idleBreath * 0.014;
    headJoint.position.y = 1.83 + idleBreath * 0.012 + (petting ? Math.sin(time * 12) * 0.014 : 0);
    headJoint.rotation.y = lerp(headJoint.rotation.y, 0.06 * Math.sin(time * 0.9) + (petting ? 0.13 : 0), 0.08);
    headJoint.rotation.z = lerp(headJoint.rotation.z, 0.04 * Math.sin(time * 1.15) + (petting ? -0.05 : 0), 0.08);
    ears[0].rotation.z = 0.04 * Math.sin(time * 1.5);
    ears[1].rotation.z = 0.045 * Math.sin(time * 1.6 + 1);
    tailRig.rotation.z = 0.19 * Math.sin(time * 2.5) + (petting ? 0.12 : 0);
    tailRig.rotation.y = 0.15 * Math.sin(time * 1.3);
    paws[1].shoulder.rotation.z = lerp(paws[1].shoulder.rotation.z, waving ? -0.98 + 0.2 * Math.sin(time * 16) : petting ? -0.42 : 0, 0.12);
    paws[1].shoulder.rotation.x = lerp(paws[1].shoulder.rotation.x, waving ? -0.72 : petting ? -0.18 : 0, 0.12);
    paws[0].shoulder.rotation.z = lerp(paws[0].shoulder.rotation.z, petting ? 0.1 : 0, 0.1);
    mouth.scale.y = lerp(mouth.scale.y, petting || waving ? 2.25 : 1, 0.16);
    state.turnCurrent = lerp(state.turnCurrent, state.turnTarget, Math.min(1, dt * 9));
    root.rotation.y = state.turnCurrent;
    if (state.glbReady) {
      const activeGlbRoot = glbRoots[state.variant] || glbRoot;
      activeGlbRoot.position.y = -0.02 + (petting ? Math.sin(time * 12) * 0.025 : 0);
      activeGlbRoot.rotation.z = petting ? 0.04 * Math.sin(time * 8) : 0;
      activeGlbRoot.scale.setScalar(0.58 + (petting ? 0.018 * Math.sin(time * 12) : 0));
    }
    renderer.render(scene, camera);
  }
  state.frame = raf(animate);

  return {
    THREE,
    root,
    scene,
    camera,
    renderer,
    pet: () => setMode('pet', 1050),
    wave: () => setMode('wave', 1100),
    setMode,
    turnBy,
    pause() { state.running = false; if (state.frame) caf(state.frame); },
    resume() { if (!state.running) { state.running = true; state.last = Date.now(); state.frame = raf(animate); } },
    dispose() { state.running = false; if (state.frame) caf(state.frame); Object.keys(state.mixers).forEach((variant) => state.mixers[variant].stopAllAction()); renderer.dispose(); }
  };
}

module.exports = { makeCat3D };
