# Musical Atlas：Cloudflare Pages 多项目部署

## 源码结构

```text
MusicalAtlas/
├── core/                 # 三个站点共享的地图、组件、配置和数据
├── sites/
│   ├── home/             # Musical Atlas 总入口
│   ├── ayg/              # 阿云嘎页面与个性化入口
│   └── zyl/              # 郑云龙页面与个性化入口
├── assets/               # 人物站共享的作品素材
├── background/           # 按人物分类的背景图
├── scripts/build-site.js # 将源码组装为独立部署产物
└── dist/                 # 构建结果，不提交 Git
```

人物站源码中的 `<base href="../../">` 只用于从仓库根目录进行本地预览。构建时脚本会移除它，并把 `core/`、`assets/` 和 `background/` 一起复制到 `dist/`。因此部署后的页面只使用站点根目录以内的路径，不依赖 `../` 访问发布目录之外的文件。

## 本地构建

```bash
npm run build:home
npm run build:ayg
npm run build:zyl
```

每条命令都会重新生成 `dist/`。检查某个站点时，只运行对应命令，然后把仓库根目录作为静态服务器目录并访问 `/dist/`。

## Cloudflare Pages 配置

三个 Pages 项目连接同一个仓库和同一个生产分支。Root directory 都设置为仓库根目录 `/`，Build output directory 都设置为 `dist`。

| Pages 项目 | Build command | Custom domain |
| --- | --- | --- |
| `musical-home` | `node scripts/build-site.js home` | `musical.ranyechai.site` |
| `ayg-musical` | `node scripts/build-site.js ayg` | `aygmusical.ranyechai.site` |
| `zyl-musical` | `node scripts/build-site.js zyl` | `zylmusical.ranyechai.site` |

构建命令必须从仓库根目录执行。不要把 Build output directory 直接设置为 `sites/ayg` 或 `sites/zyl`，否则共享核心和图片不会进入部署结果。

## 路径约定

- 页面引用共享代码：`./core/...`
- 页面引用作品素材：`./assets/...`
- 背景配置使用 `import.meta.url` 计算资源位置
- 站内页面使用 `index.html`、`china.html`、`category.html`、`tour.html`
- 跨人物跳转使用完整正式域名
- 郑云龙站以 `zylmusical.ranyechai.site` 为正式域名，同时保留对旧 `zyldl` 主机名的识别兼容

在 `dist/` 中不应出现指向 `../core`、`../assets` 或 `../background` 的页面资源引用。
