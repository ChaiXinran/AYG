# Event Earth Demo

一个用于继续迭代“活动地球”网站首页的纯前端、多文件 Demo。

**不需要 npm install。**

## 已实现

- 深蓝海洋渐变
- 绿色 / 土黄色大陆
- 高纬 / 极地区域浅色处理
- 真实国家轮廓（world-atlas）
- 经纬网
- 当前时间对应的近似昼夜分界
- 昼夜分界线
- 夜侧城市灯光
- 大气层蓝色光晕
- 星空背景
- 活动节点脉冲
- 活动类别颜色
- 地球拖拽旋转
- 滚轮缩放
- 自动缓慢旋转
- 年份 / 类别筛选
- 节点自动聚合 / 展开
- 点击聚合节点自动飞近
- 点击单个活动显示详情卡片
- 桌面 / 移动端基础适配

## 项目结构

```text
event-earth-demo/
├── index.html
├── src/
│   ├── main.js          # 页面 UI 与交互入口
│   ├── globe.js         # 地球渲染核心
│   ├── styles.css       # 全部样式
│   └── data/
│       ├── allEvents.js # 网站活动数据入口
│       ├── scheduleRegistry.js # 自动生成的年度数据注册表
│       └── cities.js    # 夜间城市灯光点
└── README.md
```

## 运行

由于浏览器 ES Module 不能稳定地直接从 `file://` 打开，建议起一个本地静态服务器。

### Python

```bash
cd event-earth-demo
python -m http.server 8000
```

打开：

```text
http://localhost:8000
```

### VS Code

也可以安装 **Live Server**，然后对 `index.html` 使用 `Open with Live Server`。

## 外部依赖

`src/globe.js` 直接从 jsDelivr 使用固定版本：

- D3 7.9.0
- topojson-client 3.1.0
- world-atlas 2.0.2

因此项目本身没有 `node_modules`。

## 最常修改的位置

### 1. 活动数据

网站现只使用两份 `*_2014-2026_全分类汇总.xlsx` 作为人物数据源。旧年度数据文件保留作历史备份，不再被页面导入。

多人物工作簿统一使用 `tools/convert_artist_workbook.py` 转换。它兼容现有阿云嘎年度表，
也支持包含“公开演出活动汇总 / 影视作品 / OST及原声 / 单曲”的综合工作簿：

```bash
python tools/convert_artist_workbook.py "src/data/郑云龙_2014-2026_全分类汇总.xlsx" \
  "src/data/artists/zhengyunlong.js" --artist-id zhengyunlong --artist-name 郑云龙

python tools/convert_artist_workbook.py "src/data/阿云嘎_2014-2026_全分类汇总.xlsx" \
  "src/data/artists/ayanga.js" --artist-id ayanga --artist-name 阿云嘎
```

每次更新 Excel 后重新运行对应命令即可。转换器会读取“音乐剧、话剧、演唱会／gala、晚会、综艺、商务、影视作品、OST、单曲”工作表，并以工作表分类为准，不再扫描旧年度文件。

人物及其数据源统一登记在 `src/data/personRegistry.js`。页面通过 `?person=ayanga`
或 `?person=zhengyunlong` 切换，并会记住用户最近一次选择。

```js
{
  id: 1,
  title: '活动名称',
  category: '音乐剧',
  year: 2026,
  city: '北京',
  venue: '剧院',
  date: '2026-03-21',
  lon: 116.4074,
  lat: 39.9042,
  description: '...'
}
```

### 2. 地球颜色

主要看：

- `src/globe.js` -> `landColor()` 与 SVG gradients
- `src/styles.css` -> `.ocean`、`.country`、`.night-shade`

目前大陆颜色是按纬度做的视觉近似，并不是卫星纹理或真实植被数据。

### 3. 节点聚合

`src/clustering.js`

当前使用轻量“屏幕空间距离聚合”。

`src/globe.js`：

```js
const clusterThreshold = Math.max(
  18,
  42 / Math.pow(scaleRatio, 0.85)
);
```

- 阈值越大：越容易聚合
- 阈值越小：越容易展开
- 放大地球时阈值会自动减小

后面有上万、几十万活动时，可以替换成 `supercluster` 或服务端空间查询。

### 4. 昼夜效果

`solarPoint()` 根据当前 UTC 时间和一年中的日期，近似计算太阳直射点。

`nightHemisphere()` 得到背向太阳的半球。

这个精度用于网页视觉足够，但不是天文计算工具。

### 5. 城市灯光

`src/data/cities.js` 目前只是视觉测试点，不是真实人口或 NASA 夜光数据。

如果后面需要更真实，可以替换为：

- NASA Black Marble 夜光纹理
- 人口栅格
- 网站自己的活动密度热力图

届时更建议改成纹理 / raster overlay，而不是逐城市画点。

## 后续接 Supabase

现在活动来自：

```js
import { events } from './data/allEvents.js';
```

以后可改为从 Supabase 查询，再传给：

```js
new EventGlobe({ events, ... })
```

地球渲染、聚合、点击等核心逻辑不用重写。
