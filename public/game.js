'use strict';

/* ===== 基础配置常量 ===== */
const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;
const WORLD_SIZE = 32;
const WORLD_LIMIT = WORLD_SIZE - 3;
const TOTAL_PREY = 24;
const FOG_COLOR = '#123023';
const FOG_NEAR = 19;
const FOG_FAR = 52;

const canvas = document.getElementById('glcanvas');
const stageValue = document.getElementById('stage-value');
const eatenValue = document.getElementById('eaten-value');
const timeValue = document.getElementById('time-value');
const progressValue = document.getElementById('progress-value');
const progressFill = document.getElementById('progress-fill');
const tip = document.getElementById('tip');
const pauseButton = document.getElementById('pause-button');
const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modal-title');
const modalCopy = document.getElementById('modal-copy');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const evolutionBanner = document.getElementById('evolution-banner');
const evolutionTitle = document.getElementById('evolution-title');
const evolutionSubtitle = document.getElementById('evolution-subtitle');

let gl = null;
let program = null;
let meshes = null;
let uniforms = null;
let projection = new Float32Array(16);
let view = new Float32Array(16);
let randomState = 0x1a2b3c4d;
let state = 'menu';
let lastFrame = 0;
let accumulator = 0;
let renderClock = 0;
let elapsed = 0;
let score = 0;
let totalEaten = 0;
let player = null;
let prey = [];
let trees = [];
let groundPatches = [];
let particles = [];
let toastTimer = 0;
let evolutionTimer = 0;
let camera = { x: 0, y: 4, z: -8 };
const keys = Object.create(null);
const colorCache = new Map();

/* ===== 数据表 ===== */
const EVOLUTION_STAGES = [
  {
    id: 'sproutling',
    label: '藤芽幼兽',
    shortLabel: '幼兽',
    need: 0,
    speed: 5.1,
    size: 0.78,
    eatLimit: 0.82,
    body: '#b9c66e',
    dark: '#3d542c',
    accent: '#e5ed8d',
    glow: '#9aef9c',
  },
  {
    id: 'pouncer',
    label: '斑叶猎手',
    shortLabel: '猎手',
    need: 4,
    speed: 5.9,
    size: 0.96,
    eatLimit: 1.1,
    body: '#e39a59',
    dark: '#683c2e',
    accent: '#ffd18a',
    glow: '#ffb56f',
  },
  {
    id: 'ravager',
    label: '铁牙掠食者',
    shortLabel: '掠食者',
    need: 10,
    speed: 6.6,
    size: 1.16,
    eatLimit: 1.62,
    body: '#b66bc5',
    dark: '#422f62',
    accent: '#e6a8ff',
    glow: '#c18cff',
  },
  {
    id: 'canopy-king',
    label: '树冠霸主',
    shortLabel: '霸主',
    need: 18,
    speed: 7.2,
    size: 1.4,
    eatLimit: 2.65,
    body: '#5db8a0',
    dark: '#164c4a',
    accent: '#c9ff9e',
    glow: '#65ffd0',
  },
];

const PREY_TYPES = {
  beetle: {
    name: '红甲虫',
    size: 0.34,
    speed: 1.4,
    body: '#cc6444',
    dark: '#5b2828',
    accent: '#ffb154',
    glow: '#ff925f',
    style: 'beetle',
  },
  frog: {
    name: '苔纹蛙',
    size: 0.55,
    speed: 1.15,
    body: '#65b875',
    dark: '#214e39',
    accent: '#c9f47c',
    glow: '#8ce89c',
    style: 'frog',
  },
  monkey: {
    name: '藤尾猴',
    size: 0.92,
    speed: 1.8,
    body: '#a47958',
    dark: '#4b302d',
    accent: '#f0c28b',
    glow: '#e4a06b',
    style: 'monkey',
  },
  boar: {
    name: '獠牙野猪',
    size: 1.28,
    speed: 1.35,
    body: '#7e8490',
    dark: '#303943',
    accent: '#e7d4b6',
    glow: '#c5d0d2',
    style: 'boar',
  },
  panther: {
    name: '夜行豹',
    size: 1.86,
    speed: 2.1,
    body: '#303c68',
    dark: '#151a38',
    accent: '#a4a7ff',
    glow: '#707cff',
    style: 'panther',
  },
};

