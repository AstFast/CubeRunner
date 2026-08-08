// skins.js —— 内置预设皮肤库 + 绘制函数
// 每个皮肤是一个绘制函数 draw(ctx, w, h, t)，t 为动画时间（playTime）
// 坐标系已平移到方块中心，需自行应用 squash/stretch（由调用方 scale）

// 预设皮肤注册表（顺序即开始页显示顺序）
window.BUILTIN_SKINS = {
  default: '默认蓝',
  cat:     '猫咪',
  robot:   '机器人',
  ghost:   '幽灵',
  ninja:   '忍者',
  star:    '星星',
  frog:    '青蛙'
};

// 获取所有皮肤 key（含 default）
window.skinKeys = function () { return Object.keys(BUILTIN_SKINS); };

// 绘制指定皮肤到 ctx（已 translate 到中心，未 scale）
// t: 动画时间；state: 'idle'|'jump'，用于表情变化
window.drawSkin = function (key, ctx, w, h, t, st) {
  switch (key) {
    case 'cat':    return drawCat(ctx, w, h, t, st);
    case 'robot':  return drawRobot(ctx, w, h, t, st);
    case 'ghost':  return drawGhost(ctx, w, h, t, st);
    case 'ninja':  return drawNinja(ctx, w, h, t, st);
    case 'star':   return drawStar(ctx, w, h, t, st);
    case 'frog':   return drawFrog(ctx, w, h, t, st);
    default:       return drawDefault(ctx, w, h, t, st);
  }
};

// ---- 各皮肤绘制实现 ----

function drawDefault(ctx, w, h, t, st) {
  const grad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  grad.addColorStop(0, '#7fd8ff'); grad.addColorStop(1, '#5a8bff');
  ctx.fillStyle = grad;
  roundRect(ctx, -w/2, -h/2, w, h, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  roundRect(ctx, -w/2 + 5, -h/2 + 5, w - 22, 8, 4); ctx.fill();
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(-2, -6, 6, 6); ctx.fillRect(10, -6, 6, 6);
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, -5, 2, 2); ctx.fillRect(14, -5, 2, 2);
}

function drawCat(ctx, w, h, t, st) {
  // 橘猫：圆头、三角耳、胡须、粉鼻
  const g = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  g.addColorStop(0, '#ffb066'); g.addColorStop(1, '#e07a2a');
  ctx.fillStyle = g; roundRect(ctx, -w/2, -h/2, w, h, 12); ctx.fill();
  // 耳朵
  ctx.fillStyle = '#e07a2a';
  ctx.beginPath();
  ctx.moveTo(-w/2 + 4, -h/2 + 6); ctx.lineTo(-w/2 + 12, -h/2 - 4); ctx.lineTo(-w/2 + 18, -h/2 + 6); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w/2 - 4, -h/2 + 6); ctx.lineTo(w/2 - 12, -h/2 - 4); ctx.lineTo(w/2 - 18, -h/2 + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff9ae0';
  ctx.beginPath();
  ctx.moveTo(-w/2 + 7, -h/2 + 5); ctx.lineTo(-w/2 + 12, -h/2); ctx.lineTo(-w/2 + 15, -h/2 + 5); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w/2 - 7, -h/2 + 5); ctx.lineTo(w/2 - 12, -h/2); ctx.lineTo(w/2 - 15, -h/2 + 5); ctx.closePath(); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#0a0a1a';
  const blink = (Math.floor(t * 0.05) % 60 === 0) ? 1 : 6;
  ctx.fillRect(-9, -3, 5, blink); ctx.fillRect(6, -3, 5, blink);
  ctx.fillStyle = '#7fd8ff'; ctx.fillRect(-7, -3, 2, 2); ctx.fillRect(8, -3, 2, 2);
  // 鼻子 + 嘴
  ctx.fillStyle = '#ff6bd6';
  ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(2, 4); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#0a0a1a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 9); ctx.moveTo(0, 9); ctx.quadraticCurveTo(-3, 11, -5, 9); ctx.moveTo(0, 9); ctx.quadraticCurveTo(3, 11, 5, 9); ctx.stroke();
  // 胡须
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w/2 + 2, 5); ctx.lineTo(-w/2 - 4, 3); ctx.moveTo(-w/2 + 2, 8); ctx.lineTo(-w/2 - 4, 9);
  ctx.moveTo(w/2 - 2, 5); ctx.lineTo(w/2 + 4, 3); ctx.moveTo(w/2 - 2, 8); ctx.lineTo(w/2 + 4, 9);
  ctx.stroke();
}

function drawRobot(ctx, w, h, t, st) {
  // 机器人：金属灰、天线、独眼屏
  const g = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  g.addColorStop(0, '#b8c4d8'); g.addColorStop(1, '#5a6a8a');
  ctx.fillStyle = g; roundRect(ctx, -w/2, -h/2, w, h, 6); ctx.fill();
  // 天线
  ctx.strokeStyle = '#8a98b0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -h/2); ctx.lineTo(0, -h/2 - 6); ctx.stroke();
  ctx.fillStyle = st === 'jump' ? '#ff5a5a' : '#4dff8a';
  ctx.beginPath(); ctx.arc(0, -h/2 - 7, 2.5, 0, Math.PI*2); ctx.fill();
  // 独眼屏
  ctx.fillStyle = '#0a0a1a'; roundRect(ctx, -w/2 + 6, -8, w - 12, 12, 3); ctx.fill();
  // 扫描光
  const scan = (Math.sin(t * 0.15) + 1) / 2;
  ctx.fillStyle = '#4dd0ff';
  ctx.fillRect(-w/2 + 8 + scan * (w - 18), -6, 4, 8);
  // 嘴（齿轮缝）
  ctx.fillStyle = '#0a0a1a';
  for (let i = 0; i < 3; i++) ctx.fillRect(-6 + i * 5, 8, 3, 4);
  // 螺丝
  ctx.fillStyle = '#3a4a6a';
  ctx.fillRect(-w/2 + 3, -h/2 + 3, 3, 3); ctx.fillRect(w/2 - 6, -h/2 + 3, 3, 3);
  ctx.fillRect(-w/2 + 3, h/2 - 6, 3, 3); ctx.fillRect(w/2 - 6, h/2 - 6, 3, 3);
}

