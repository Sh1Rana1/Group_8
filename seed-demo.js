// 演示数据库生成脚本：node seed-demo.js
// 生成 1 管理员 + 9 演示学生（6 间宿舍，覆盖正常/余额预警/欠费/手动拉闸/水表离线等状态）。
// 写入目标：$env:VOLTDORM_DB_FILE 或 data/db.json。演示学生统一密码 12345678，管理员 admin/123456。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DB_FILE = process.env.VOLTDORM_DB_FILE
  ? path.resolve(process.env.VOLTDORM_DB_FILE)
  : path.join(ROOT, 'data', 'db.json');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

const FEE = 0.538; // 元/kWh，与 campus-data.js 一致
const feeOf = (kwh) => +((kwh * FEE).toFixed(2));
const nowIso = new Date().toISOString();

// 每日用电明细（近6天 + 今日）
function makeDaily(todayKwh) {
  const base = [
    ['09-03', 6.4], ['09-04', 7.1], ['09-05', 5.8],
    ['09-06', 8.0], ['09-07', 6.9], ['09-08', 7.2],
  ];
  const daily = base.map(([date, kwh]) => ({ date, kwh, fee: feeOf(kwh) }));
  daily.push({ date: '今日', kwh: todayKwh, fee: feeOf(todayKwh) });
  return daily;
}

// 演示学生定义
const DEMO_PASSWORD = '12345678';
const students = [
  { username: 'zhangwei', name: '张伟', building: '学三', floor: 4, room: 2 },
  { username: 'lina', name: '李娜', building: '学三', floor: 4, room: 2 },
  { username: 'wangqiang', name: '王强', building: '学三', floor: 4, room: 3 },
  { username: 'liuyang', name: '刘洋', building: '学三', floor: 3, room: 1 },
  { username: 'chenjing', name: '陈静', building: '学三', floor: 3, room: 1 },
  { username: 'zhaolei', name: '赵磊', building: '学一', floor: 2, room: 5 },
  { username: 'sunli', name: '孙丽', building: '学五', floor: 1, room: 2 },
  { username: 'zhoujie', name: '周杰', building: '学五', floor: 1, room: 2 },
  { username: 'wumin', name: '吴敏', building: '学一', floor: 3, room: 8 },
];

// 每间宿舍的电表状态（演示各种场景）
const roomStates = {
  '学三-4-02': { balance: 36.80, powerState: 'normal', power: 1.24, todayKwh: 6.8, monthKwh: 86.7,
    recharges: [
      { id: 'RC202609071820', amount: 50, channel: '微信支付', time: '09-07 18:20' },
      { id: 'RC202608281106', amount: 100, channel: '支付宝', time: '08-28 11:06' },
    ] },
  '学三-4-03': { balance: 8.50, powerState: 'normal', power: 0.86, todayKwh: 5.2, monthKwh: 64.3, recharges: [
      { id: 'RC202609051430', amount: 30, channel: '微信支付', time: '09-05 14:30' },
    ] },
  '学三-3-01': { balance: 0, powerState: 'arrears', power: 0, todayKwh: 4.1, monthKwh: 52.6, recharges: [] },
  '学一-2-05': { balance: 120.00, powerState: 'normal', power: 0.72, todayKwh: 3.4, monthKwh: 41.2, recharges: [
      { id: 'RC202609011000', amount: 200, channel: '支付宝', time: '09-01 10:00' },
    ] },
  '学五-1-02': { balance: 52.30, powerState: 'manual', power: 0, todayKwh: 2.9, monthKwh: 38.5, recharges: [
      { id: 'RC202609060915', amount: 100, channel: '微信支付', time: '09-06 09:15' },
    ] },
  '学一-3-08': { balance: 15.20, powerState: 'normal', power: 0.65, todayKwh: 4.6, monthKwh: 55.9, recharges: [
      { id: 'RC202609080800', amount: 50, channel: '校园卡', time: '09-08 08:00' },
    ] },
};

// 每人的饮水状态（学五-1 整层水表离线，演示离线场景）
const waterStates = {
  zhangwei: { balance: 18.60, monthLiters: 28.4, online: true, valve: '开启', records: [
      { id: 'WT202609091320', liters: 1.2, amount: 0.60, place: '3号楼一层饮水机', time: '今天 13:20' },
      { id: 'WT202609071846', liters: 0.8, amount: 0.40, place: '3号楼三层饮水机', time: '09-07 18:46' },
    ] },
  lina: { balance: 12.00, monthLiters: 19.6, online: true, valve: '开启', records: [
      { id: 'WT202609081200', liters: 1.0, amount: 0.50, place: '3号楼四层饮水机', time: '09-08 12:00' },
    ] },
  wangqiang: { balance: 5.50, monthLiters: 11.0, online: true, valve: '开启', records: [] },
  liuyang: { balance: 3.20, monthLiters: 8.4, online: true, valve: '关闭', records: [] },
  chenjing: { balance: 7.80, monthLiters: 12.2, online: true, valve: '关闭', records: [] },
  zhaolei: { balance: 22.40, monthLiters: 30.1, online: true, valve: '开启', records: [
      { id: 'WT202609071000', liters: 1.5, amount: 0.75, place: '1号楼二层饮水机', time: '09-07 10:00' },
    ] },
  sunli: { balance: 10.00, monthLiters: 15.5, online: false, valve: '关闭', records: [] },
  zhoujie: { balance: 6.40, monthLiters: 9.8, online: false, valve: '关闭', records: [] },
  wumin: { balance: 16.90, monthLiters: 21.3, online: true, valve: '开启', records: [
      { id: 'WT202609090930', liters: 0.8, amount: 0.40, place: '1号楼三层饮水机', time: '今天 09:30' },
    ] },
};