const PREY_LAYOUT = [
  { type: 'beetle', count: 8 },
  { type: 'frog', count: 6 },
  { type: 'monkey', count: 5 },
  { type: 'boar', count: 3 },
  { type: 'panther', count: 2 },
];

/* ===== 工具函数 ===== */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand() {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 4294967296;
}

function randRange(min, max) {
  return min + (max - min) * rand();
}

function randAngle() {
  return rand() * TAU;
}

function distanceSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return mins + ':' + secs;
}

function hexToRgb(hex) {
  if (colorCache.has(hex)) return colorCache.get(hex);
  const value = hex.replace('#', '');
  const rgb = new Float32Array([
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ]);
  colorCache.set(hex, rgb);
  return rgb;
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function showTip(message, duration = 2.4) {
  setText(tip, message);
  toastTimer = duration;
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function showOverlay(title, copy, action, showRestart = false) {
  modalTitle.innerHTML = title;
  modalCopy.textContent = copy;
  startButton.textContent = action;
  startButton.hidden = false;
  restartButton.hidden = !showRestart;
  overlay.classList.add('visible');
}

function localPoint(base, yaw, lx, ly, lz) {
  return {
    x: base.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
    y: ly,
    z: base.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
  };
}

/* ===== WebGL 初始化 ===== */
const VERTEX_SHADER = [
  'attribute vec3 aPosition;',
  'attribute vec3 aNormal;',
  'uniform mat4 uProjection;',
  'uniform mat4 uView;',
  'uniform mat4 uModel;',
  'varying vec3 vNormal;',
  'varying vec3 vWorld;',
  'void main() {',
  '  vec4 world = uModel * vec4(aPosition, 1.0);',
  '  vWorld = world.xyz;',
  '  vNormal = normalize(mat3(uModel) * aNormal);',
  '  gl_Position = uProjection * uView * world;',
  '}',
].join('\n');

const FRAGMENT_SHADER = [
  'precision mediump float;',
  'varying vec3 vNormal;',
  'varying vec3 vWorld;',
  'uniform vec3 uColor;',
  'uniform vec3 uLight;',
  'uniform vec3 uFogColor;',
  'uniform vec3 uCameraPos;',
  'uniform float uFogNear;',
  'uniform float uFogFar;',
  'uniform float uGlow;',
  'uniform float uAlpha;',
  'uniform float uTime;',
  'void main() {',
  '  float diffuse = max(dot(normalize(vNormal), normalize(uLight)), 0.0);',
  '  float pulse = 0.86 + sin(uTime * 3.0 + vWorld.y) * 0.14;',
  '  vec3 lit = uColor * (0.34 + diffuse * 0.72) + uColor * uGlow * pulse;',
  '  float distanceToCamera = length(uCameraPos - vWorld);',
  '  float fog = clamp((distanceToCamera - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
  '  gl_FragColor = vec4(mix(lit, uFogColor, fog), uAlpha);',
  '}',
].join('\n');

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram() {
  const vertex = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const linked = gl.createProgram();
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(linked) || 'Could not link shader program');
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return linked;
}

function makeMesh(positions, normals, indices) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return { positionBuffer, normalBuffer, indexBuffer, count: indices.length };
}

function makeCube() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  faces.forEach((face) => {
    const offset = positions.length / 3;
    face.c.forEach((corner) => {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });
  return makeMesh(positions, normals, indices);
}

function makeSphere(rows = 8, columns = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * TAU;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const first = row * (columns + 1) + column;
      const second = first + columns + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return makeMesh(positions, normals, indices);
}

function makeCylinder(topRadius = 1, bottomRadius = 1, segments = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let yIndex = 0; yIndex <= 1; yIndex += 1) {
    const y = yIndex - 0.5;
    const radius = yIndex === 0 ? bottomRadius : topRadius;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * TAU;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, y, z);
      normals.push(Math.cos(angle), 0, Math.sin(angle));
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i;
    const b = i + 1;
    const c = segments + 1 + i;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return makeMesh(positions, normals, indices);
}

function createMeshes() {
  return {
    cube: makeCube(),
    sphere: makeSphere(),
    lowSphere: makeSphere(6, 10),
    cylinder: makeCylinder(1, 1, 12),
    cone: makeCylinder(0.08, 1, 12),
  };
}

