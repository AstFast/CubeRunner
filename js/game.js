// game.js —— 游戏主体逻辑
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;   // 自适应：大屏降 DPR 减少渲染像素

  // ------- Layout / responsive -------
  // 背景/危险墙锯齿离屏位图缓存：渐变与复杂路径只画一次，主循环 drawImage 贴片
  let bgCanvas = null, wallImg = null, wallImgH = 0;
  function buildGradients() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    const bc = bgCanvas.getContext('2d');
    bc.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sky = bc.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#171736'); sky.addColorStop(0.6, '#1f1a44'); sky.addColorStop(1, '#2a2150');
    bc.fillStyle = sky; bc.fillRect(0, 0, W, H);
    const gy = H - Math.max(70, H * 0.12);
    const ground = bc.createLinearGradient(0, gy, 0, H);
    ground.addColorStop(0, '#3a2f6b'); ground.addColorStop(1, '#15102e');
    bc.fillStyle = ground; bc.fillRect(0, gy, W, H - gy);
    // 危险墙整体贴图：3 段红色 + 锯齿预渲染成一张（形状固定、仅 x 平移），每帧一次 drawImage
    // 按物理像素创建，绘制时 scale(DPR) 保证 drawImage 后 1:1 清晰
    const sh = Math.max(1, Math.floor(gy));
    wallImgH = sh;
    const WALL_W = 66;   // 50 墙宽 + 12 锯齿 + 4 余量
    wallImg = document.createElement('canvas');
    wallImg.width = Math.ceil(WALL_W * DPR); wallImg.height = Math.ceil(sh * DPR);
    const sc = wallImg.getContext('2d');
    sc.scale(DPR, DPR);
    sc.fillStyle = 'rgba(255,60,60,.2)';    sc.fillRect(0, 0, 15, sh);
    sc.fillStyle = 'rgba(255,70,70,.85)';   sc.fillRect(15, 0, 20, sh);
    sc.fillStyle = 'rgba(255,120,120,.95)'; sc.fillRect(35, 0, 15, sh);
    sc.fillStyle = '#ff4d4d';
    sc.beginPath();
    for (let y = 0; y < sh; y += 18) { sc.moveTo(50, y); sc.lineTo(62, y + 9); sc.lineTo(50, y + 18); }
    sc.fill();
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    // 自适应 DPR：小屏高分屏用 2 保证清晰，大屏降到 1.5/1 减少渲染像素
    const screenPx = W * H;
    DPR = screenPx > 1600000 ? 1 : (screenPx > 800000 ? 1.5 : Math.min(window.devicePixelRatio || 1, 2));
    // 物理像素上限：2K/4K 等超高分辨率再降 DPR，避免全屏重绘压垮 GPU（画面略糊但保帧率）
    const MAX_PX = 2500000;
    if (W * H * DPR * DPR > MAX_PX) DPR = Math.max(0.5, Math.sqrt(MAX_PX / (W * H)));
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGradients();
  }
  window.addEventListener('resize', resize); resize();

  // ------- Game constants -------
  const STATE = { START: 0, PLAY: 1, OVER: 2 };
  let state = STATE.START;

  let groundY;
  const playerX = () => Math.max(120, W * 0.26);

  const player = { x: 0, y: 0, w: 44, h: 44, vy: 0, onGround: true, jumps: 0, squash: 1, rot: 0, hitFlash: 0 };

  // 物理（从 cfg 同步）
  let GRAVITY = cfg.gravity;
  let JUMP_V  = -cfg.jump;
  let MAX_JUMPS = cfg.jumps;
  let SPEED_MAX = cfg.speedMax;

  let speed = cfg.speed;
  let distance = 0;
  let score = 0;
  let best = 0;
  try { best = +localStorage.getItem('cubeRunnerBest') || 0; } catch (e) { /* 隐私模式/禁用存储时降级 */ }

  const wall = { x: -80 };
  let boost = 0;

  let hazards = [], softs = [], coins = [], powerups = [], particles = [];
  let clouds = [], hills = [];

  let hazTimer = 0, softTimer = 0, coinTimer = 0, powTimer = 0;
  let playTime = 0;
  let coinScore = 0;

  let shield = 0, magnet = 0, scoreMult = 0, scoreMultVal = 1;
  let slowmo = 0;

  const POW = { COIN: 'coin', SHIELD: 'shield', MAGNET: 'magnet', MYSTERY: 'mystery' };

  // ------- Helpers -------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const MAX_PARTICLES = 180;   // 粒子上限
  // 就地过滤（避免每帧创建新数组触发 GC）
  function siftInPlace(arr, keep) {
    let w = 0;
    for (let r = 0; r < arr.length; r++) { if (keep(arr[r])) arr[w++] = arr[r]; }
    arr.length = w;
  }
  function addParticle(p) {
    p.a = 1;   // 新粒子初始透明度（updateParticles 后续维护）
    if (particles.length >= MAX_PARTICLES) return;   // 满载直接丢弃，避免数组无限增长
    particles.push(p);
  }

  // 浮动提示（暴露给 config.js 用）—— 限制频率避免 DOM 爆炸
  const floatLayer = document.getElementById('floatMsgs');
  let floatCount = 0;
  window.floatMsg = function (text, x, y, color) {
    if (floatCount > 8) return;   // 同时最多 8 个浮动提示
    floatCount++;
    const el = document.createElement('div');
    el.className = 'floatMsg'; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.color = color;
    floatLayer.appendChild(el);
    setTimeout(() => { el.remove(); floatCount--; }, 1000);
  };

  // 内置皮肤离屏缓存：每 N 帧重绘一次，避免每帧创建渐变+复杂路径
  let skinCache = null, skinCacheKey = '', skinCacheFrame = -999;
  const SKIN_REFRESH = 4;   // 每 4 帧刷新一次皮肤动画（动画降频 75%，肉眼几乎无差）
  const scoreValEl = document.getElementById('score').querySelector('.val');  // 缓存，避免每帧查询
  const powerbar = document.getElementById('powerbar');  // 显式缓存道具栏元素
  let lastScore = -1;
  let lastBarHTML = '';
  function updatePowerbar() {
    let html = '';
    if (shield > 0)  html += `<div class="pchip shield"><span class="dot"></span>护盾</div>`;
    if (magnet > 0)  html += `<div class="pchip magnet"><span class="dot"></span>磁铁 ${Math.ceil(magnet/60)}s</div>`;
    if (scoreMult > 0) html += `<div class="pchip" style="border-color:rgba(255,216,77,.5)"><span class="dot" style="background:#ffd84d;box-shadow:0 0 8px #ffd84d"></span>×${scoreMultVal}分</div>`;
    if (boost > 0)   html += `<div class="pchip" style="border-color:rgba(127,216,255,.5)"><span class="dot" style="background:#7fd8ff;box-shadow:0 0 8px #7fd8ff"></span>加速</div>`;
    if (html === lastBarHTML) return;   // 内容未变化不重写 DOM，避免连续吃金币时频繁重建
    lastBarHTML = html;
    powerbar.innerHTML = html;
  }

  function reset() {
    groundY = H - Math.max(70, H * 0.12);
    player.x = playerX();
    player.y = groundY - player.h;
    player.vy = 0; player.onGround = true; player.jumps = 0; player.squash = 1; player.rot = 0; player.hitFlash = 0;
    speed = cfg.speed; distance = 0; score = 0; coinScore = 0; playTime = 0;
    wall.x = -80;
    boost = 0;
    shield = 0; magnet = 0; scoreMult = 0; scoreMultVal = 1; slowmo = 0;
    hazards = []; softs = []; coins = []; powerups = []; particles = [];
    hazTimer = 80; softTimer = 120; coinTimer = 50; powTimer = 240;
    clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ x: rand(0, W), y: rand(40, H*0.4), s: rand(0.6,1.4), v: rand(0.3,0.8) });
    hills = [];
    for (let i = 0; i < 8; i++) hills.push({ x: rand(0, W), w: rand(140, 260), h: rand(60, 140) });
    updatePowerbar();
  }

  // 移动端全屏：隐藏地址栏/浏览器 UI 进入沉浸模式（iOS Safari 无 Fullscreen API，静默降级）
  // try/catch 双保险：全屏请求 pending/被拒时浏览器可能同步抛异常，绝不能中断输入处理
  function requestFullscreen() {
    const el = document.documentElement;
    if (typeof el.requestFullscreen !== 'function' || document.fullscreenElement) return;
    try {
      const p = el.requestFullscreen();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* pending 或权限拒绝：忽略 */ }
  }

  function startGame() {
    requestFullscreen();   // 移动端进入全屏沉浸模式（不支持时静默降级）
    reset();
    state = STATE.PLAY;
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
  }

  function gameOver(reason) {
    state = STATE.OVER;
    if (score > best) { best = score; try { localStorage.setItem('cubeRunnerBest', best); } catch (e) {} }
    document.getElementById('overReason').textContent = reason;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalBest').textContent = '最高分 ' + best;
    document.getElementById('best').querySelector('.val').textContent = best;
    document.getElementById('overScreen').classList.remove('hidden');
    for (let i = 0; i < 44; i++) {
      addParticle({ x: player.x + player.w/2, y: player.y + player.h/2,
        vx: rand(-7,7), vy: rand(-9,2), life: rand(30,60), max: 60,
        c: reason.includes('障碍') ? '#ff5a5a' : '#ff8a3a', size: rand(3,7) });
    }
    updatePowerbar();
  }

  function jump() {
    if (state !== STATE.PLAY) return;
    if (rotateHint && !rotateHint.classList.contains('hidden')) return;   // 提示层可见时冻结输入（防解冻瞬间凭空起跳）
    if (player.jumps < MAX_JUMPS) {
      player.vy = JUMP_V * (player.jumps === 0 ? 1 : 0.85);
      player.jumps++;
      player.onGround = false;
      player.squash = 0.7;
      if (player.jumps === 1)
        for (let i = 0; i < 8; i++)
          addParticle({ x: player.x + rand(0,player.w), y: groundY,
            vx: rand(-2,2), vy: rand(-1,-3), life: 20, max: 20, c: '#5a5a8a', size: rand(2,4) });
    }
  }

  // ------- Spawning -------
  function spawnHazard() {
    const variants = [ { w: 26, h: 38 }, { w: 40, h: 30 }, { w: 22, h: 56 }, { w: 60, h: 26 } ];
    const v = variants[(Math.random() * variants.length) | 0];
    const hue = rand(0, 20) | 0;
    hazards.push({ x: W + 40, w: v.w, h: v.h, col1: `hsl(${10+hue},90%,62%)`, col2: `hsl(${hue},85%,42%)` });
  }
  function spawnSoft() {
    const variants = [ { w: 50, h: 26 }, { w: 70, h: 20 }, { w: 40, h: 34 } ];
    const v = variants[(Math.random() * variants.length) | 0];
    softs.push({ x: W + 40, w: v.w, h: v.h });
  }
  function spawnCoinCluster() {
    const baseY = groundY - rand(70, 150);
    const n = 3 + ((Math.random()*3)|0);
    const arc = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const y = arc ? baseY - Math.sin((i/(n-1))*Math.PI) * 50 : baseY;
      coins.push({ x: W + 40 + i * 34, y, r: 13, taken: false, t: rand(0, Math.PI*2) });
    }
  }
  function spawnPowerup() {
    const types = [POW.SHIELD, POW.MAGNET, POW.MYSTERY];
    const type = types[(Math.random() * types.length) | 0];
    const y = groundY - rand(75, 140);
    powerups.push({ x: W + 40, y, type, t: 0, r: 18 });
  }

  // ------- 道具效果 -------
  function applyPowerup(p) {
    if (p.type === POW.SHIELD) {
      shield = 1;
      floatMsg('护盾！', p.x, p.y, '#4dd0ff');
      for (let i = 0; i < 20; i++) addParticle({ x: p.x, y: p.y, vx: rand(-6,6), vy: rand(-6,6), life: 30, max: 30, c: '#4dd0ff', size: rand(2,5) });
    } else if (p.type === POW.MAGNET) {
      magnet = 60 * 6;
      floatMsg('磁铁！', p.x, p.y, '#ff6bd6');
      for (let i = 0; i < 20; i++) addParticle({ x: p.x, y: p.y, vx: rand(-6,6), vy: rand(-6,6), life: 30, max: 30, c: '#ff6bd6', size: rand(2,5) });
    } else if (p.type === POW.MYSTERY) {
      const r = Math.random();
      if (r < 0.35) { scoreMultVal = 2; scoreMult = 60 * 8; floatMsg('双倍得分！', p.x, p.y, '#ffd84d'); }
      else if (r < 0.6) { slowmo = 60 * 4; floatMsg('时间减速！', p.x, p.y, '#9affc4'); }
      else if (r < 0.85) { boost = 60 * 2; wall.x -= 120; floatMsg('超级加速！', p.x, p.y, '#7fd8ff'); }
      else { coinScore += 100; floatMsg('+100 神秘分！', p.x, p.y, '#ffd84d'); }
      for (let i = 0; i < 28; i++) addParticle({ x: p.x, y: p.y, vx: rand(-7,7), vy: rand(-7,7), life: 40, max: 40, c: ['#ffd84d','#ff6bd6','#7fd8ff','#9affc4'][i%4], size: rand(2,6) });
    }
    updatePowerbar();
  }

  // ------- Input -------
  // 统一用 Pointer Events：鼠标/触摸/笔一次物理输入只触发一次 jump，无兼容事件双跳；
  // touch-action:none 已确保无 300ms 延迟，快速连跳每次点击都会响应
  function onInput(e) { if (e) e.preventDefault(); if (state === STATE.PLAY) jump(); }
  let fullscreenTried = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;   // 多指触控只响应主触点，避免误触消耗二段跳
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 忽略右键/中键
    onInput(e);   // 先响应跳跃，全屏请求放其后，避免任何异常影响输入
    if (!fullscreenTried) { fullscreenTried = true; requestFullscreen(); }   // URL 自动启动等无手势场景：首次点击补请求全屏
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;   // 输入框聚焦时不拦截按键
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      if (e.repeat) { e.preventDefault(); return; }   // 长按重复同样阻止默认（防按钮激活），避免瞬间耗尽二段跳
      e.preventDefault(); onInput();
    }
    if (e.code === 'Enter' && state !== STATE.PLAY) { e.preventDefault(); startGame(); }   // 阻止按钮默认激活导致二次 startGame
  });
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', startGame);

  // ------- Update -------
  function update() {
    if (state !== STATE.PLAY) { updateParticles(); return; }
    // 竖屏提示层可见时冻结游戏：玩家无法操作，避免被危险墙推死
    if (rotateHint && !rotateHint.classList.contains('hidden')) { updateParticles(); return; }
    playTime++;
    const worldMul = slowmo > 0 ? 0.55 : 1;
    speed = Math.min(SPEED_MAX, cfg.speed + playTime * cfg.speedGrow);
    // 拾取加速三要素（推墙力度/时长/自身倍率）：默认渐近收敛——随时间平滑逼近上限、增长因子递减 → 0；
    // 可经 config 的 boostEase=false（或 URL ?boostease=0）关闭，改回 base + t*grow 线性递增
    let boostPush, boostTimeCap, boostMul;
    if (cfg.boostEase) {
      boostPush    = cfg.boostPushMax     - (cfg.boostPushMax     - cfg.boostPushBase)    * Math.exp(-cfg.boostEaseRate * playTime);
      boostTimeCap = cfg.boostTimeMax     - (cfg.boostTimeMax     - cfg.boostTimeBase)    * Math.exp(-cfg.boostEaseRate * playTime);
      boostMul     = cfg.boostSpeedMulMax - (cfg.boostSpeedMulMax - cfg.boostSpeedMul)    * Math.exp(-cfg.boostEaseRate * playTime);
    } else {
      boostPush    = Math.min(cfg.boostPushMax,     cfg.boostPushBase    + playTime * cfg.boostPushGrow);
      boostTimeCap = Math.min(cfg.boostTimeMax,     cfg.boostTimeBase    + playTime * cfg.boostTimeGrow);
      boostMul     = Math.min(cfg.boostSpeedMulMax, cfg.boostSpeedMul    + playTime * cfg.boostSpeedMulGrow);
    }
    const effSpeed = speed * (boost > 0 ? boostMul : 1) * worldMul;
    distance += effSpeed * 0.05;
    score = Math.floor(distance) + coinScore;
    // DOM 节流：每 4 帧同步一次分数，减少 HUD 重排
    if (score !== lastScore && (playTime & 3) === 0) { scoreValEl.textContent = score; lastScore = score; }

    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y + player.h >= groundY) {
      if (!player.onGround) player.squash = 1.35;
      player.y = groundY - player.h; player.vy = 0; player.onGround = true; player.jumps = 0;
    }
    player.squash += (1 - player.squash) * 0.2;
    player.rot += player.onGround ? 0 : 0.18;
    if (player.onGround) player.rot *= 0.82;   // 落地后旋转平滑回正，避免累积
    if (player.hitFlash > 0) player.hitFlash--;

    if (boost > 0) { boost -= cfg.boostDecay; if (boost <= 0) { boost = 0; updatePowerbar(); } }
    if (magnet > 0) { magnet--; if (magnet === 0) updatePowerbar(); }
    if (scoreMult > 0) { scoreMult--; if (scoreMult === 0) { scoreMultVal = 1; updatePowerbar(); } }
    if (slowmo > 0) slowmo--;

    // 危险墙速度：默认渐近收敛——增长因子 (wallMax - 当前速度) 随时间递减 → 0，速度平滑逼近上限；
    // 可经 config 的 wallEase=false（或 URL ?wallease=0）关闭，改回 wallGrow/wallGrow2 线性增长
    let wallSpeed;
    if (cfg.wallEase) {
      wallSpeed = cfg.wallMax - (cfg.wallMax - cfg.wallStart) * Math.exp(-cfg.wallEaseRate * playTime);
      if (cfg.wallMax - wallSpeed < 0.02) wallSpeed = cfg.wallMax;   // 几乎到达上限即锁定，增长因子归 0
    } else {
      wallSpeed = Math.min(cfg.wallMax, cfg.wallStart + playTime * (cfg.wallGrow + playTime * cfg.wallGrow2));
    }
    wall.x += wallSpeed * worldMul - (boost > 0 ? boostPush : 0);
    if (wall.x < -80) wall.x = -80;
    if (wall.x + 18 >= player.x) { gameOver('被危险墙推到左边出界了！'); return; }

    hazTimer -= 1;
    if (hazTimer <= 0) { spawnHazard(); hazTimer = rand(70, 120) - clamp(playTime*0.018, 0, 30); }
    softTimer -= 1;
    if (softTimer <= 0) { spawnSoft(); softTimer = rand(90, 160); }
    coinTimer -= 1;
    if (coinTimer <= 0) { spawnCoinCluster(); coinTimer = rand(60, 120); }
    powTimer -= 1;
    if (powTimer <= 0) { spawnPowerup(); powTimer = rand(260, 460); }

    for (const o of hazards) o.x -= effSpeed;
    for (const o of softs)   o.x -= effSpeed;
    for (const c of coins)   { c.x -= effSpeed; c.t += 0.1; }
    for (const p of powerups){ p.x -= effSpeed; p.t += 0.12; }
    siftInPlace(hazards,  o => o.x + o.w > -20);
    siftInPlace(softs,    o => o.x + o.w > -20);
    siftInPlace(coins,    c => c.x + c.r > -20);
    siftInPlace(powerups, p => p.x + p.r > -20);

    const px = player.x, py = player.y, pw = player.w, ph = player.h;

    if (magnet > 0) {
      const cx = px + pw/2, cy = py + ph/2;
      for (const c of coins) {
        if (c.taken) continue;
        const dx = cx - c.x, dy = cy - c.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 220) { c.x += dx/d * 8; c.y += dy/d * 8; }
      }
    }

    for (const o of hazards) {
      const oy = groundY - o.h;
      if (px + pw - 6 > o.x && px + 6 < o.x + o.w && py + ph - 6 > oy) {
        if (shield > 0) {
          shield = 0; updatePowerbar();
          floatMsg('护盾抵挡！', player.x + pw/2, py, '#4dd0ff');
          o.x -= 80; player.hitFlash = 12;
          for (let i = 0; i < 24; i++) addParticle({ x: player.x + pw/2, y: py + ph/2, vx: rand(-6,6), vy: rand(-6,6), life: 26, max: 26, c: '#4dd0ff', size: rand(2,5) });
        } else { gameOver('撞上障碍物了！'); return; }
      }
    }

    for (const o of softs) {
      const oy = groundY - o.h;
      if (px + pw - 6 > o.x && px + 6 < o.x + o.w && py + ph - 6 > oy) {
        player.vy = -8; player.onGround = false; player.jumps = 1;
        wall.x += 36; coinScore = Math.max(0, coinScore - 5);
        floatMsg('-5 碰到障碍', o.x, oy, '#ff9a3a');
        o.x = -999; player.hitFlash = 10;
        for (let i = 0; i < 16; i++) addParticle({ x: player.x + pw/2, y: oy, vx: rand(-5,5), vy: rand(-6,1), life: 24, max: 24, c: '#ff9a3a', size: rand(2,5) });
      }
    }
    siftInPlace(softs, o => o.x > -100);

    for (const c of coins) {
      if (c.taken) continue;
      const cx = px + pw/2, cy = py + ph/2;
      const dx = cx - c.x, dy = cy - c.y;
      if (dx*dx + dy*dy < (c.r + 18) * (c.r + 18)) {
        c.taken = true;
        const gain = 10 * scoreMultVal;
        coinScore += gain;
        boost = Math.max(boost, Math.min(cfg.boostTimeMax, boostTimeCap));
        updatePowerbar();
        for (let i = 0; i < 14; i++) addParticle({ x: c.x, y: c.y, vx: rand(-5,5), vy: rand(-6,2), life: 28, max: 28, c: '#ffd84d', size: rand(2,5) });
      }
    }
    siftInPlace(coins, c => !c.taken);

    for (const p of powerups) {
      if (p.taken) continue;
      const cx = px + pw/2, cy = py + ph/2;
      const dx = cx - p.x, dy = cy - p.y;
      if (dx*dx + dy*dy < (p.r + 22) * (p.r + 22)) { p.taken = true; applyPowerup(p); }
    }
    siftInPlace(powerups, p => !p.taken);

    for (const cl of clouds) { cl.x -= cl.v * worldMul; if (cl.x < -80) { cl.x = W + 80; cl.y = rand(40, H*0.4); } }
    for (const h of hills) { h.x -= effSpeed * 0.25; if (h.x + h.w < 0) { h.x = W + rand(0,80); h.w = rand(140,260); h.h = rand(60,140); } }
    updateParticles();
  }

  function updateParticles() {
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--; p.a = p.life / (p.max || p.life || 1); }
    siftInPlace(particles, p => p.life > 0);
  }

  // 粒子分组复用对象（避免每帧创建新对象触发 GC）
  const _pgroups = {}, _pgKeys = [];
  const _abuckets = []; for (let i = 0; i < 8; i++) _abuckets.push([]);   // alpha 8 档分桶复用

  // ------- Render -------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);   // 5 参数显式目标尺寸，避免 DPR 放大
    else { ctx.fillStyle = '#171736'; ctx.fillRect(0, 0, W, H); }
    if (slowmo > 0) { ctx.fillStyle = 'rgba(120,255,200,0.06)'; ctx.fillRect(0,0,W,H); }

    // 星点（位置固定，批量单次 fill）
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137.5) % W, sy = (i * 53.3) % (H * 0.55);
      ctx.rect(sx, sy, 1.5, 1.5);
    }
    ctx.fill();
    // 远山（批量单次 fill）
    ctx.fillStyle = 'rgba(90,80,150,.55)';
    ctx.beginPath();
    for (const h of hills) {
      ctx.moveTo(h.x, groundY); ctx.lineTo(h.x + h.w/2, groundY - h.h); ctx.lineTo(h.x + h.w, groundY);
    }
    ctx.fill();
    // 云朵（简化：每朵用 2 个椭圆代替 3 个）
    for (const cl of clouds) {
      ctx.fillStyle = `rgba(220,220,255,${0.12 * cl.s})`;
      ctx.beginPath();
      ctx.ellipse(cl.x, cl.y, 32*cl.s, 15*cl.s, 0, 0, Math.PI*2);
      ctx.ellipse(cl.x+22*cl.s, cl.y+3*cl.s, 22*cl.s, 12*cl.s, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
    ctx.strokeStyle = 'rgba(127,216,255,.18)'; ctx.lineWidth = 1;
    const off = (distance * 20) % 40;
    ctx.beginPath();
    for (let x = -off; x < W; x += 40) { ctx.moveTo(x, groundY + 6); ctx.lineTo(x + 20, groundY + 6); }
    ctx.stroke();

    drawWall();
    for (const o of softs) drawSoft(o);
    for (const o of hazards) drawHazard(o);
    for (const c of coins) drawCoin(c);
    for (const p of powerups) drawPowerup(p);
    drawPlayer();

    // 粒子：按颜色分组（复用对象，避免每帧 GC）
    _pgKeys.length = 0;
    for (const k in _pgroups) _pgroups[k].length = 0;
    for (const p of particles) {
      const k = p.c;
      if (!_pgroups[k]) { _pgroups[k] = []; _pgKeys.push(k); }
      _pgroups[k].push(p);
    }
    for (let i = 0; i < _pgKeys.length; i++) {
      const k = _pgKeys[i];
      const arr = _pgroups[k];
      if (arr.length === 0) continue;
      ctx.fillStyle = k;
      for (let b = 0; b < 8; b++) _abuckets[b].length = 0;
      for (let j = 0; j < arr.length; j++) _abuckets[Math.min(7, (arr[j].a * 8) | 0)].push(arr[j]);
      for (let b = 7; b >= 0; b--) {
        const ba = _abuckets[b];
        if (ba.length === 0) continue;
        ctx.globalAlpha = (b + 0.5) / 8;   // 档位中值，寿命末段淡出更平滑
        ctx.beginPath();
        for (let j = 0; j < ba.length; j++) {
          const p = ba[j];
          ctx.rect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (boost > 0) {
      ctx.fillStyle = `rgba(127,216,255,${boost/40})`;
      ctx.fillRect(player.x - 30, player.y, 28, player.h);
    }

    // 皮肤状态诊断（左上角小字，帮助排查自定义皮肤问题；调试完成后可移除）
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (cfg.skin && cfg.skin.startsWith('url:')) {
      ctx.fillText(skinReady ? '皮肤:自定义' : (skinFailed ? '皮肤:加载失败' : '皮肤:加载中…'), 10, 42);
    } else {
      ctx.fillText('皮肤:' + (cfg.skin || '默认'), 10, 42);
    }
  }

  function drawPlayer() {
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    if (shield > 0) {
      ctx.fillStyle = `rgba(77,208,255,${0.15 + Math.sin(playTime*0.2)*0.05})`;
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(77,208,255,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI*2); ctx.stroke();
    }
    ctx.translate(cx, cy);
    ctx.rotate(player.onGround ? 0 : player.rot);
    const sx = player.squash, sy = 2 - player.squash;
    ctx.scale(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-player.w/2 + 3, -player.h/2 + 3, player.w, player.h);

    // 根据皮肤类型绘制
    if (cfg.skin && cfg.skin.startsWith('url:') && skinReady && skinCanvas) {
      // 自定义图片皮肤：用预缩放的离屏 canvas，避免每帧缩放大图
      ctx.drawImage(skinCanvas, -player.w/2, -player.h/2, player.w, player.h);
    } else {
      // 内置预设皮肤（含 default）：缓存到离屏 canvas，每 N 帧刷新动画
      const skinKey = (cfg.skin && !cfg.skin.startsWith('url:') && BUILTIN_SKINS[cfg.skin]) ? cfg.skin : 'default';
      const st = player.onGround ? 'idle' : 'jump';
      const cacheKey = skinKey + '|' + st;
      if (!skinCache || skinCacheKey !== cacheKey || playTime - skinCacheFrame >= SKIN_REFRESH) {
        if (!skinCache) { skinCache = document.createElement('canvas'); }
        const sz = 48;
        skinCache.width = sz; skinCache.height = sz;
        const sc = skinCache.getContext('2d');
        sc.clearRect(0, 0, sz, sz);
        sc.save(); sc.translate(sz/2, sz/2);
        drawSkin(skinKey, sc, player.w, player.h, playTime, st);
        sc.restore();
        skinCacheKey = cacheKey; skinCacheFrame = playTime;
      }
      ctx.drawImage(skinCache, -player.w/2, -player.h/2, player.w, player.h);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);   // 还原 translate/rotate/scale
    if (player.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${player.hitFlash/12 * 0.5})`;
      roundRect(player.x, player.y, player.w, player.h, 9); ctx.fill();
    }
  }

  function drawHazard(o) {
    const x = o.x, y = groundY - o.h;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 3, y + 3, o.w, o.h);
    ctx.fillStyle = o.col2; roundRect(x, y, o.w, o.h, 5); ctx.fill();
    ctx.fillStyle = o.col1; roundRect(x, y, o.w, o.h * 0.45, 5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < o.w; i += 10) { ctx.moveTo(x + i, y); ctx.lineTo(x + i + 5, y - 8); ctx.lineTo(x + i + 10, y); }
    ctx.fill();
  }

  function drawSoft(o) {
    const x = o.x, y = groundY - o.h;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 3, y + 3, o.w, o.h);
    ctx.fillStyle = '#e07a2a'; roundRect(x, y, o.w, o.h, 8); ctx.fill();
    ctx.fillStyle = '#ffb066'; roundRect(x, y, o.w, o.h * 0.45, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.moveTo(x + o.w/2, y - 6); ctx.lineTo(x + o.w/2 - 6, y + 2); ctx.lineTo(x + o.w/2 + 6, y + 2);
    ctx.closePath(); ctx.fill();
  }

  function drawCoin(c) {
    const pulse = 1 + Math.sin(c.t) * 0.08;
    ctx.fillStyle = 'rgba(255,216,77,.18)'; ctx.beginPath(); ctx.arc(c.x, c.y, 28 * pulse, 0, Math.PI*2); ctx.fill();
    ctx.translate(c.x, c.y); ctx.rotate(c.t * 0.5);
    const s = 13 * pulse;
    ctx.fillStyle = '#ffb820'; roundRect(-s, -s, s*2, s*2, 4); ctx.fill();
    ctx.fillStyle = '#ffe89a'; roundRect(-s, -s, s*2, s, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; roundRect(-s+3, -s+3, s, 4, 2); ctx.fill();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);   // 还原 translate/rotate，避免 save/restore 开销
  }

  function drawPowerup(p) {
    const pulse = 1 + Math.sin(p.t * 2) * 0.12;
    let col1, col2, icon;
    if (p.type === POW.SHIELD) { col1 = '#7fe0ff'; col2 = '#3aa8ff'; icon = 'S'; }
    else if (p.type === POW.MAGNET) { col1 = '#ff9ae0'; col2 = '#e23bb8'; icon = 'M'; }
    else { col1 = '#ffe89a'; col2 = '#b266ff'; icon = '?'; }
    ctx.globalAlpha = 0.4; ctx.fillStyle = col1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 * pulse, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.t) * 0.15);
    const s = p.r * pulse;
    ctx.fillStyle = col2; roundRect(-s, -s, s*2, s*2, 6); ctx.fill();
    ctx.fillStyle = col1; roundRect(-s, -s, s*2, s, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
    roundRect(-s, -s, s*2, s*2, 6); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${s*1.2}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 2);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);   // 还原，避免 save/restore
  }

  function drawWall() {
    const wx = wall.x, ww = 50;
    if (wallImg) ctx.drawImage(wallImg, wx, 0, 66, wallImgH);
    // 高光描边带闪烁动画，单独画（仅一条线，成本可忽略）
    ctx.strokeStyle = `rgba(255,200,200,${0.4 + Math.sin(playTime*0.2)*0.3})`;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx + ww, 0); ctx.lineTo(wx + ww, groundY); ctx.stroke();
  }

  function loop() { update(); draw(); requestAnimationFrame(loop); }

  // ======= 开始界面皮肤选择器 =======
  // 显示当前生效皮肤（内置名/自定义图片），让皮肤状态透明可感知
  function updateSkinCurrent() {
    const el = document.getElementById('skinCurrent');
    if (!el) return;
    if (cfg.skin && cfg.skin.startsWith('url:')) el.textContent = '当前皮肤：自定义图片';
    else if (cfg.skin && Object.prototype.hasOwnProperty.call(BUILTIN_SKINS, cfg.skin)) el.textContent = '当前皮肤：' + BUILTIN_SKINS[cfg.skin];
    else el.textContent = '当前皮肤：默认蓝';
  }
  function initSkinPicker() {
    const grid = document.getElementById('skinGrid');
    if (!grid) return;
    const keys = skinKeys();
    for (const k of keys) {
      const chip = document.createElement('div');
      chip.className = 'skin-chip' + (cfg.skin === k || (!cfg.skin && k === 'default') ? ' active' : '');
      chip.dataset.skin = k;
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const cc = c.getContext('2d');
      cc.translate(24, 24);
      drawSkin(k, cc, 40, 40, 0, 'idle');
      chip.appendChild(c);
      const name = document.createElement('div');
      name.className = 'skin-name'; name.textContent = BUILTIN_SKINS[k];
      chip.appendChild(name);
      chip.addEventListener('click', () => {
        skinReq++;   // 使挂起的皮肤图片回调失效，避免残留 onload/onerror 污染状态
        cfg.skin = k; skinReady = false; skinImg = null; skinCanvas = null;
        document.querySelectorAll('.skin-chip').forEach(el => el.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('skinUrlInput').value = '';
        updateUrlParam('skin', k);
        updateSkinCurrent();
      });
      grid.appendChild(chip);
    }
    // 自定义 URL 输入
    const urlInput = document.getElementById('skinUrlInput');
    const urlBtn = document.getElementById('skinUrlBtn');
    if (urlBtn) {
      urlBtn.addEventListener('click', () => {
        const val = urlInput.value.trim();
        if (!val) return;
        // 输入恰为内置皮肤名：直接切到内置皮肤（与点 chip 一致，避免加载 'star' 之类 404 后行为不一致）
        if (Object.prototype.hasOwnProperty.call(BUILTIN_SKINS, val)) {
          skinReq++;   // 使挂起的皮肤图片回调失效
          cfg.skin = val; skinReady = false; skinImg = null; skinCanvas = null;
          document.querySelectorAll('.skin-chip').forEach(el => el.classList.remove('active'));
          const chip = grid.querySelector('.skin-chip[data-skin="' + val + '"]');
          if (chip) chip.classList.add('active');
          updateUrlParam('skin', val);
          floatMsg('皮肤已应用', player.x + player.w/2, 100, '#7fd8ff');
          updateSkinCurrent();
          urlInput.blur();
          return;
        }
        cfg.skin = 'url:' + val;
        loadSkin(val);
        document.querySelectorAll('.skin-chip').forEach(el => el.classList.remove('active'));
        updateUrlParam('skin', val);
        floatMsg('皮肤已应用', player.x + player.w/2, 100, '#7fd8ff');
        updateSkinCurrent();
        urlInput.blur();   // 收起软键盘，避免遮挡游戏区域
      });
      urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') urlBtn.click(); });
    }
    updateSkinCurrent();   // 按 URL 参数/默认显示当前皮肤
  }

  // 更新 URL 参数（不刷新页面，便于分享当前配置）
  function updateUrlParam(key, val) {
    const url = new URL(location.href);
    url.searchParams.set(key, val);
    history.replaceState(null, '', url);
  }

  // ======= 启动 =======
  applyConfig();    // 解析 URL 自定义参数
  GRAVITY = cfg.gravity; JUMP_V = -cfg.jump; MAX_JUMPS = cfg.jumps; SPEED_MAX = cfg.speedMax;
  initSkinPicker(); // 初始化开始界面皮肤选择器

  // 竖屏提示：竖屏时显示“建议横屏”，可点按钮关闭继续竖屏玩
  const rotateHint = document.getElementById('rotateHint');
  if (rotateHint) {
    const closeBtn = document.getElementById('rotateCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      rotateHint.classList.add('closed');
      rotateHint.classList.add('hidden');
    });
    const updateRotateHint = () => {
      if (rotateHint.classList.contains('closed')) return;
      rotateHint.classList.toggle('hidden', window.innerWidth >= window.innerHeight);
    };
    window.addEventListener('resize', updateRotateHint);
    updateRotateHint();
  }

  reset();
  document.getElementById('best').querySelector('.val').textContent = best;
  // 若 URL 带 skin 参数，直接进入游戏（跳过开始界面），图片异步加载完成后自动切换
  if (new URL(location.href).searchParams.get('skin')) startGame();
  loop();
})();