// 每人的通知（danger/warning 会出现在管理员告警，info 仅学生可见）
const notificationStates = {
  liuyang: [
    { id: 'ND1', type: 'power', level: 'danger', title: '欠费自动停电', text: '账户余额已用尽，平台已通过 NB-IoT 下发拉闸指令。', time: '今天 08:10', read: false },
  ],
  chenjing: [
    { id: 'ND2', type: 'power', level: 'danger', title: '欠费自动停电', text: '账户余额已用尽，平台已通过 NB-IoT 下发拉闸指令。', time: '今天 08:10', read: false },
  ],
  wangqiang: [
    { id: 'NW1', type: 'balance', level: 'warning', title: '用电余额提醒', text: '当前余额不足 10 元，预计可用约 3 天，请及时充值。', time: '今天 09:00', read: false },
  ],
  sunli: [
    { id: 'NW2', type: 'power', level: 'warning', title: '管理员暂停供电', text: '管理员已通过 NB-IoT 下发拉闸指令。', time: '昨天 20:15', read: false },
  ],
  zhoujie: [
    { id: 'NW3', type: 'power', level: 'warning', title: '管理员暂停供电', text: '管理员已通过 NB-IoT 下发拉闸指令。', time: '昨天 20:15', read: false },
  ],
};
function defaultNotifications() {
  return [{ id: 'NREG', type: 'system', level: 'info', title: '账户注册成功', text: '水电账户已开通，初始数据均为 0。', time: '09-01 10:00', read: true }];
}

// 组装
const adminSecured = hashPassword('123456');
const db = {
  version: 1,
  users: [{ id: 'admin', role: 'admin', username: 'admin', name: '系统管理员',
    salt: adminSecured.salt, passwordHash: adminSecured.hash, createdAt: nowIso }],
  rooms: {},
  studentData: {},
};

students.forEach((s, i) => {
  const secured = hashPassword(DEMO_PASSWORD);
  const roomKey = `${s.building}-${s.floor}-${String(s.room).padStart(2, '0')}`;
  const id = `stu_demo${String(i + 1).padStart(2, '0')}`;
  db.users.push({ id, role: 'student', username: s.username, name: s.name,
    building: s.building, floor: s.floor, room: s.room, roomKey,
    salt: secured.salt, passwordHash: secured.hash, createdAt: nowIso });
  if (!db.rooms[roomKey]) {
    const st = roomStates[roomKey];
    db.rooms[roomKey] = { key: roomKey, building: s.building, floor: s.floor, room: s.room,
      label: `${s.building} ${s.floor}层 ${s.room}室`, studentIds: [],
      balance: st.balance, powerState: st.powerState, power: st.power,
      todayKwh: st.todayKwh, monthKwh: st.monthKwh,
      daily: makeDaily(st.todayKwh), recharges: st.recharges };
  }
  db.rooms[roomKey].studentIds.push(id);
});

Object.values(db.rooms).forEach((room) => {
  const names = room.studentIds.map((id) => db.users.find((u) => u.id === id).name);
  room.studentIds.forEach((id) => {
    const u = db.users.find((x) => x.id === id);
    const w = waterStates[u.username];
    db.studentData[id] = {
      updatedAt: Date.now(),
      room: { id: room.key, building: room.building, floor: `${room.floor}层`,
        students: names.slice(), balance: room.balance,
        powerState: room.powerState, power: room.power,
        todayKwh: room.todayKwh, monthKwh: room.monthKwh },
      electricity: { daily: room.daily, recharges: room.recharges },
      water: { balance: w.balance, monthLiters: w.monthLiters,
        meterId: `WM-NB-${u.building}-${u.floor}F`,
        place: `${u.building}${u.floor}层直饮水机`,
        online: w.online, valve: w.valve, records: w.records },
      notifications: [...(notificationStates[u.username] || []), ...defaultNotifications()],
    };
  });
});

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`演示库已写入 ${DB_FILE}`);
console.log(`管理员 admin/123456；演示学生 ${students.length} 人（密码 ${DEMO_PASSWORD}）：${students.map((s) => s.username).join(', ')}`);
console.log(`宿舍 ${Object.keys(db.rooms).length} 间：${Object.keys(db.rooms).join(', ')}`);