function initWebGL() {
  gl = canvas.getContext('webgl2', { antialias: true, alpha: false }) ||
    canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    showOverlay('需要 WebGL<br />才能进入丛林', '当前浏览器没有可用的 3D 图形加速。请换用最新版 Chrome、Safari 或 Firefox，再重新打开游戏。', '关闭', false);
    modalCopy.classList.add('error-copy');
    startButton.disabled = true;
    return false;
  }
  program = createProgram();
  gl.useProgram(program);
  uniforms = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    projection: gl.getUniformLocation(program, 'uProjection'),
    view: gl.getUniformLocation(program, 'uView'),
    model: gl.getUniformLocation(program, 'uModel'),
    color: gl.getUniformLocation(program, 'uColor'),
    light: gl.getUniformLocation(program, 'uLight'),
    fogColor: gl.getUniformLocation(program, 'uFogColor'),
    cameraPos: gl.getUniformLocation(program, 'uCameraPos'),
    fogNear: gl.getUniformLocation(program, 'uFogNear'),
    fogFar: gl.getUniformLocation(program, 'uFogFar'),
    glow: gl.getUniformLocation(program, 'uGlow'),
    alpha: gl.getUniformLocation(program, 'uAlpha'),
    time: gl.getUniformLocation(program, 'uTime'),
  };
  meshes = createMeshes();
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.027, 0.10, 0.065, 1);
  gl.uniform3fv(uniforms.light, new Float32Array([-0.38, 0.84, 0.44]));
  gl.uniform3fv(uniforms.fogColor, hexToRgb(FOG_COLOR));
  gl.uniform1f(uniforms.fogNear, FOG_NEAR);
  gl.uniform1f(uniforms.fogFar, FOG_FAR);
  return true;
}

/* ===== 矩阵工具 ===== */
function m4Model(x, y, z, sx, sy, sz, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    x, y, z, 1,
  ]);
}