function drawGhost(ctx, w, h, t, st) {
  // 幽灵：半透明白、波浪底、飘动
  ctx.globalAlpha = 0.88;
  const g = ctx.createLinearGradient(0, -h/2, 0, h/2);
  g.addColorStop(0, '#e8e8ff'); g.addColorStop(1, '#b8b8e8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w/2 + 2, -h/2 + 8);
  ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + 8, -h/2);
  ctx.lineTo(w/2 - 8, -h/2);
  ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + 8);
  ctx.lineTo(w/2, h/2 - 6);
  // 波浪底
  const wave = Math.sin(t * 0.1) * 2;
  for (let i = 0; i < 3; i++) {
    const x0 = w/2 - i * (w/3);
    ctx.quadraticCurveTo(x0 - w/6, h/2 + 2 + (i % 2 ? wave : -wave), x0 - w/3, h/2 - 6);
  }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // 眼睛
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(-9, -4, 5, 7); ctx.fillRect(5, -4, 5, 7);
  ctx.fillStyle = '#fff'; ctx.fillRect(-7, -3, 2, 2); ctx.fillRect(7, -3, 2, 2);
  // 嘴（O 形，惊讶）
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath(); ctx.ellipse(0, 6, 3, st === 'jump' ? 5 : 3, 0, 0, Math.PI*2); ctx.fill();
}

function drawNinja(ctx, w, h, t, st) {
  // 忍者：黑头巾、露眼缝、红额带
  ctx.fillStyle = '#1a1a2e'; roundRect(ctx, -w/2, -h/2, w, h, 8); ctx.fill();
  // 红额带
  ctx.fillStyle = '#e02020';
  ctx.fillRect(-w/2, -h/2 + 8, w, 5);
  ctx.fillStyle = '#a01515';
  ctx.fillRect(-w/2, -h/2 + 13, w, 1);
  // 飘带
  const flap = Math.sin(t * 0.2) * 3;
  ctx.fillStyle = '#e02020';
  ctx.beginPath();
  ctx.moveTo(-w/2, -h/2 + 8); ctx.lineTo(-w/2 - 6, -h/2 + 12 + flap); ctx.lineTo(-w/2 - 4, -h/2 + 16 + flap); ctx.lineTo(-w/2, -h/2 + 13); ctx.closePath(); ctx.fill();
  // 眼缝
  ctx.fillStyle = '#fff';
  ctx.fillRect(-10, 0, 7, 3); ctx.fillRect(4, 0, 7, 3);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(-8 + (st === 'jump' ? 1 : 0), 0, 3, 3); ctx.fillRect(6 + (st === 'jump' ? 1 : 0), 0, 3, 3);
  // 嘴
  ctx.strokeStyle = '#6a6a8a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2, 10); ctx.lineTo(2, 10); ctx.stroke();
}

function drawStar(ctx, w, h, t, st) {
  // 星星：金色五角星、旋转高光
  ctx.save();
  ctx.rotate(t * 0.02);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w/2);
  g.addColorStop(0, '#ffe89a'); g.addColorStop(1, '#ffb820');
  ctx.fillStyle = g;
  ctx.beginPath();
  const R = w/2 - 2, r = R * 0.45;
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI/2;
    const rad = i % 2 === 0 ? R : r;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  // 笑脸
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(-7, -3, 4, 5); ctx.fillRect(4, -3, 4, 5);
  ctx.fillStyle = '#fff'; ctx.fillRect(-6, -3, 2, 2); ctx.fillRect(5, -3, 2, 2);
  ctx.strokeStyle = '#0a0a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 4, 4, 0, Math.PI); ctx.stroke();
  ctx.restore();
}

function drawFrog(ctx, w, h, t, st) {
  // 青蛙：绿身、凸眼、红嘴
  const g = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  g.addColorStop(0, '#7fd84d'); g.addColorStop(1, '#3a8a2a');
  ctx.fillStyle = g; roundRect(ctx, -w/2, -h/2, w, h, 14); ctx.fill();
  // 凸眼
  ctx.fillStyle = '#5ab83a';
  ctx.beginPath(); ctx.arc(-8, -h/2, 6, 0, Math.PI*2); ctx.arc(8, -h/2, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-8, -h/2, 4, 0, Math.PI*2); ctx.arc(8, -h/2, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#0a0a1a';
  const look = st === 'jump' ? -1 : 0;
  ctx.beginPath(); ctx.arc(-8 + look, -h/2, 2, 0, Math.PI*2); ctx.arc(8 + look, -h/2, 2, 0, Math.PI*2); ctx.fill();
  // 红嘴
  ctx.strokeStyle = '#c02020'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (st === 'jump') { ctx.arc(0, 6, 4, 0, Math.PI*2); }   // 张嘴
  else { ctx.moveTo(-6, 6); ctx.quadraticCurveTo(0, 10, 6, 6); }
  ctx.stroke();
  // 斑点
  ctx.fillStyle = '#2a6a1a';
  ctx.beginPath(); ctx.arc(-w/2 + 8, 4, 2, 0, Math.PI*2); ctx.arc(w/2 - 8, 4, 2, 0, Math.PI*2); ctx.fill();
}

// 工具：圆角矩形路径（不 fill，由调用方 fill）
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
