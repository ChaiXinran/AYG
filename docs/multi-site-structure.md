# Musical Atlas 多站点结构

## 站点入口

| 域名 | 目录 | 用途 |
| --- | --- | --- |
| `musical.ranyechai.site` | `/index.html` | Musical Atlas 总入口 |
| `aygmusical.ranyechai.site` | `/ayg/` | 阿云嘎个站入口 |
| `zyldl.ranyechai.site` | `/zyl/` | 郑云龙个站入口 |

`ayg/` 和 `zyl/` 分别包含 `index.html`、`china.html`、`category.html`、`tour.html`，可以独立设置页面标题、描述及未来的视觉配置。

## 共享核心

两个人物站共用以下内容，不需要复制维护：

- `src/`：地球、国内地图、分类、巡演、时间轴和导航组件
- `src/data/artists/`：各人物的演出数据
- `src/data/personRegistry.js`：人物注册、站点识别和跨人物跳转
- `src/config/`：背景与巡演主题配置
- `background/people/`：按人物隔离的背景资源

人物由当前目录或正式子域名自动识别。查询参数 `?person=` 仍然保留兼容，便于旧链接继续工作。

## 部署建议

三个域名应指向同一份静态产物，使个站能够复用 `/src`、`/background` 和 `/assets`。在托管平台上为两个个站添加入口重写：

```text
aygmusical.ranyechai.site/  -> /ayg/index.html
zyldl.ranyechai.site/      -> /zyl/index.html
```

并将同域名下的 `/china.html`、`/category.html`、`/tour.html` 分别重写到对应人物目录。不要只上传 `ayg/` 或 `zyl/` 单个目录，否则共享资源无法访问。