function m4Perspective(out, fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const rangeInv = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (near + far) * rangeInv;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = near * far * 2 * rangeInv;
  out[15] = 0;
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function m4LookAt(out, eye, target, up) {
  const z = normalize3(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  const x = normalize3(
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  );
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
}

/* ===== 绘制原语 ===== */
function drawMesh(mesh, model, color, glow = 0, alpha = 1) {
  if (!gl || !mesh) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
  gl.enableVertexAttribArray(uniforms.position);
  gl.vertexAttribPointer(uniforms.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
  gl.enableVertexAttribArray(uniforms.normal);
  gl.vertexAttribPointer(uniforms.normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
  gl.uniformMatrix4fv(uniforms.model, false, model);
  gl.uniform3fv(uniforms.color, hexToRgb(color));
  gl.uniform1f(uniforms.glow, glow);
  gl.uniform1f(uniforms.alpha, alpha);
  if (alpha < 1) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
  } else {
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawLocal(mesh, base, yaw, lx, ly, lz, sx, sy, sz, color, glow = 0) {
  const point = localPoint(base, yaw, lx, ly, lz);
  drawMesh(mesh, m4Model(point.x, point.y, point.z, sx, sy, sz, yaw), color, glow);
}

function drawShadow(x, z, sx, sz, alpha = 0.34) {
  drawMesh(meshes.lowSphere, m4Model(x, 0.06, z, sx, 0.045, sz), '#07150e', 0, alpha);
}

function drawTree(tree) {
  const trunk = tree.radius * 0.5;
  drawMesh(meshes.cylinder, m4Model(tree.x, tree.height * 0.5, tree.z, trunk, tree.height, trunk), tree.trunk);
  drawMesh(meshes.cone, m4Model(tree.x, tree.height * 0.72, tree.z, tree.radius * 1.55, tree.height * 0.9, tree.radius * 1.55), tree.leaf, 0.02);
  drawMesh(meshes.cone, m4Model(tree.x, tree.height * 0.93, tree.z, tree.radius * 1.05, tree.height * 0.74, tree.radius * 1.05), tree.leaf2, 0.03);
  drawMesh(meshes.cone, m4Model(tree.x, tree.height * 1.10, tree.z, tree.radius * 0.54, tree.height * 0.45, tree.radius * 0.54), tree.leaf3, 0.05);
  if (tree.fruit) {
    drawMesh(meshes.lowSphere, m4Model(tree.x + tree.radius * 0.55, tree.height * 0.77, tree.z + tree.radius * 0.2, 0.13, 0.13, 0.13), tree.fruit, 0.38);
    drawMesh(meshes.lowSphere, m4Model(tree.x - tree.radius * 0.4, tree.height * 0.95, tree.z - tree.radius * 0.4, 0.1, 0.1, 0.1), tree.fruit, 0.38);
  }
}

function drawGround() {
  drawMesh(meshes.cube, m4Model(0, -0.18, 0, WORLD_SIZE, 0.18, WORLD_SIZE), '#123c28');
  groundPatches.forEach((patch) => {
    drawMesh(meshes.lowSphere, m4Model(patch.x, 0.015, patch.z, patch.sx, 0.018, patch.sz, patch.yaw), patch.color, 0);
  });
}

function drawCreature(creature, isPlayer = false) {
  const data = isPlayer ? EVOLUTION_STAGES[player.stage] : PREY_TYPES[creature.type];
  const size = data.size;
  const yaw = creature.yaw;
  const body = { x: creature.x, z: creature.z };
  drawShadow(creature.x, creature.z, size * 1.24, size * 1.44, isPlayer ? 0.42 : 0.27);

  const bob = Math.sin(renderClock * 5.4 + creature.phase) * size * 0.035;
  const bodyY = size * 0.86 + bob;
  drawLocal(meshes.sphere, body, yaw, 0, bodyY, 0, size * 1.02, size * 0.7, size * 1.32, data.body);
  drawLocal(meshes.lowSphere, body, yaw, 0, bodyY + size * 0.04, size * 0.82, size * 0.78, size * 0.56, size * 0.72, data.accent, 0.02);
  drawLocal(meshes.sphere, body, yaw, 0, size * 1.34 + bob, size * 1.02, size * 0.63, size * 0.6, size * 0.62, data.body);
  drawLocal(meshes.lowSphere, body, yaw, 0, size * 1.25 + bob, size * 1.48, size * 0.32, size * 0.26, size * 0.27, data.dark);

  const legY = size * 0.42;
  [[-0.49, -0.55], [0.49, -0.55], [-0.49, 0.55], [0.49, 0.55]].forEach((leg, index) => {
    const lift = Math.sin(renderClock * 6.2 + creature.phase + index * 1.7) * size * 0.045;
    drawLocal(meshes.cube, body, yaw, leg[0] * size, legY + lift, leg[1] * size, size * 0.16, size * 0.42, size * 0.16, data.dark);
    drawLocal(meshes.lowSphere, body, yaw, leg[0] * size, size * 0.19 + lift, leg[1] * size + size * 0.04, size * 0.2, size * 0.1, size * 0.24, data.accent);
  });

  const eyeY = size * 1.56 + bob;
  [-0.23, 0.23].forEach((eyeX) => {
    drawLocal(meshes.lowSphere, body, yaw, eyeX * size, eyeY, size * 1.51, size * 0.105, size * 0.13, size * 0.08, '#09130f', 0.03);
  });

  if (isPlayer) {
    drawPlayerAccents(body, yaw, size, data);
  } else {
    drawPreyAccents(body, yaw, size, data, creature);
  }
}

function drawPlayerAccents(body, yaw, size, data) {
  drawLocal(meshes.cone, body, yaw, 0, size * 1.62, size * 0.82, size * 0.28, size * 0.66, size * 0.28, data.accent, 0.08);
  drawLocal(meshes.lowSphere, body, yaw, 0, size * 1.1, -size * 1.23, size * 0.34, size * 0.34, size * 0.45, data.dark);

  if (player.stage >= 1) {
    [-0.43, 0, 0.43].forEach((x, index) => {
      drawLocal(meshes.cone, body, yaw, x * size, size * 1.72 + Math.abs(index - 1) * size * 0.05, size * 0.33, size * 0.18, size * 0.52, size * 0.18, data.accent, 0.12);
    });
  }
  if (player.stage >= 2) {
    [-0.42, 0.42].forEach((x) => {
      drawLocal(meshes.cone, body, yaw, x * size, size * 1.88, size * 1.12, size * 0.12, size * 0.66, size * 0.12, '#f5e6bb', 0.08);
    });
  }
  if (player.stage >= 3) {
    [-0.42, 0, 0.42].forEach((x, index) => {
      drawLocal(meshes.lowSphere, body, yaw, x * size, size * 2.2 + (index === 1 ? size * 0.1 : 0), size * 1.02, size * 0.16, size * 0.24, size * 0.16, data.glow, 0.46);
    });
  }
}

function drawPreyAccents(body, yaw, size, data, creature) {
  if (data.style === 'beetle') {
    drawLocal(meshes.lowSphere, body, yaw, 0, size * 0.94, size * 0.56, size * 0.72, size * 0.26, size * 0.74, data.dark);
    [-0.2, 0.2].forEach((x) => {
      drawLocal(meshes.lowSphere, body, yaw, x * size, size * 1.5, size * 1.64, size * 0.06, size * 0.06, size * 0.3, data.accent, 0.14);
    });
  } else if (data.style === 'frog') {
    [-0.34, 0.34].forEach((x) => {
      drawLocal(meshes.lowSphere, body, yaw, x * size, size * 1.77, size * 1.07, size * 0.19, size * 0.19, size * 0.19, data.accent, 0.08);
    });
  } else if (data.style === 'monkey') {
    const tailAngle = Math.sin(renderClock * 1.6 + creature.phase) * 0.55;
    drawLocal(meshes.cylinder, body, yaw, 0, size * 0.96, -size * 1.24, size * 0.13, size * 0.9, size * 0.13, data.accent, 0.02);
    drawLocal(meshes.lowSphere, body, yaw, tailAngle * size, size * 1.42, -size * 1.62, size * 0.21, size * 0.21, size * 0.21, data.accent, 0.04);
  } else if (data.style === 'boar') {
    drawLocal(meshes.lowSphere, body, yaw, 0, size * 1.24, size * 1.63, size * 0.37, size * 0.3, size * 0.3, data.accent);
    [-0.3, 0.3].forEach((x) => {
      drawLocal(meshes.cone, body, yaw, x * size, size * 1.2, size * 1.82, size * 0.1, size * 0.24, size * 0.1, '#fff1cf', 0.03);
    });
  } else if (data.style === 'panther') {
    [-0.38, 0.38].forEach((x) => {
      drawLocal(meshes.cone, body, yaw, x * size, size * 1.86, size * 1.03, size * 0.2, size * 0.44, size * 0.2, data.dark, 0.06);
    });
    drawLocal(meshes.lowSphere, body, yaw, 0, size * 1.36, size * 1.62, size * 0.14, size * 0.11, size * 0.08, data.glow, 0.7);
  }
}

function drawPreyMarker(target) {
  const stage = EVOLUTION_STAGES[player.stage];
  const data = PREY_TYPES[target.type];
  if (!target.alive || data.size > stage.eatLimit) return;
  const pulse = 1 + Math.sin(renderClock * 4 + target.phase) * 0.12;
  drawMesh(meshes.lowSphere, m4Model(target.x, 0.11, target.z, data.size * 1.55 * pulse, 0.025, data.size * 1.55 * pulse), data.glow, 0.35, 0.55);
}

function drawParticle(particle) {
  const alpha = clamp(particle.t / particle.max, 0, 1);
  drawMesh(meshes.lowSphere, m4Model(particle.x, particle.y, particle.z, particle.size, particle.size, particle.size), particle.color, particle.glow, alpha);
}

/* ===== 初始化 / 开局 / 结算 ===== */
function createWorld() {
  randomState = 0x1a2b3c4d;
  trees = [];
  groundPatches = [];
  prey = [];
  particles = [];
  totalEaten = 0;
  score = 0;
  elapsed = 0;
  player = {
    x: 0,
    z: 0,
    yaw: 0,
    stage: 0,
    phase: randAngle(),
    shake: 0,
  };

  for (let i = 0; i < 58; i += 1) {
    const angle = randAngle();
    const radius = randRange(5.5, WORLD_LIMIT - 0.5);
    const x = Math.cos(angle) * radius + randRange(-2.2, 2.2);
    const z = Math.sin(angle) * radius + randRange(-2.2, 2.2);
    if (distanceSq(x, z, 0, 0) < 45) continue;
    const height = randRange(3.8, 7.6);
    const base = rand() > 0.48;
    trees.push({
      x,
      z,
      height,
      radius: randRange(1.0, 1.8),
      trunk: base ? '#5e4930' : '#72573a',
      leaf: base ? '#1b6042' : '#276c43',
      leaf2: base ? '#2b8050' : '#3a8b56',
      leaf3: base ? '#65a85b' : '#77b75e',
      fruit: rand() > 0.72 ? '#e8a34d' : null,
    });
  }

  const patchColors = ['#1d5733', '#255e3b', '#2f6b3f', '#17482f', '#4a7741'];
  for (let i = 0; i < 120; i += 1) {
    groundPatches.push({
      x: randRange(-WORLD_LIMIT, WORLD_LIMIT),
      z: randRange(-WORLD_LIMIT, WORLD_LIMIT),
      sx: randRange(0.16, 0.7),
      sz: randRange(0.08, 0.32),
      yaw: randAngle(),
      color: patchColors[Math.floor(rand() * patchColors.length)],
    });
  }

  PREY_LAYOUT.forEach((group) => {
    for (let i = 0; i < group.count; i += 1) spawnPrey(group.type);
  });
}

function findOpenPosition(size = 1) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const x = randRange(-WORLD_LIMIT + 1, WORLD_LIMIT - 1);
    const z = randRange(-WORLD_LIMIT + 1, WORLD_LIMIT - 1);
    if (distanceSq(x, z, 0, 0) < 52) continue;
    const nearTree = trees.some((tree) => distanceSq(x, z, tree.x, tree.z) < (tree.radius + size + 1.1) ** 2);
    const nearPrey = prey.some((other) => other.alive && distanceSq(x, z, other.x, other.z) < (size + other.size + 1.4) ** 2);
    if (!nearTree && !nearPrey) return { x, z };
  }
  return { x: randRange(-WORLD_LIMIT, WORLD_LIMIT), z: randRange(-WORLD_LIMIT, WORLD_LIMIT) };
}

function spawnPrey(type, forcedX = null, forcedZ = null) {
  const data = PREY_TYPES[type];
  if (!data) return null;
  const position = forcedX === null ? findOpenPosition(data.size) : { x: forcedX, z: forcedZ };
  const target = {
    id: prey.length,
    type,
    x: position.x,
    z: position.z,
    yaw: randAngle(),
    phase: randAngle(),
    speed: data.speed,
    turnTimer: randRange(0.8, 2.8),
    bump: 0,
    alive: true,
  };
  prey.push(target);
  return target;
}

function startGame() {
  createWorld();
  state = 'playing';
  hideOverlay();
  pauseButton.textContent = 'Pause';
  showTip('找到发光的猎物，靠近它们即可吞噬。', 3.2);
  syncHud();
}

function finishGame() {
  state = 'win';
  const finalTime = formatTime(elapsed);
  const best = Number(localStorage.getItem('jungle-evolve-best') || 0);
  if (!best || elapsed < best) localStorage.setItem('jungle-evolve-best', String(elapsed));
  showOverlay(
    '树冠<br />霸主',
    '你已经吞噬整片丛林，完成了从藤芽幼兽到树冠霸主的进化。最终用时 ' + finalTime + '，得分 ' + score + '。',
    '再来一局',
    false,
  );
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  pauseButton.textContent = 'Resume';
  showOverlay('暂时<br />休息', '丛林不会消失。准备好后继续移动，找到下一只可以吞噬的猎物。', '继续探索', false);
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  hideOverlay();
  pauseButton.textContent = 'Pause';
}

function togglePause() {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
}

function evolveIfReady() {
  while (player.stage < EVOLUTION_STAGES.length - 1 && totalEaten >= EVOLUTION_STAGES[player.stage + 1].need) {
    player.stage += 1;
    const stage = EVOLUTION_STAGES[player.stage];
    evolutionTimer = 3.2;
    evolutionTitle.textContent = '进化：' + stage.label;
    evolutionSubtitle.textContent = '速度与体型已提升 · 可吞噬更大的猎物';
    evolutionBanner.classList.add('show');
    showTip('你的身体适应了环境。现在可以吞噬 ' + stage.eatLimit.toFixed(1) + ' 体型以内的猎物。', 3.2);
    spawnBurst(player.x, 1.25, player.z, stage.glow, 28);
  }
}

function consume(target) {
  if (!target.alive) return;
  const data = PREY_TYPES[target.type];
  target.alive = false;
  totalEaten += 1;
  score += Math.round(80 + data.size * 100 + player.stage * 40);
  spawnBurst(target.x, data.size * 0.75 + 0.28, target.z, data.glow, 14);
  showTip('吞噬了 ' + data.name + '  ·  继续寻找下一个目标', 1.4);
  evolveIfReady();
  if (player.stage === EVOLUTION_STAGES.length - 1 && !prey.some((item) => item.alive)) {
    finishGame();
  }
}

/* ===== 更新逻辑 ===== */
function isDown(...names) {
  return names.some((name) => keys[name]);
}

function updatePlayer(dt) {
  const turn = (isDown('arrowright', 'd') ? 1 : 0) - (isDown('arrowleft', 'a') ? 1 : 0);
  const forward = (isDown('arrowup', 'w') ? 1 : 0) - (isDown('arrowdown', 's') ? 1 : 0);
  const stage = EVOLUTION_STAGES[player.stage];
  player.yaw += turn * 2.65 * dt;
  const moveSpeed = stage.speed * (isDown('shift') ? 1.16 : 1);
  player.x += Math.sin(player.yaw) * forward * moveSpeed * dt;
  player.z += Math.cos(player.yaw) * forward * moveSpeed * dt;
  player.x = clamp(player.x, -WORLD_LIMIT, WORLD_LIMIT);
  player.z = clamp(player.z, -WORLD_LIMIT, WORLD_LIMIT);
  player.shake = Math.max(0, player.shake - dt);
}

function updatePrey(target, dt) {
  if (!target.alive) return;
  const data = PREY_TYPES[target.type];
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  const canEat = data.size <= EVOLUTION_STAGES[player.stage].eatLimit;
  target.turnTimer -= dt;
  target.bump = Math.max(0, target.bump - dt);

  if (distance < 5.5 && canEat) {
    target.yaw = Math.atan2(dx, dz);
    target.speed = lerp(target.speed, data.speed * 1.8, dt * 3);
  } else if (target.turnTimer <= 0) {
    target.turnTimer = randRange(1.2, 3.8);
    target.yaw += randRange(-1.2, 1.2);
    target.speed = data.speed;
  }

  target.x += Math.sin(target.yaw) * target.speed * dt;
  target.z += Math.cos(target.yaw) * target.speed * dt;
  if (Math.abs(target.x) > WORLD_LIMIT - 1) target.yaw = Math.PI - target.yaw;
  if (Math.abs(target.z) > WORLD_LIMIT - 1) target.yaw = -target.yaw;
  target.x = clamp(target.x, -WORLD_LIMIT + 0.8, WORLD_LIMIT - 0.8);
  target.z = clamp(target.z, -WORLD_LIMIT + 0.8, WORLD_LIMIT - 0.8);
}

function checkCollisions() {
  const stage = EVOLUTION_STAGES[player.stage];
  prey.forEach((target) => {
    if (!target.alive) return;
    const data = PREY_TYPES[target.type];
    const reach = stage.size * 0.88 + data.size * 0.72 + 0.14;
    if (distanceSq(player.x, player.z, target.x, target.z) > reach * reach) return;
    if (data.size <= stage.eatLimit) {
      consume(target);
    } else if (target.bump <= 0) {
      target.bump = 0.8;
      player.shake = 0.18;
      const dx = player.x - target.x;
      const dz = player.z - target.z;
      const length = Math.hypot(dx, dz) || 1;
      player.x = clamp(player.x + (dx / length) * 0.75, -WORLD_LIMIT, WORLD_LIMIT);
      player.z = clamp(player.z + (dz / length) * 0.75, -WORLD_LIMIT, WORLD_LIMIT);
      showTip('它太大了。继续吞噬更小的猎物，先完成下一次进化。', 1.8);
    }
  });
}

function updateParticles(dt) {
  particles.forEach((particle) => {
    particle.t -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    particle.vy -= 2.8 * dt;
  });
  particles = particles.filter((particle) => particle.t > 0);
}

function spawnBurst(x, y, z, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const angle = randAngle();
    const horizontal = randRange(0.35, 1.1);
    particles.push({
      x,
      y,
      z,
      vx: Math.cos(angle) * horizontal,
      vy: randRange(0.5, 1.8),
      vz: Math.sin(angle) * horizontal,
      t: randRange(0.6, 1.2),
      max: 1.2,
      size: randRange(0.035, 0.11),
      color,
      glow: 0.45,
    });
  }
}

function update(dt) {
  if (state !== 'playing') return;
  elapsed += dt;
  updatePlayer(dt);
  prey.forEach((target) => updatePrey(target, dt));
  checkCollisions();
  updateParticles(dt);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) setText(tip, 'W / ↑ 前进 · S / ↓ 后退 · A D / ← → 转向');
  }
  if (evolutionTimer > 0) {
    evolutionTimer -= dt;
    if (evolutionTimer <= 0) evolutionBanner.classList.remove('show');
  }
  syncHud();
}

