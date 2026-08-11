# 人物背景图接入规则

每个人物使用独立目录，目录名必须与人物 ID 一致：

- `ayanga` — 阿云嘎

人物目录根部使用：

- `earth.jpg` — 活动地球首页背景
- `china-map.jpg` — 中国地图页背景
- `category.jpg` — 分类背景缺失时的兜底图

每个人物的 `categories` 目录放置九张分类背景：

| 文件名 | 分类 |
| --- | --- |
| `musical.jpg` | 音乐剧 |
| `drama.jpg` | 话剧 |
| `concert.jpg` | 演唱会 / Gala |
| `film.jpg` | 影视作品 |
| `gala.jpg` | 晚会 |
| `variety.jpg` | 综艺 |
| `ost.jpg` | OST |
| `single.jpg` | 单曲 |
| `business.jpg` | 商务活动 |

所有背景路径统一配置在 `core/config/backgrounds.js`。本地使用相对路径；迁移到 Cloudflare R2/CDN 后，把相应值替换为完整的 `https://...` 地址即可，不需要修改页面代码。

如果仍使用项目内图片，也可以直接覆盖对应人物目录中的同名文件。建议使用 16:9 横图，尺寸至少为 1920×1080，JPG 色彩模式使用 RGB。

当前分类图片是为保证页面可立即运行而复制的占位图；替换成各分类的最终图片后，不同人物、不同分类会自动显示各自背景。
