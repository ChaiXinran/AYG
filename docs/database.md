# 全球演出与活动地图平台

# 数据库 / ER 数据模型设计文档 V0.1

## 1. 设计目标

数据库需要支持以下核心能力：

* 地球 → 国家 → 城市 → 场馆 → 活动逐级浏览；
* 按时间、地点、演出名、人物、关键词筛选；
* 区分作品、制作版本、具体场次；
* 用户注册、投稿、评论；
* 用户标记“我参加过”；
* 上传图片、短视频、Repo、外部链接和文字资料；
* 用户共同补充已有条目；
* 投稿审核与修改审核；
* 重复活动检测；
* 后续扩展人物页面、作品页面、城市页面和场馆页面。

---

# 2. 核心实体关系

整体数据关系：

```text
Country
   ↓
City
   ↓
Venue
   ↓
Event
   ↑
Production
   ↑
Work

Person ←→ Event / Production

Event
 ├─ Resource
 ├─ Media
 ├─ Comment
 ├─ Attendance
 ├─ Tag
 └─ Submission / EditRequest

User
 ├─ Attendance
 ├─ Comment
 ├─ Resource
 ├─ Submission
 └─ Report
```

其中最重要的原则是：

```text
Work ≠ Production ≠ Event
```

例如：

```text
Work
RENT

Production
RENT 2026 中国巡演版

Event
RENT 2026-08-07 19:30 北京场
```

---

# 3. users

用户基本信息。

```text
users
--------------------------------
id                  UUID PK
username            varchar unique
display_name        varchar
avatar_url          text
bio                  text
role                 enum
status               enum
created_at           timestamp
updated_at           timestamp
```

role：

```text
user
contributor
moderator
admin
```

status：

```text
active
suspended
deleted
```

用户身份认证建议直接使用 Supabase Auth。

业务 `users` 表通过：

```text
users.id = auth.users.id
```

关联。

---

# 4. countries

国家 / 地区。

```text
countries
--------------------------------
id                  bigint PK
name_zh             varchar
name_en             varchar
iso2                char(2)
iso3                char(3)
longitude           decimal
latitude            decimal
slug                varchar unique
```

例如：

```text
China
CN
CHN

United States
US
USA

United Kingdom
GB
GBR
```

---

# 5. cities

城市。

```text
cities
--------------------------------
id                  bigint PK
country_id          FK countries.id
name_zh             varchar
name_en             varchar
longitude           decimal
latitude            decimal
timezone             varchar
slug                varchar
created_at           timestamp
```

索引：

```text
country_id
name_zh
name_en
longitude / latitude
```

未来可以使用 PostGIS：

```text
location geography(Point)
```

代替独立 longitude / latitude。

---

# 6. districts / theater_districts

用于 Broadway、West End 等特殊演出区域。

```text
districts
--------------------------------
id                  bigint PK
city_id             FK cities.id
name                varchar
type                varchar
description         text
longitude           decimal
latitude            decimal
```

例如：

```text
Broadway Theater District
West End
```

这不是行政区，属于产品层面的文化区域。

---

# 7. venues

剧院 / 场馆。

```text
venues
--------------------------------
id                  bigint PK
city_id             FK cities.id
district_id         FK districts.id nullable

name_zh             varchar
name_en             varchar

address             text
longitude           decimal
latitude            decimal

venue_type          enum

website_url         text
description         text

cover_image_url     text

status              enum

created_by          FK users.id
created_at          timestamp
updated_at          timestamp
```

venue_type：

```text
theatre
concert_hall
arena
stadium
studio
opera_house
cinema
outdoor
other
```

status：

```text
active
closed
temporary
unknown
```

---

# 8. works

作品层。

例如：

```text
RENT
Les Misérables
Romeo et Juliette
Wicked
Hamilton
```

结构：

```text
works
--------------------------------
id                  bigint PK
title               varchar
original_title      varchar
work_type           enum

original_language   varchar
premiere_date       date nullable

description         text
official_url        text
cover_image_url     text

created_by          FK users.id
created_at          timestamp
updated_at          timestamp
```

work_type：

```text
musical
play
concert
tv_show
variety_show
gala
opera
dance
festival
other
```

---

# 9. productions

具体制作版本。

例如：

```text
RENT Original Broadway Production
RENT 2026 中国巡演版
Romeo et Juliette 2025 亚洲巡演
```

结构：

```text
productions
--------------------------------
id                  bigint PK
work_id             FK works.id

title               varchar
production_type     varchar

start_date          date nullable
end_date            date nullable

company             varchar
description         text

official_url        text
cover_image_url     text

created_by          FK users.id
created_at          timestamp
updated_at          timestamp
```