/* ===== 绘制实现 ===== */
function resizeCanvas() {
  if (!gl) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function updateCamera() {
  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  const distance = 7.2 + player.stage * 0.35;
  camera.x = player.x - forwardX * distance;
  camera.y = 4.2 + player.stage * 0.25;
  camera.z = player.z - forwardZ * distance;
  const target = [player.x + forwardX * 1.8, 1.05 + player.stage * 0.12, player.z + forwardZ * 1.8];
  m4LookAt(view, [camera.x, camera.y, camera.z], target, [0, 1, 0]);
  const aspect = canvas.height ? canvas.width / canvas.height : 1;
  m4Perspective(projection, Math.PI / 3.2, aspect, 0.1, 100);
}

function drawScene() {
  if (!gl || !player) return;
  resizeCanvas();
  updateCamera();
  gl.useProgram(program);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(uniforms.projection, false, projection);
  gl.uniformMatrix4fv(uniforms.view, false, view);
  gl.uniform3fv(uniforms.cameraPos, new Float32Array([camera.x, camera.y, camera.z]));
  gl.uniform1f(uniforms.time, renderClock);
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  drawGround();
  trees.forEach(drawTree);
  prey.forEach((target) => {
    if (target.alive) {
      drawPreyMarker(target);
      drawCreature(target);
    }
  });
  drawCreature(player, true);
  particles.forEach(drawParticle);
  gl.depthMask(true);
}

/* ===== UI 事件 ===== */
function syncHud() {
  if (!player) return;
  const stage = EVOLUTION_STAGES[player.stage];
  const percent = Math.round((totalEaten / TOTAL_PREY) * 100);
  const next = EVOLUTION_STAGES[player.stage + 1];
  const progressText = next
    ? stage.shortLabel + ' → ' + next.shortLabel
    : '最终形态';
  setText(stageValue, stage.shortLabel);
  setText(eatenValue, totalEaten + ' / ' + TOTAL_PREY);
  setText(timeValue, formatTime(elapsed));
  setText(progressValue, progressText + ' · ' + percent + '%');
  progressFill.style.width = percent + '%';
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  keys[key] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (key === 'p') togglePause();
  if (key === ' ' && state === 'menu') startGame();
}

function onKeyUp(event) {
  keys[event.key.toLowerCase()] = false;
}

function bindEvents() {
  startButton.addEventListener('click', () => {
    if (state === 'paused') resumeGame();
    else startGame();
  });
  restartButton.addEventListener('click', startGame);
  pauseButton.addEventListener('click', togglePause);
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });
}

