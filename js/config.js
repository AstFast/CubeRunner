// config.js —— 可配置参数 + URL 参数解析 + 皮肤加载
// 暴露到 window 供 game.js 使用
window.cfg = {
  gravity: 0.9,        // 重力
  jump: 15.5,          // 跳跃力（绝对值）
  jumps: 2,            // 最大跳跃次数（含二段跳）
  speed: 6.2,          // 初始滚动速度
  speedMax: 13,        // 最大滚动速度
  speedGrow: 0.0014,   // 滚动速度随时间递增系数
  wallStart: 0.25,     // 危险墙初始速度
  wallGrow: 0.0003,    // 危险墙一次递增系数（仅当 wallEase=false 时使用）
  wallGrow2: 0.0000004,// 危险墙二次递增系数（仅当 wallEase=false 时使用）
  wallMax: 2.0,        // 危险墙速度上限（防止后期失控）
  wallEase: true,      // 危险墙渐近收敛：增长因子随时间递减 → 0，速度平滑逼近上限（后期不再越涨越快）
  wallEaseRate: 0.0008,// 渐近收敛速率（越大越快逼近上限）
  boostPushBase: 2.6,  // 加速时推墙基础力度
  boostPushGrow: 0.0008,// 推墙力度随时间递增
  boostPushMax: 5.5,   // 推墙力度上限
  boostTimeBase: 20,   // 捡金币加速基础时长（帧）
  boostTimeGrow: 0.004,// 加速时长随时间递增
  boostTimeMax: 48,    // 加速时长上限
  boostSpeedMul: 1.4,       // 拾取加速基础倍率（随游戏时间递增，见下两个参数）
  boostSpeedMulGrow: 0.00001, // 加速倍率随游戏时间递增系数
  boostSpeedMulMax: 1.8,    // 加速倍率上限
  boostEase: true,      // 拾取加速渐近收敛：推墙/时长/倍率随时间平滑逼近上限（增长因子递减 → 0）
  boostEaseRate: 0.0005,// 拾取加速渐近收敛速率（越大越快逼近上限）
  boostDecay: 0.6,     // 加速状态衰减速率（每帧减少量）
  skin: ''             // 主角皮肤标识：'' 默认 | 'cat'|'robot'|... 预设 | 'url:xxx' 自定义图片
};

// 皮肤图片（仅当 skin 以 'url:' 开头时使用）
window.skinImg = null;
window.skinReady = false;
window.skinCanvas = null;   // 离屏缓存（预缩放后的小 canvas，避免每帧缩放大图）

// 从 URL 查询参数读取自定义值并覆盖 cfg
window.applyConfig = function () {
  const p = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(p.get(k)); return isNaN(v) ? d : v; };
  cfg.gravity    = num('gravity',    cfg.gravity);
  cfg.jump       = num('jump',       cfg.jump);
  cfg.jumps      = Math.max(1, Math.floor(num('jumps', cfg.jumps)));
  cfg.speed      = num('speed',      cfg.speed);
  cfg.speedMax   = num('speedmax',   cfg.speedMax);
  cfg.speedGrow  = num('speedgrow',  cfg.speedGrow);
  cfg.wallStart  = num('wallstart',  cfg.wallStart);
  cfg.wallGrow   = num('wallgrow',   cfg.wallGrow);
  cfg.wallGrow2  = num('wallgrow2',  cfg.wallGrow2);
  cfg.wallMax    = num('wallmax',    cfg.wallMax);
  // wallease 为布尔开关：'0'/'false' 视为关闭（改回线性增长），其余为开启
  if (p.has('wallease')) { const v = p.get('wallease'); cfg.wallEase = !(v === '0' || v.toLowerCase() === 'false'); }
  cfg.wallEaseRate = Math.max(1e-6, num('walleaserate', cfg.wallEaseRate));
  cfg.boostPushBase = num('boostpush',      cfg.boostPushBase);
  cfg.boostPushGrow = num('boostpushgrow',  cfg.boostPushGrow);
  cfg.boostPushMax  = num('boostpushmax',   cfg.boostPushMax);
  cfg.boostTimeBase = num('boosttime',      cfg.boostTimeBase);
  cfg.boostTimeGrow = num('boosttimegrow',  cfg.boostTimeGrow);
  cfg.boostTimeMax  = num('boosttimemax',   cfg.boostTimeMax);
  cfg.boostSpeedMul = num('boostspeedmul',  cfg.boostSpeedMul);
  cfg.boostSpeedMulGrow = num('boostspeedmulgrow', cfg.boostSpeedMulGrow);
  cfg.boostSpeedMulMax  = num('boostspeedmulmax',  cfg.boostSpeedMulMax);
  // boostease 为布尔开关：'0'/'false' 视为关闭（改回线性递增），其余为开启
  if (p.has('boostease')) { const v = p.get('boostease'); cfg.boostEase = !(v === '0' || v.toLowerCase() === 'false'); }
  cfg.boostEaseRate = Math.max(1e-6, num('boosteaserate', cfg.boostEaseRate));
  cfg.boostDecay    = num('boostdecay',     cfg.boostDecay);
  // skin 参数：URL 直接传图片地址则包装为 'url:'
  const s = p.get('skin');
  if (s) cfg.skin = s.startsWith('url:') || BUILTIN_SKINS[s] ? s : 'url:' + s;
  // 若 skin 是图片 URL，预加载
  if (cfg.skin && cfg.skin.startsWith('url:')) loadSkin(cfg.skin.slice(4));
  showConfigBanner();
};

