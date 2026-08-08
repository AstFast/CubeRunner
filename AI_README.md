# CubeRunner · 方块跑酷

## 目录

- [URL 参数文档](#url-参数文档)
- [皮肤参数](#皮肤参数)
- [参数组合示例](#参数组合示例)
- [项目结构](#项目结构)

---

## URL 参数文档

所有游戏参数都能通过 URL 查询参数覆盖，便于调试、分享和做"一条链接一个难度"的玩法。**参数写在 `?` 之后，多个参数用 `&` 连接**，例如：

```
http://localhost:8000/?speed=8&jumps=1&skin=cat
```

规则：

- 数值参数必须是合法数字，非法或缺失时回退到默认值；
- 带参数打开时，开始页顶部会显示一条黄色横幅列出所有生效的自定义参数；
- 皮肤在游戏内选择时会自动同步到 URL，分享链接即分享配置。

### 参数总览

| 参数 | 默认值 | 作用 |
|---|---|---|
| `gravity` | 0.9 | 重力加速度（越大下落越快） |
| `jump` | 15.5 | 跳跃力（绝对值，越大跳得越高） |
| `jumps` | 2 | 最大跳跃次数（含二段跳，≥1 的整数） |
| `speed` | 6.2 | 初始滚动速度 |
| `speedmax` | 13 | 滚动速度上限 |
| `speedgrow` | 0.0014 | 滚动速度随时间递增系数 |
| `wallstart` | 0.25 | 危险墙初始速度 |
| `wallmax` | 2.0 | 危险墙速度上限 |
| `wallgrow` | 0.0003 | 危险墙线性增长系数（仅 `wallease=0` 时生效） |
| `wallgrow2` | 0.0000004 | 危险墙二次增长系数（仅 `wallease=0` 时生效） |
| `wallease` | 1 | 危险墙渐近收敛开关：`0` / `false` 关闭，关闭后改用 `wallgrow`/`wallgrow2` 线性增长 |
| `walleaserate` | 0.0008 | 渐近收敛速率（越大越快逼近上限，≥0） |
| `boostpush` | 2.6 | 拾取加速时推墙的基础力度 |
| `boostpushgrow` | 0.0008 | 推墙力度随时间递增系数（仅 `boostease=0` 时生效） |
| `boostpushmax` | 5.5 | 推墙力度上限 |
| `boosttime` | 20 | 拾取加速基础时长（帧，60 帧 = 1 秒） |
| `boosttimegrow` | 0.004 | 加速时长随时间递增系数（仅 `boostease=0` 时生效） |
| `boosttimemax` | 48 | 加速时长上限 |
| `boostspeedmul` | 1.4 | 拾取加速的基础倍率（加速期间方块速度 × 该倍率） |
| `boostspeedmulgrow` | 0.00001 | 加速倍率随时间递增系数（仅 `boostease=0` 时生效） |
| `boostspeedmulmax` | 1.8 | 加速倍率上限 |
| `boostease` | 1 | 拾取加速渐近收敛开关：`0` / `false` 关闭，关闭后改用 `*grow` 线性递增 |
| `boosteaserate` | 0.0005 | 拾取加速渐近收敛速率（≥0，越大越快逼近上限） |
| `boostdecay` | 0.6 | 加速状态每帧衰减量（越大加速结束得越快） |
| `skin` | （空） | 主角皮肤，见 [皮肤参数](#皮肤参数) |

### 详细说明

#### 基础物理（`gravity` / `jump` / `jumps`）

控制手感的核心参数：

- `gravity` 越大，跳跃越"沉"、滞空越短；
- `jump` 越大跳得越高；
- `jumps=1` 可做成"只能跳一次"的硬核模式。

```text
?gravity=1.1&jump=17&jumps=1   # 手感更重、单段跳
```

#### 滚动速度（`speed` / `speedmax` / `speedgrow`）

场景（障碍、金币）的推进速度。`speed` 是起点，随游戏时间以 `speedgrow` 每帧递增，封顶 `speedmax`。

```text
?speed=7&speedmax=12&speedgrow=0.001   # 开局更快，但成长更平缓
```

#### 危险墙（`wallstart` / `wallmax` / `wallease` / `walleaserate` / `wallgrow` / `wallgrow2`）

危险墙从左侧持续逼近玩家（被追上即失败）。

**默认渐近模式（`wallease=1`）**：速度按 `wallmax − (wallmax − wallstart) × e^(−walleaserate × 游戏时间)` 平滑逼近上限——**增长因子随时间递减到 0**，后期不再越涨越快。示例曲线（60fps，默认 `wallmax=2.0`）：

| 游戏时长 | 危险墙速度 |
|---|---|
| 0 | 0.25 |
| 30 秒 | ≈1.6 |
| 60 秒 | ≈1.9 |
| 120 秒 | ≈2.0（基本锁定） |

```text
?wallmax=1.5            # 更低的上限，整体更休闲
?walleaserate=0.0005    # 更慢逼近上限，难度爬坡更久
?wallease=0             # 关闭渐近，改回 wallgrow/wallgrow2 线性增长
?wallstart=0.4&wallmax=2.5   # 开局墙就快一点、上限高一点
```

> `wallease` 是布尔开关：`0`、`false`（大小写不敏感）视为关闭，其他值视为开启。

#### 拾取加速（`boostpush*` / `boosttime*` / `boostspeedmul*` / `boostease*` / `boostdecay`）

吃金色方块会触发"加速"，三部分效果**随时间递增**（默认渐近收敛，增长因子递减 → 0，平滑逼近各自上限；`boostease=0` 可关闭改回线性递增）：

1. **推墙**：把危险墙往左推回去，力度 `boostpush`（渐近逼近 `boostpushmax`）；
2. **时长**：加速持续时间 `boosttime`（帧，渐近逼近 `boosttimemax`）；
3. **自身倍率**：方块滚动速度 × `boostspeedmul`（渐近逼近 `boostspeedmulmax`）。

渐近速率由 `boosteaserate` 控制（越大越快逼近上限）。示例曲线（60fps，默认参数）：

| 游戏时长 | 推墙力度 | 加速时长 | 自身倍率 |
|---|---|---|---|
| 0 | 2.6 | 20 帧 | 1.40 |
| 30 秒 | ≈4.3 | ≈37 帧 | ≈1.64 |
| 60 秒 | ≈5.0 | ≈43 帧 | ≈1.73 |
| 120 秒 | ≈5.4（锁定） | ≈47 帧（锁定） | ≈1.79（锁定） |

`boostdecay` 控制加速状态每帧衰减多少（越大会让加速更快结束）。

```text
?boostpush=3.2&boosttime=36&boostspeedmulmax=2.0   # 更强、更久的拾取加速
?boosteaserate=0.001                               # 加速效果更快成长到上限
?boostease=0                                       # 关闭渐近，改回 *grow 线性递增
?boostdecay=0.3                                    # 加速持续时间更持久
```

---

## 皮肤参数

`skin` 接受三种写法：

| 写法 | 说明 | 示例 |
|---|---|---|
| 预设名 | 内置皮肤 | `?skin=cat`、`?skin=robot` |
| 图片 URL | 自动识别为自定义图片 | `?skin=https://example.com/a.png` |
| `url:` 前缀 | 显式自定义图片 | `?skin=url:https://example.com/a.png` |

内置皮肤名：`default`（默认蓝）、`cat`（猫咪）、`robot`（机器人）、`ghost`（幽灵）、`ninja`（忍者）、`star`（星星）、`frog`（青蛙）。

```text
?skin=ninja
?skin=https://picsum.photos/100
```

---

## 参数组合示例

```text
# 休闲模式：墙更慢、单段跳、猫皮肤
?wallmax=1.5&jumps=1&skin=cat

# 冲刺模式：速度快、加速猛、无渐近（线性难爬升）
?speed=7&speedmax=14&boostspeedmulmax=2&boosttime=40&wallease=0

# 纯手感调试：重力、跳跃、二段跳
?gravity=1.0&jump=16.5&jumps=2

# 分享你的自定义皮肤 + 难度
?skin=https://example.com/myblock.png&wallmax=5&boostspeedmulmax=1.9
```

---

## 项目结构

```
CubeRunner/
├── index.html        # 入口页：画布、HUD、开始/结束界面、皮肤选择、横屏提示
├── css/style.css     # 全部样式（含移动端防误触、竖屏提示）
└── js/
    ├── config.js     # 参数定义 + URL 解析 + 皮肤图片加载 + 参数横幅
    ├── skins.js      # 内置皮肤绘制函数库
    └── game.js       # 游戏主体：物理、生成、碰撞、渲染、输入、性能缓存
```

技术要点：Canvas 2D 全量重绘，自带性能优化（背景/危险墙离屏位图缓存、粒子分桶批量绘制、DPR 自适应与物理像素上限、DOM 节流）；移动端支持横屏提示、防下拉刷新、防复制/长按菜单。
