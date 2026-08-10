/**
 * 活动节点数据
 *
 * 添加新节点：复制下面模板，填入城市/活动信息即可
 *
 *   createEvent({
 *     city: '城市名',
 *     title: '演出/活动名称',
 *     category: '音乐剧 | 综艺 | 晚会',
 *     date: 'YYYY-MM-DD' | 'YYYY-MM-DD ~ YYYY-MM-DD',
 *     dates: [{ date: 'YYYY-MM-DD', time: 'HH:mm' }],
 *     role: '饰演角色（音乐剧可选）',
 *     venue: '场馆名称',
 *     lon: 经度,
 *     lat: 纬度,
 *     description: '一句话描述',
 *   }),
 */

// ═══ 工厂函数 ═══
let _nextId = 1;

function formatShowDate(item) {
  return item.time ? `${item.date} ${item.time}` : item.date;
}

function getEventDateLabel(date, dates) {
  if (Array.isArray(dates) && dates.length > 0) {
    if (dates.length === 1) return formatShowDate(dates[0]);
    return dates.map(formatShowDate).join(' / ');
  }
  return date || '';
}

function getEventYear(date, dates) {
  const source = Array.isArray(dates) && dates.length ? dates[0].date : date;
  if (typeof source !== 'string') return NaN;
  const normalized = source.split('~')[0].trim();
  return Number(normalized.slice(0, 4));
}

export function createEvent({ city, title, category, date, dates, role, venue, lon, lat, description }) {
  return {
    id: _nextId++,
    title,
    category,
    year: getEventYear(date, dates),
    city,
    venue,
    date,
    dates,
    dateLabel: getEventDateLabel(date, dates),
    role,
    lon,
    lat,
    description
  };
}

/** 重置自增 ID（仅测试用） */
export function resetEventIds(start = 1) { _nextId = start; }

// ═══════════════════════════════════════════
//  全部活动（按国家→城市分组，方便查阅）
// ═══════════════════════════════════════════

export const events = [

  // ─── 中国 · 北京 ───
  createEvent({
    city:'北京',
    title:'RENT · 北京场',
    category:'音乐剧',
    dates:[
      { date:'2026-03-21', time:'14:00' },
      { date:'2026-03-21', time:'19:30' }
    ],
    role:'Roger',
    venue:'天桥艺术中心',
    lon:116.4074,
    lat:39.9042,
    description:'后续可接入剧目、演员、海报、用户照片和视频。'
  }),
  createEvent({
    city:'北京',
    title:'北京音乐剧加演场',
    category:'音乐剧',
    dates:[{ date:'2026-04-09', time:'19:30' }],
    role:'主演',
    venue:'保利剧院',
    lon:116.429,
    lat:39.933,
    description:'与附近活动一起用于测试节点聚合。'
  }),

  // ─── 中国 · 上海 ───
  createEvent({
    city:'上海',
    title:'法语音乐剧巡演',
    category:'音乐剧',
    dates:[
      { date:'2026-05-16', time:'14:00' },
      { date:'2026-05-17', time:'19:30' }
    ],
    role:'主演',
    venue:'上海文化广场',
    lon:121.4737,
    lat:31.2304,
    description:'同一剧目在同一场馆有多场演出。'
  }),
  createEvent({ city:'上海', title:'上海综艺特别录制',       category:'综艺',   date:'2026-06-03', venue:'上海演播中心',   lon:121.49,   lat:31.22,    description:'放大后会从上海聚合节点中展开。' }),

  // ─── 中国 · 广州 ───
  createEvent({ city:'广州', title:'年度音乐盛典',           category:'晚会',   date:'2025-12-31', venue:'广州体育馆',     lon:113.2644, lat:23.1291,  description:'晚会类活动用独立颜色显示。' }),

  // ─── 中国 · 长沙 ───
  createEvent({ city:'长沙', title:'音乐旅行综艺录制',       category:'综艺',   date:'2025-08-09', venue:'节目演播中心',   lon:112.9388, lat:28.2282,  description:'综艺节点可记录录制时间和播出时间。' }),

  // ─── 英国 · 伦敦 ───
  createEvent({ city:'伦敦', title:'West End Musical Night', category:'音乐剧', date:'2024-09-12', venue:'West End',       lon:-0.1276,  lat:51.5072,  description:'海外活动随地球旋转自然进入视野。' }),

  // ─── 美国 · 纽约 ───
  createEvent({ city:'纽约', title:'Broadway Special',       category:'音乐剧', date:'2026-06-01', venue:'Broadway',        lon:-74.006,  lat:40.7128,  description:'后续可建立国家、城市、剧院和剧目索引。' }),

  // ─── 法国 · 巴黎 ───
  createEvent({ city:'巴黎', title:'Paris Summer Gala',      category:'晚会',   date:'2025-07-18', venue:'Paris',           lon:2.3522,   lat:48.8566,  description:'缩放后节点会自动从聚合状态展开。' }),

  // ─── 日本 · 东京 ───
  createEvent({ city:'东京', title:'东京音乐节目现场',       category:'综艺',   date:'2026-04-11', venue:'Tokyo Studio',     lon:139.6917, lat:35.6895,  description:'正式版可切换全站活动地图和个人足迹地图。' }),

];