一个 Work 可以有多个 Production。

---

# 10. events

具体活动 / 场次。

这是地图上的最基础真实节点。

```text
events
--------------------------------
id                  bigint PK

production_id       FK productions.id nullable
work_id             FK works.id nullable

title               varchar
event_type          enum

venue_id            FK venues.id
city_id             FK cities.id

start_time          timestamptz
end_time            timestamptz nullable

longitude           decimal
latitude            decimal

description         text

official_url        text
poster_url          text

status              enum

created_by          FK users.id
approved_by         FK users.id nullable

created_at          timestamp
updated_at          timestamp
published_at        timestamp nullable
```

event_type：

```text
musical
play
concert
variety_recording
gala
award_ceremony
festival
fan_event
other
```

status：

```text
draft
pending
published
rejected
cancelled
archived
```

正常情况下：

```text
event.longitude
event.latitude
```

继承 venue。

但允许特殊户外活动覆盖坐标。

---

# 11. people

演员、导演、嘉宾、主持人等。

```text
people
--------------------------------
id                  bigint PK
name                varchar
name_en             varchar nullable
avatar_url          text
description         text

created_at          timestamp
updated_at          timestamp
```

---

# 12. event_people

活动与人物之间的多对多关系。

```text
event_people
--------------------------------
event_id            FK events.id
person_id           FK people.id

role_type           enum
role_name           varchar nullable

sort_order          integer
```

role_type：

```text
actor
performer
host
guest
director
producer
creator
musician
conductor
other
```

例如：

```text
person: X
role_type: actor
role_name: Collins
```

---

# 13. production_people

Production 层也需要人物关系。

```text
production_people
--------------------------------
production_id
person_id
role_type
role_name
```

用于表示整轮巡演的固定卡司或制作团队。

---

# 14. tags

标签系统。

```text
tags
--------------------------------
id
name
slug
type
```

例如：

```text
毕业大戏
首演
末场
周年场
巡演
Broadway
West End
学生制作
中文版
法语音乐剧
```

---

# 15. event_tags

```text
event_tags
--------------------------------
event_id
tag_id
```

---

# 16. resources

“补课资料”的统一实体。

资源不一定是上传文件，也可能只是 URL。

```text
resources
--------------------------------
id                  bigint PK

event_id            FK events.id nullable
production_id       FK productions.id nullable
work_id             FK works.id nullable

user_id             FK users.id

resource_type       enum

title               varchar
description         text

url                 text nullable

status              enum

created_at          timestamp
updated_at          timestamp
```

resource_type：

```text
article
external_link
repo
video_link
image_link
note
timeline
interview
review
other
```

---

# 17. media

用户实际上传的媒体文件。

```text
media
--------------------------------
id                  bigint PK

event_id            FK events.id
user_id             FK users.id

media_type          enum

file_url            text
thumbnail_url       text nullable

mime_type           varchar
file_size           bigint

width               integer nullable
height              integer nullable
duration_seconds    decimal nullable

caption             text

status              enum

created_at          timestamp
```

media_type：

```text
image
video
```

status：

```text
processing
published
hidden
deleted
```

媒体二进制文件放：

```text
Cloudflare R2
```

数据库只保存 URL 和元数据。

---

# 18. attendance

“我参加过”。

```text
attendance
--------------------------------
id                  bigint PK

event_id            FK events.id
user_id             FK users.id

rating              smallint nullable
note                text nullable

visibility          enum

created_at          timestamp
updated_at          timestamp
```

唯一约束：

```text
unique(event_id, user_id)
```

visibility：

```text
public
followers
private
```

第一版可以只实现：

```text
public
private
```

---

# 19. comments

评论。

```text
comments
--------------------------------
id                  bigint PK

event_id            FK events.id
user_id             FK users.id

parent_id           FK comments.id nullable

content             varchar(500)

status              enum

created_at          timestamp
updated_at          timestamp
```

status：

```text
published
hidden
deleted
```

只允许两层回复。

---

# 20. favorites

收藏。

```text
favorites
--------------------------------
user_id
event_id
created_at
```

唯一：

```text
unique(user_id, event_id)
```

---

# 21. reports

举报。

```text
reports
--------------------------------
id                  bigint PK

reporter_id         FK users.id

target_type         enum
target_id           bigint

reason              enum
description         text

status              enum

created_at          timestamp
resolved_at         timestamp nullable
resolved_by         FK users.id nullable
```

target_type：

```text
event
resource
media
comment
user
```

reason：

```text
incorrect
duplicate
spam
copyright
abuse
other
```

---

# 22. event_submissions

新增活动投稿。