// 加载皮肤图片（自适应缩放到玩家方块尺寸）
// 优先带 crossOrigin（GitHub Pages 等需 CORS 场景）；图床不支持 CORS 时回退普通加载重试一次
// （本项目只用 drawImage 显示、无 getImageData，canvas 污染无影响）
window.loadSkin = function (url, noCors) {
  skinImg = new Image();
  if (!noCors) skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinReady = true;
    // 预渲染到离屏 canvas（2倍尺寸保证清晰），避免每帧缩放大图
    const sz = 88;
    skinCanvas = document.createElement('canvas');
    skinCanvas.width = sz; skinCanvas.height = sz;
    const sc = skinCanvas.getContext('2d');
    const iw = skinImg.naturalWidth, ih = skinImg.naturalHeight;
    const scale = Math.max(sz / iw, sz / ih);   // cover 模式
    const dw = iw * scale, dh = ih * scale;
    sc.drawImage(skinImg, (sz - dw) / 2, (sz - dh) / 2, dw, dh);
  };
  skinImg.onerror = () => {
    if (!noCors) { loadSkin(url, true); return; }   // CORS 失败 → 无 CORS 重试一次
    skinReady = false; skinImg = null; skinCanvas = null;
    if (window.floatMsg) window.floatMsg('皮肤加载失败，使用默认', 120, 80, '#ff8a3a');
  };
  skinImg.src = url;
};

// 在开始页显示当前生效的自定义参数
window.showConfigBanner = function () {
  const p = new URLSearchParams(location.search);
  if ([...p.keys()].length === 0) return;   // 无参数则不显示
  const items = [];
  if (cfg.skin) items.push('皮肤: ' + (cfg.skin.startsWith('url:') ? '自定义图片' : BUILTIN_SKINS[cfg.skin] ? '预设(' + cfg.skin + ')' : cfg.skin));
  if (p.has('wallease')) items.push('wallease=' + p.get('wallease'));
  if (p.has('boostease')) items.push('boostease=' + p.get('boostease'));
  const numKeys = ['gravity','jump','jumps','speed','speedmax','speedgrow','wallstart','wallgrow','wallgrow2','wallmax','walleaserate','boostpush','boostpushgrow','boostpushmax','boosttime','boosttimegrow','boosttimemax','boostspeedmul','boostspeedmulgrow','boostspeedmulmax','boosteaserate','boostdecay'];
  for (const k of numKeys) {
    if (p.has(k)) items.push(`${k}=${p.get(k)}`);
  }
  if (items.length === 0) return;
  let banner = document.getElementById('cfgBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'cfgBanner';
    banner.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);max-width:90vw;background:rgba(10,10,30,.85);border:1px solid rgba(255,216,77,.5);color:#ffd84d;font-size:12px;padding:6px 14px;border-radius:20px;z-index:5;text-align:center';
    document.getElementById('wrap').appendChild(banner);
  }
  banner.textContent = '自定义参数已生效：' + items.join(' · ');
};
