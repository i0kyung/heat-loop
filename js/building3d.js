// building3d.js — 건물 개략 3D 뷰어 (Three.js, 필요할 때만 불러온다)
// 입력 치수로 만든 매스 모델 위에 샤워실·기계실·배수 수직관·HEAT LOOP Core·급수 배관을 놓고,
// STEP 02 측정값(시뮬레이션/실측)이 들어오면 물 흐름과 온도 라벨을 실시간으로 바꾼다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { measure, floorLabel, floorBase, viewAngleDeg, niceScale } from './building-model.js';

const COL = { hot: 0xef7a5a, cold: 0x3d7fd9, pre: 0x2fa58f, sage: 0x88a99a, char: 0x2c3330, slab: 0xdcd8cd, glass: 0xcfe3dc, ground: 0xe6e3d9, white: 0xf4f1ea, copper: 0xb87a4b };

export function createBuildingViewer(container, { onInfo } = {}) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'b3-labels';
  container.appendChild(labelLayer);
  const scaleBar = document.createElement('div');
  scaleBar.className = 'b3-scale';
  container.appendChild(scaleBar);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf7f6f1, 200, 700);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c7, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const persp = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 3000);
  let camera = persp;
  const controls = new OrbitControls(persp, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  const oControls = new OrbitControls(ortho, renderer.domElement);
  oControls.enableRotate = false;
  oControls.enabled = false;

  let root = new THREE.Group();
  scene.add(root);
  let m = null; // measure() 결과
  let pipes = []; // { curve, mesh, dots, kind, speed }
  let labels = []; // { pos, el }
  let parts = {};
  let view = 'iso';
  let live = { mode: 'ON', flow: 0, kw: 0, reading: null, status: 'SIMULATED' };
  let tween = null;
  let running = false;
  let t0 = performance.now();

  // ---------- 모델 만들기 ----------
  function build(input) {
    m = measure(input);
    scene.remove(root);
    disposeTree(root);
    root = new THREE.Group();
    scene.add(root);
    pipes = []; labels = []; parts = {};
    labelLayer.innerHTML = '';
    const { b, h } = m;
    const W = b.width, D = b.depth;
    const top = m.heightAbove, bottom = -m.depthBelow;

    // 지면 (반투명 → 지하층이 보인다)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: COL.ground, transparent: true, opacity: 0.86, depthWrite: false, roughness: 1 }));
    ground.scale.set(Math.max(W, D) * 6 + 80, Math.max(W, D) * 6 + 80, 1);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    parts.ground = ground;
    const grid = new THREE.GridHelper(Math.max(W, D) * 6 + 80, Math.round((Math.max(W, D) * 6 + 80) / 5), 0xd2cec2, 0xe0dcd2);
    grid.position.y = 0.01;
    root.add(grid);
    parts.grid = grid;
    // 도로(정면 쪽)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(W, D) * 6 + 80, 8), new THREE.MeshStandardMaterial({ color: 0xcfcbc0, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, D / 2 + 9);
    root.add(road);

    // 층 슬래브
    const slabMat = new THREE.MeshStandardMaterial({ color: COL.slab, roughness: 0.9 });
    for (let f = -b.floorsBelow; f <= b.floorsAbove; f++) {
      const y = f * h;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), slabMat);
      slab.position.y = y;
      slab.castShadow = true; slab.receiveShadow = true;
      root.add(slab);
    }
    // 유리 외벽 (단면 보기에서 앞·오른쪽 벽을 숨긴다)
    const wallH = top - bottom;
    const glass = (opacity) => new THREE.MeshStandardMaterial({ color: COL.glass, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2, metalness: 0.1 });
    const mkWall = (w, x, z, ry, name) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), glass(0.2));
      wall.position.set(x, bottom + wallH / 2, z);
      wall.rotation.y = ry;
      wall.name = name;
      root.add(wall);
      return wall;
    };
    parts.walls = {
      front: mkWall(W, 0, D / 2, 0, 'front'),
      back: mkWall(W, 0, -D / 2, 0, 'back'),
      left: mkWall(D, -W / 2, 0, Math.PI / 2, 'left'),
      right: mkWall(D, W / 2, 0, Math.PI / 2, 'right')
    };
    // 외곽선과 층 띠
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, wallH, D)), new THREE.LineBasicMaterial({ color: 0x7d8883 }));
    edges.position.y = bottom + wallH / 2;
    root.add(edges);
    const bandMat = new THREE.LineBasicMaterial({ color: 0xa7b0ab });
    for (let f = -b.floorsBelow + 1; f < b.floorsAbove; f++) {
      const y = f * h;
      const pts = [[-W / 2, y, D / 2], [W / 2, y, D / 2], [W / 2, y, -D / 2], [-W / 2, y, -D / 2], [-W / 2, y, D / 2]].map((p) => new THREE.Vector3(...p));
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bandMat));
    }

    // 샤워실 · 기계실
    const roomW = Math.min(W * 0.42, 14), roomD = Math.min(D * 0.4, 10);
    const rx = -W / 2 + roomW / 2 + Math.min(2, W * 0.08);
    const rz = D / 2 - roomD / 2 - Math.min(2, D * 0.08);
    const room = (base, color, label) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(roomW, h * 0.86, roomD), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }));
      mesh.position.set(rx, base + 0.15 + (h * 0.86) / 2, rz);
      root.add(mesh);
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));
      ed.position.copy(mesh.position);
      root.add(ed);
      addLabel(new THREE.Vector3(rx - roomW / 2, base + h * 0.9, rz + roomD / 2), label, 'room');
      return mesh;
    };
    parts.shower = room(m.showerBase, COL.hot, `샤워실 · ${floorLabel(b.showerFloor)}`);
    parts.mech = room(m.mechBase, COL.sage, `기계실 · ${floorLabel(b.mechFloor)}`);
    // 샤워기
    const heads = 5;
    for (let i = 0; i < heads; i++) {
      const x = rx - roomW / 2 + ((i + 0.5) * roomW) / heads;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9), new THREE.MeshStandardMaterial({ color: COL.char }));
      pole.position.set(x, m.showerBase + 0.15 + 0.95, rz - roomD / 2 + 0.5);
      root.add(pole);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.08, 16), new THREE.MeshStandardMaterial({ color: COL.char }));
      head.position.set(x, m.showerBase + 2.0, rz - roomD / 2 + 0.75);
      root.add(head);
    }

    // 배관 경로
    const px = rx + roomW * 0.18; // 배수 수직관 x
    const pz = rz;
    const valid = m.riserLength !== null;
    const coreLen = m.coreLength;
    const coreBottom = m.mechBase + 0.5;
    const coreTop = coreBottom + coreLen;
    const drainLow = m.mechBase + 0.35;
    parts.pipeFocus = new THREE.Vector3(px, 0, pz);
    if (valid) {
      // 배수: 샤워실 바닥 → 수직관 → (기계실 Core) → 하수(정면 도로 쪽)
      addPipe('drain', [[px - roomW * 0.3, m.showerBase + 0.25, pz], [px, m.showerBase + 0.25, pz], [px, drainLow, pz], [px, drainLow, D / 2 + 4], [px, drainLow - 1.2, D / 2 + 4]], 0.16, COL.hot);
      // 급수: 도로 → Core 아래 → 코일 → Core 위 → 급탕기
      const sx = px + 1.2;
      const heaterX = px + Math.min(4, roomW * 0.4);
      const heaterZ = pz - Math.min(2.5, roomD * 0.3);
      addPipe('cold', [[sx, m.mechBase + 0.25, D / 2 + 6], [sx, m.mechBase + 0.25, pz + 0.5], [px + 0.42, m.mechBase + 0.25, pz + 0.5], [px + 0.42, coreBottom + 0.1, pz + 0.5]], 0.09, COL.cold);
      addPipe('pre', [[px + 0.42, coreTop - 0.1, pz + 0.5], [px + 0.42, coreTop + 0.25, pz + 0.5], [heaterX, coreTop + 0.25, heaterZ], [heaterX, m.mechBase + 1.8, heaterZ]], 0.09, COL.pre);
      addPipe('bypass', [[sx, m.mechBase + 0.25, pz + 0.5], [sx, coreTop + 0.25, pz + 0.5], [px + 0.42, coreTop + 0.25, pz + 0.5]], 0.06, COL.cold);
      // 급탕(온수) 공급: 급탕기 → 샤워실 (점선 느낌의 얇은 관)
      addPipe('hot', [[heaterX, m.mechBase + 1.8, heaterZ], [heaterX, m.showerBase + h * 0.75, heaterZ], [rx - roomW / 2 + 0.6, m.showerBase + h * 0.75, rz - roomD / 2 + 0.6]], 0.05, COL.hot, 0.55);
      // 급탕기
      const heater = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshStandardMaterial({ color: COL.char, roughness: 0.6 }));
      heater.position.set(heaterX, m.mechBase + 0.95, heaterZ);
      heater.castShadow = true;
      root.add(heater);
      addLabel(new THREE.Vector3(heaterX, m.mechBase + 2.0, heaterZ), '급탕기', 'tag');

      // HEAT LOOP Core (보기 쉽게 지름을 실제보다 크게 그림)
      const core = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, coreLen, 32), new THREE.MeshStandardMaterial({ color: COL.white, roughness: 0.5, emissive: COL.hot, emissiveIntensity: 0 }));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.08, 32), new THREE.MeshStandardMaterial({ color: COL.sage }));
      band.position.y = coreLen * 0.28;
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 32), new THREE.MeshStandardMaterial({ color: COL.char }));
      capT.position.y = coreLen / 2;
      const capB = capT.clone(); capB.position.y = -coreLen / 2;
      core.add(body, band, capT, capB);
      core.position.set(px, coreBottom + coreLen / 2, pz);
      core.traverse((o) => { o.castShadow = true; });
      root.add(core);
      parts.core = body;
      const glow = new THREE.PointLight(COL.hot, 0, 6);
      glow.position.set(px + 0.6, coreBottom + coreLen / 2, pz + 0.6);
      root.add(glow);
      parts.glow = glow;
      addLabel(new THREE.Vector3(px - 0.4, coreTop + 0.6, pz), 'HEAT LOOP Core', 'core');
      parts.sensors = {
        t1: addLabel(new THREE.Vector3(px - 0.5, coreTop + 0.05, pz), 'T1', 'probe hot'),
        t2: addLabel(new THREE.Vector3(px - 0.5, coreBottom - 0.05, pz), 'T2', 'probe hot'),
        t3: addLabel(new THREE.Vector3(px + 0.9, coreBottom, pz + 0.5), 'T3', 'probe cold'),
        t4: addLabel(new THREE.Vector3(px + 0.9, coreTop + 0.25, pz + 0.5), 'T4', 'probe pre')
      };
      addLabel(new THREE.Vector3(px + 0.3, (m.showerBase + coreTop) / 2, pz), `배수 수직관 약 ${m.riserLength.toFixed(1)} m`, 'dimen');
    }

    // 치수선: 높이(오른쪽 앞 모서리), 가로(정면 아래), 세로(오른쪽 아래)
    const dm = new THREE.LineBasicMaterial({ color: 0x24473b });
    const line = (a, c) => root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...c)]), dm));
    const ox = W / 2 + 2, oz = D / 2 + 2;
    line([ox, 0, oz], [ox, top, oz]);
    for (let f = 0; f <= b.floorsAbove; f++) line([ox - 0.4, f * h, oz], [ox + 0.4, f * h, oz]);
    line([-W / 2, 0.05, oz], [W / 2, 0.05, oz]);
    line([-W / 2, 0.05, oz - 0.5], [-W / 2, 0.05, oz + 0.5]);
    line([W / 2, 0.05, oz - 0.5], [W / 2, 0.05, oz + 0.5]);
    line([ox, 0.05, -D / 2], [ox, 0.05, D / 2]);
    addLabel(new THREE.Vector3(ox + 0.6, top / 2, oz), `높이 ${top.toFixed(1)} m<br><small>지상 ${b.floorsAbove}층 × 층고 ${h} m</small>`, 'dimen strong');
    addLabel(new THREE.Vector3(0, 0.05, oz + 0.8), `가로 ${W} m`, 'dimen');
    addLabel(new THREE.Vector3(ox + 0.8, 0.05, 0), `세로 ${D} m`, 'dimen');
    if (b.floorsBelow) addLabel(new THREE.Vector3(-W / 2 - 1, bottom / 2, D / 2), `지하 ${b.floorsBelow}층 · ${m.depthBelow.toFixed(1)} m`, 'dimen');
    for (let f = 1; f <= b.floorsAbove; f++) if (b.floorsAbove <= 12 || f % Math.ceil(b.floorsAbove / 10) === 0) addLabel(new THREE.Vector3(-W / 2 - 0.8, (f - 0.5) * h, D / 2), `${f}F`, 'floor');

    // 빛과 그림자 범위
    const span = Math.max(W, D, top) * 1.4;
    sun.position.set(span * 0.8, top + span, span);
    sun.target.position.set(0, 0, 0);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun.target);

    setView(view, true);
    applyLive();
    onInfo?.(m);
  }

  function addPipe(kind, pts, r, color, opacity = 1) {
    const path = new THREE.CurvePath();
    const v = pts.map((p) => new THREE.Vector3(...p));
    for (let i = 1; i < v.length; i++) path.add(new THREE.LineCurve3(v[i - 1], v[i]));
    const len = path.getLength();
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, v.length * 24), r, 10, false), new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.45 }));
    tube.castShadow = true;
    root.add(tube);
    const n = Math.max(4, Math.round(len / 0.6));
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(r * 0.75, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    dots.frustumCulled = false;
    root.add(dots);
    pipes.push({ kind, curve: path, len, tube, dots, n, phase: 0 });
  }

  function addLabel(pos, html, cls) {
    const el = document.createElement('div');
    el.className = `b3-label ${cls}`;
    el.innerHTML = html;
    labelLayer.appendChild(el);
    const item = { pos, el };
    labels.push(item);
    return item;
  }

  // ---------- 시점 ----------
  function viewTargets(name) {
    const { b } = m;
    const W = b.width, D = b.depth, top = m.heightAbove, bot = -m.depthBelow;
    const big = Math.max(W, D, top);
    if (name === 'ground') {
      // 도로 건너편 보행자 눈높이 1.6 m에서 올려다본 시점
      // 건물 폭 전체가 화면에 들어오는 거리 (세로 화면이면 더 멀리)
      const hfov = 2 * Math.atan(Math.tan((persp.fov * Math.PI) / 360) * (size.w / size.h));
      const dist = Math.max(top * 1.15, 22, (W * 0.62) / Math.tan(hfov / 2)) + D / 2;
      return { cam: [W * 0.18, 1.6, dist], target: [0, top * 0.55, 0], dist: dist - D / 2 };
    }
    if (name === 'section') {
      // 샤워실~기계실 배관 구간으로 다가간다
      const p = parts.pipeFocus ?? new THREE.Vector3(-W * 0.2, 0, D * 0.2);
      // 기계실 Core 쪽에 무게를 둔다 (샤워실은 화면 위쪽에 함께 보이게)
      // 건축 단면도처럼 거의 수평으로 본다 → 슬래브가 얇은 선이 되어 기계실과 샤워실이 함께 보인다
      const yMid = (m.mechBase + m.showerBase + m.h) / 2;
      const span = Math.max(m.showerBase + m.h - m.mechBase, 6);
      const dist = span * 1.05 + 4;
      return { cam: [p.x + dist * 0.5, yMid + dist * 0.06, p.z + dist * 0.95], target: [p.x + 0.8, yMid, p.z], near: true };
    }
    return { cam: [big * 1.35, top + big * 0.75, big * 1.6], target: [0, (top + bot) / 2, 0] };
  }

  // 세로로 긴 폰 화면에서는 카메라를 더 멀리 둬서 건물이 잘리지 않게 한다
  function fitDistance(v) {
    const aspect = size.w / size.h;
    const k = aspect < 1.2 ? Math.min(v.near ? 1.5 : 2.2, 1.2 / Math.max(aspect, 0.4)) : 1;
    if (k === 1 || view === 'ground') return v;
    const t = new THREE.Vector3(...v.target);
    const c = new THREE.Vector3(...v.cam).sub(t).multiplyScalar(k).add(t);
    return { ...v, cam: c.toArray() };
  }

  function setView(name, instant = false) {
    view = name;
    if (!m) return;
    parts.walls.front.visible = name !== 'section';
    parts.walls.right.visible = name !== 'section';
    // 단면에서는 지면을 거의 투명하게 해서 지하 기계실이 보이게 한다
    parts.ground.material.opacity = name === 'section' ? 0.25 : 0.86;
    parts.grid.visible = name !== 'section';
    if (name === 'front') {
      camera = ortho;
      controls.enabled = false; oControls.enabled = true;
      const { b } = m;
      ortho.position.set(0, (m.heightAbove - m.depthBelow) / 2, 400);
      ortho.lookAt(0, (m.heightAbove - m.depthBelow) / 2, 0);
      oControls.target.set(0, (m.heightAbove - m.depthBelow) / 2, 0);
      ortho.zoom = 1;
      fitOrtho(b.width + 10, m.totalHeight + 8);
      oControls.update();
      tween = null;
    } else {
      camera = persp;
      controls.enabled = true; oControls.enabled = false;
      const v = fitDistance(viewTargets(name));
      controls.maxPolarAngle = name === 'section' ? Math.PI * 0.62 : Math.PI * 0.495;
      if (instant || reduce) {
        persp.position.set(...v.cam); controls.target.set(...v.target); controls.update(); tween = null;
      } else {
        tween = { from: persp.position.clone(), to: new THREE.Vector3(...v.cam), tf: controls.target.clone(), tt: new THREE.Vector3(...v.target), t: 0 };
      }
    }
    onInfo?.(m, viewInfo());
  }

  function viewInfo() {
    if (!m) return {};
    if (view === 'ground') {
      const v = viewTargets('ground');
      return { kind: 'ground', dist: v.dist, angle: viewAngleDeg(m.heightAbove, v.dist) };
    }
    return { kind: view };
  }

  let size = { w: 1, h: 1 };
  function fitOrtho(needW, needH) {
    const aspect = size.w / size.h;
    let hh = needH / 2, hw = hh * aspect;
    if (hw < needW / 2) { hw = needW / 2; hh = hw / aspect; }
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh });
    ortho.updateProjectionMatrix();
  }

  function resize() {
    const r = container.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    renderer.setSize(size.w, size.h, false);
    persp.aspect = size.w / size.h;
    persp.updateProjectionMatrix();
    if (m && view === 'front') fitOrtho(m.b.width + 10, m.totalHeight + 8);
    // 첫 배치(크기가 정해진 직후)에는 시점을 다시 맞춘다
    if (m && !resize.done && size.w > 10) { resize.done = true; setView(view, true); }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---------- 측정값 연동 ----------
  function setLive(reading, ev) {
    if (!reading) { live = { mode: live.mode, flow: 0, kw: 0, reading: null, status: live.status }; applyLive(); return; }
    live = { mode: reading.mode, flow: reading.coldFlowLpm ?? 0, kw: ev?.kw ?? null, reading, status: ev?.status ?? 'SIMULATED' };
    applyLive();
  }
  function applyLive() {
    if (!m || !parts.sensors) return;
    const r = live.reading;
    const f = (k) => (r && Number.isFinite(r[k]) ? `${r[k].toFixed(1)}℃` : '—');
    parts.sensors.t1.el.innerHTML = `T1 <b>${f('t1')}</b>`;
    parts.sensors.t2.el.innerHTML = `T2 <b>${f('t2')}</b>`;
    parts.sensors.t3.el.innerHTML = `T3 <b>${f('t3')}</b>`;
    parts.sensors.t4.el.innerHTML = `T4 <b>${f('t4')}</b>`;
    const on = live.mode === 'ON';
    for (const p of pipes) {
      if (p.kind === 'bypass') p.tube.material.opacity = on ? 0.25 : 1, p.tube.material.transparent = true;
      if (p.kind === 'pre') p.tube.material.color.setHex(on ? COL.pre : COL.cold);
    }
    const kw = Number.isFinite(live.kw) ? live.kw : 0;
    parts.core.material.emissiveIntensity = on ? Math.min(0.55, kw / 40) : 0;
    parts.glow.intensity = on ? Math.min(6, kw / 4) : 0;
  }

  // ---------- 루프 ----------
  const tmp = new THREE.Object3D();
  const v3 = new THREE.Vector3();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const e = 1 - Math.pow(1 - tween.t, 3);
      persp.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tf, tween.tt, e);
      if (tween.t >= 1) tween = null;
    }
    (camera === persp ? controls : oControls).update();

    // 물 흐름 점: 유량에 비례한 속도, 흐름 없으면 멈춤
    const flowing = live.flow > 0.2;
    const on = live.mode === 'ON';
    for (const p of pipes) {
      let active = flowing;
      if (p.kind === 'bypass') active = flowing && !on;
      if (p.kind === 'hot') active = flowing;
      p.dots.visible = active;
      if (!active) continue;
      const speed = (0.6 + live.flow / 25) / p.len; // m/s → 경로 비율
      p.phase = (p.phase + dt * speed * (reduce ? 0.3 : 1)) % 1;
      for (let i = 0; i < p.n; i++) {
        const u = (p.phase + i / p.n) % 1;
        p.curve.getPointAt(u, v3);
        tmp.position.copy(v3);
        tmp.updateMatrix();
        p.dots.setMatrixAt(i, tmp.matrix);
      }
      p.dots.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    placeLabels();
  }

  // 라벨: 시점에 맞는 것만 보이고, 겹치면 우선순위가 낮은 라벨을 숨긴다
  const PRIORITY = { strong: 6, core: 5, room: 4, probe: 5.5, dimen: 3, tag: 2, floor: 1 };
  function prio(l) {
    if (l.p !== undefined) return l.p;
    const c = l.el.className;
    l.p = Math.max(...Object.entries(PRIORITY).map(([k, v]) => (c.includes(k) ? v : 0)));
    return l.p;
  }
  function placeLabels() {
    const w = size.w, h = size.h;
    const close = view === 'section';
    const placed = [];
    const sorted = [...labels].sort((a, b) => prio(b) - prio(a));
    for (const l of sorted) {
      const c = l.el.className;
      let want = true;
      if (c.includes('probe') && !close) want = false; // 센서 값은 단면(가까이)에서만
      if (c.includes('floor') && close) want = false;
      v3.copy(l.pos).project(camera);
      const inView = v3.z < 1 && v3.z > -1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      if (!want || !inView) { l.el.style.display = 'none'; continue; }
      const x = ((v3.x + 1) / 2) * w, y = ((1 - v3.y) / 2) * h;
      l.el.style.display = '';
      if (!l.size || l.size.html !== l.el.innerHTML) l.size = { w: l.el.offsetWidth, h: l.el.offsetHeight, html: l.el.innerHTML };
      // translate 기준(가운데·아래)과 같은 상자로 겹침 검사
      const ax = c.includes('room') || c.includes('strong') ? 0 : c.includes('floor') ? -1 : -0.5;
      const ay = c.includes('strong') || c.includes('floor') ? -0.5 : -1;
      const box = { l: x + ax * l.size.w, t: y + ay * l.size.h, r: x + (ax + 1) * l.size.w, b: y + (ay + 1) * l.size.h };
      if (placed.some((p) => box.l < p.r + 2 && box.r > p.l - 2 && box.t < p.b + 2 && box.b > p.t - 2)) { l.el.style.display = 'none'; continue; }
      placed.push(box);
      l.el.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (camera === ortho) {
      const metersAcross = (ortho.right - ortho.left) / ortho.zoom;
      const sm = niceScale(metersAcross);
      scaleBar.style.display = '';
      scaleBar.innerHTML = `<i style="width:${(sm / metersAcross) * w}px"></i><span>${sm} m</span>`;
    } else scaleBar.style.display = 'none';
  }

  function start() { if (running) return; running = true; t0 = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  function dispose() { stop(); ro.disconnect(); disposeTree(scene); renderer.dispose(); container.innerHTML = ''; }

  return { build, setView, setLive, start, stop, dispose, get model() { return m; }, get view() { return view; } };
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mt = o.material;
    if (Array.isArray(mt)) mt.forEach((x) => x.dispose?.()); else mt?.dispose?.();
  });
}

export { floorLabel, floorBase };