```text
event_submissions
--------------------------------
id                  bigint PK
user_id             FK users.id

payload             jsonb

status              enum

review_note         text

reviewed_by         FK users.id nullable

created_at
reviewed_at
```

payload 使用 JSONB 保存投稿快照。

避免用户修改原始数据后影响审核记录。

---

# 23. edit_requests

修改已有条目的申请。

```text
edit_requests
--------------------------------
id
user_id

target_type
target_id

before_data         jsonb
proposed_data       jsonb

reason              text

status

reviewed_by
review_note

created_at
reviewed_at
```

target_type：

```text
event
venue
work
production
person
```

---

# 24. duplicate_candidates

系统检测出来的疑似重复记录。

```text
duplicate_candidates
--------------------------------
id

source_event_id
target_event_id

similarity_score

status

created_at
```

重复检测主要依据：

```text
normalized title
+
venue_id
+
start_time
```

并可增加模糊字符串匹配。

---

# 25. 搜索字段设计

全局搜索应覆盖：

```text
works.title
productions.title
events.title
venues.name
cities.name
people.name
tags.name
resources.title
```

第一阶段：

```text
PostgreSQL Full Text Search
+
ILIKE
```

已经足够。

后期可加入：

```text
pg_trgm
```

进行模糊匹配。

---

# 26. 地理查询

建议 Supabase PostgreSQL 开启：

```text
PostGIS
```

城市、场馆和活动保存：

```text
location geography(Point, 4326)
```

这样可以实现：

```text
查询地图当前视野里的活动

查询某城市附近 50 km 的活动

查询某节点附近场馆

按地图 viewport 加载数据
```

---

# 27. 地图聚合策略

数据库不直接保存“聚合点”。

聚合是查询 / 前端展示逻辑。

例如：

```text
世界视图
→ 按国家聚合

国家视图
→ 按城市聚合

城市视图
→ 按场馆聚合

场馆视图
→ 显示 Event
```

如果活动数量非常大，可后续加入服务端空间聚合。

---

# 28. Event 查询示例

筛选：

```text
时间：
2025-01-01 ～ 2026-12-31

国家：
China

城市：
Shanghai

类别：
musical

关键词：
RENT
```

最终查询：

```text
events
JOIN venues
JOIN cities
JOIN countries
JOIN works
```

返回地图节点和列表。

---

# 29. 删除策略

不要对核心社区内容直接物理删除。

建议：

```text
soft delete
```

例如：

```text
status = deleted
```

尤其适用于：

* Event；
* Comment；
* Resource；
* Media。

管理员可以保留历史记录。

---

# 30. 数据来源字段

建议后续所有核心事实增加来源追踪。

例如：

```text
data_sources
--------------------------------
id
target_type
target_id

source_url
source_type

submitted_by
created_at
```

方便判断：

> 这个演员信息从哪里来的？

对于社区维护网站非常重要。

---

# 31. 第一阶段实际需要建的表

不要第一天就实现全部。

MVP 优先：

```text
users

countries
cities
venues

works
productions
events

tags
event_tags

attendance

resources
media

comments

event_submissions
reports
```

people 可以在下一阶段加入。

---

# 32. 推荐 ER 核心

第一阶段最重要的关系：

```text
Country
  1
  │
  N
City
  1
  │
  N
Venue
  1
  │
  N
Event
  N
  │
  1
Production
  N
  │
  1
Work


User
 │
 ├── Attendance ── Event
 │
 ├── Comment ───── Event
 │
 ├── Media ─────── Event
 │
 ├── Resource ──── Event
 │
 └── Submission
```

---

# 33. 最关键的数据库约束

必须保证：

```text
一个用户不能重复标记同一个 Event 为“参加过”

一个 Venue 必须属于某个 City

一个 Event 必须属于 Venue 或拥有合法坐标

Production 必须属于 Work

评论必须属于真实 Event

上传媒体必须属于真实 Event

普通用户不能直接把 Event status 改成 published
```

---

# 34. Supabase RLS 基本规则

游客：

```text
读取 published Event
读取公开 Resource
读取公开 Comment
```

登录用户：

```text
创建自己的投稿
创建自己的 Resource
创建自己的 Comment
创建自己的 Attendance
```

用户只能：

```text
UPDATE / DELETE
WHERE user_id = auth.uid()
```

管理员：

```text
可以审核和修改全部数据
```

---

# 35. 数据模型开发顺序

建议实际开发：

```text
Step 1
Country / City / Venue

Step 2
Work / Production / Event

Step 3
地图查询

Step 4
User / Attendance

Step 5
Resource / Media

Step 6
Comments

Step 7
Submission / Review

Step 8
People / Tags / Advanced Search
```

这套数据模型确定后，后续页面、地图、搜索和社区系统都围绕它构建。
