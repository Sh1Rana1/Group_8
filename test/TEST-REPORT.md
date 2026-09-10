# VoltDorm OS 测试报告

> 分支：`fix/ux-critical-feedback` ｜ 工具：Node 24 + Playwright 1.63 + Chromium ｜ 截图：`test/screenshots/`（本地保留，不进仓库）

## 1. 环境与范围

- 后端零依赖（`http/fs/crypto`），`node server.js`，测试全程使用隔离库（`*-test-db.json`）与独立端口，正式 `data/db.json` 仅由 `seed-demo.js` 生成演示数据。
- 覆盖：`login.html` 全部表单/Tab/注册校验；`admin.html` 4 Tab + 3 弹窗 + 搜索筛选/拉合闸/阀控/代充；`student.html` 4 页面 + 充值/模拟用电/取水/通知；`campus-data.js` 12 方法；`server.js` 全部 API + 静态鉴权。

## 2. E2E 点击截图（41 张，全 PASS）

- S1 登录注册 8 张：默认 Tab/管理员 Tab（含 `adminHint`+自动填）/注册（13 栋 5 层 14 房）/登录失败红字/注册成功 toast/管理员落地。
- S2 管理员 17 张：4 Tab/电表搜索与 `normal/warning/off` 筛选/拉闸合闸 Toast/水阀开关系/用户级联筛选/代充弹窗/通知抽屉/宿舍抽屉与 Tab 切换。
- S3 学生 16 张：4 Nav/充值弹窗与非法金额/充值 50/模拟用电与耗尽欠费/余额 0/饮水充值取水/余额不足/离线/通知已读删除/注销确认。
- `pageerror`：S1/S3 为 0；S2 仅抽屉 Tab 一处（见缺陷 V6，已修）。

## 3. 发现缺陷与修复状态

| ID | 问题 | 等级 | 状态 |
|---|---|---|---|
| V1 | 注册 `floor/room` 非数字/小数绕过建脏房 | 高 | 已修（后端整数+范围校验） |
| V2/V3 | `PUT /my-data` 全信任客户端，可伪造余额/供电、缺字段清零 | 严重 | 已修（断电冻结+状态白名单+必填校验） |
| V4 | `rooms.power` 不同步致拉闸回滚 | 高 | 已修 |
| V5 | 宿舍抽屉 Tab 写死 `3#402` 切 Tab 崩溃 | 高 | 已修（`activeDormDetailId`+空 guard） |
| V6 | 管理员代充仅前端记账，刷新丢失 | 高 | 已修（新增 `POST /api/admin/recharge` 落库，欠费才自动复电） |
| V7 | 断电后学生仍可模拟用电扣费 | 高 | 已修（`CampusStore`+服务端双拦截） |
| V8 | 离线取水 Toast 误报成功 | 中 | 已修（先判 online 再判余额） |
| V9 | 用水 `orders:0` 写死、单人用量、表头静态假数据 | 中 | 已修（按楼聚合+表头动态） |
| V10 | 管理员告警含 `info`（注册成功）且排查空跳 | 中 | 已修（仅 `danger/warning`，`dormId` 正确映射） |
| V11 | 用户筛选被 3s 轮询冲回 ALL、Toast 竞态 | 中 | 已修（`userFilter` 保留+`toastTimer`） |
| V12 | `device-action` 状态无白名单、不存在楼层仍 200 | 中 | 已修（400/404） |

## 4. 回归证据（隔离库实测）

- 代充 `manual` 房：`200 balance88 powerState manual`，DB 持久，Toast 提示仍手动停电需合闸。
- 断电后恶意 PUT：`200` 但被忽略（余额/状态/功率/用电量不变）；恢复正常后合法用电 `87.46` 正常扣费。
- 告警：原始含 `info×2`，管理端仅展示 `warning/danger` 5 条中的真实告警。
- 用水：取水 1L 后楼聚合 `usage1 orders1 fee0.5`。
- 管理端加载 `pageerror 0`，登录/注册/鉴权 401/403/302 矩阵全通。

## 5. 演示库

`node seed-demo.js` 生成：管理员 `admin/123456`，学生 9 人（密码 `12345678`）6 间宿舍——正常/余额预警/欠费/手动拉闸/水表离线全场景。`data/db.json` 本地使用，不提交。
