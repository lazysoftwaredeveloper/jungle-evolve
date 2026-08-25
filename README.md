# Jungle Evolve

一个零依赖、单页可玩的 3D 浏览器小游戏原型。

你从一只藤芽幼兽开始，在有雾的丛林中寻找比自己小的动物。靠近猎物即可自动吞噬；吞噬数量达到阈值后会进化，体型、速度和可吞噬范围都会提升。最终清空丛林，成为树冠霸主。

## 当前版本

- 原生 WebGL / WebGL2 3D 渲染，无图片、模型或 CDN 资源
- 第三人称跟随镜头，带雾效、实时光照、树木层次、阴影和粒子反馈
- 键盘操作：`W / ↑` 前进，`S / ↓` 后退，`A D / ← →` 转向，`P` 暂停
- 5 类猎物：红甲虫、苔纹蛙、藤尾猴、獠牙野猪、夜行豹
- 4 个进化阶段：藤芽幼兽、斑叶猎手、铁牙掠食者、树冠霸主
- 固定随机种子生成场景，方便复现和调试
- `window.__game` 调试接口已在第一版加入

## 本地运行

```bash
python3 -m http.server 8123 --directory public
```

然后打开 <http://127.0.0.1:8123>。

也可以直接把 `public/index.html` 放在任意静态托管服务上。游戏运行时不需要 npm 依赖。

## 目录

```text
public/
  index.html     # UI、HUD、响应式布局
  game.js        # 数据表、WebGL 渲染、玩法、主循环、调试接口
src/
  worker.js      # Cloudflare Workers 静态资源入口与健康检查
tests/
  smoke.mjs      # 可选的 Playwright 冒烟测试
wrangler.jsonc   # Cloudflare Workers 配置
```

## 参考规范的适配

原开发规范针对 2D Canvas 小游戏；本项目保留了它的单页、零运行时依赖、数据表驱动、统一主循环、固定随机源和 `window.__game` 原则，但将渲染层替换为原生 WebGL，以满足 3D 丛林和立体镜头的明确需求。

代码在 `public/game.js` 中按以下顺序分区：

```text
基础配置 → 数据表 → 工具函数 → WebGL 初始化 → 矩阵工具
→ 绘制原语 → 初始化/开局/结算 → 更新逻辑 → 绘制实现
→ UI 事件 → 主循环 → window.__game → 启动
```

## 调试接口

打开浏览器控制台后，可以使用：

```js
__game.start()
__game.advance(5)
__game.clear()
__game.placeAt('beetle', 0, 2)
__game.setPlayer(0, 0, 0)
__game.state
__game.preyList
```

`advance(seconds)` 使用固定步长推进游戏，不依赖真实等待时间，适合后续自动化测试和平衡性测试。

## Cloudflare Workers

项目已经包含 `wrangler.jsonc` 和 `src/worker.js`。配置好 Cloudflare 后可以使用：

```bash
npx wrangler deploy
```

健康检查地址为 `/api/health`。没有配置 KV 或排行榜也不会影响核心玩法。