/* ===== 主循环 ===== */
function frame(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  const delta = Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp;
  renderClock += delta;
  accumulator += delta;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  drawScene();
  requestAnimationFrame(frame);
}

/* ===== window.__game 调试接口 ===== */
function clearScene() {
  createWorld();
  state = 'playing';
  hideOverlay();
  syncHud();
}

window.__game = {
  start: startGame,
  advance(seconds) {
    const steps = Math.max(0, Math.floor(seconds * 60));
    for (let i = 0; i < steps; i += 1) update(FIXED_DT);
    drawScene();
  },
  clear: clearScene,
  spawn(type, x = null, z = null) {
    return spawnPrey(type, x, z);
  },
  placeAt(type, x, z) {
    return spawnPrey(type, x, z);
  },
  setPlayer(x, z, yaw = player.yaw) {
    player.x = x;
    player.z = z;
    player.yaw = yaw;
  },
  get state() { return state; },
  get stage() { return player ? player.stage : 0; },
  get score() { return score; },
  get eaten() { return totalEaten; },
  get time() { return elapsed; },
  get player() {
    return player ? { x: player.x, z: player.z, yaw: player.yaw, stage: player.stage } : null;
  },
  get preyList() {
    return prey.map((target) => ({
      id: target.id,
      type: target.type,
      x: target.x,
      z: target.z,
      alive: target.alive,
    }));
  },
};

/* ===== 启动 ===== */
function boot() {
  if (!initWebGL()) return;
  createWorld();
  bindEvents();
  syncHud();
  requestAnimationFrame(frame);
}

boot();
