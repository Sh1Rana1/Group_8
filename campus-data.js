(function () {
  const KEY = 'voltdorm-campus-shared-v1';
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('voltdorm-campus-sync') : null;
  const defaults = {
    updatedAt: Date.now(),
    room: {
      id: '3#402', building: '桃园公寓 3号楼', floor: '4层',
      students: ['林子轩', '张逸飞', '周天宇'],
      balance: 36.80, powerState: 'normal', power: 1.24, todayKwh: 6.8,
      monthKwh: 86.7
    },
    electricity: {
      daily: [
        {date:'09-03', kwh:6.4, fee:3.44},{date:'09-04', kwh:7.1, fee:3.82},
        {date:'09-05', kwh:5.8, fee:3.12},{date:'09-06', kwh:8.0, fee:4.30},
        {date:'09-07', kwh:6.9, fee:3.71},{date:'09-08', kwh:7.2, fee:3.87},
        {date:'今日', kwh:6.8, fee:3.66}
      ],
      recharges: [
        {id:'RC202609071820', amount:50, channel:'微信支付', time:'09-07 18:20'},
        {id:'RC202608281106', amount:100, channel:'支付宝', time:'08-28 11:06'}
      ]
    },
    water: {
      balance: 18.60, monthLiters: 28.4,
      meterId: 'WM-NB-E303', place: '桃园公寓 3号楼三层', online: true, valve: '开启',
      records: [
        {id:'WT202609091320', liters:1.2, amount:0.60, place:'3号楼一层饮水机', time:'今天 13:20'},
        {id:'WT202609071846', liters:0.8, amount:0.40, place:'3号楼三层饮水机', time:'09-07 18:46'},
        {id:'WT202609061207', liters:1.5, amount:0.75, place:'3号楼一层饮水机', time:'09-06 12:07'}
      ]
    },
    notifications: [
      {id:'N1001', type:'balance', level:'warning', title:'用电余额提醒', text:'当前余额预计可用约 12 天，低于 10 元时将再次提醒。', time:'今天 09:00', read:false},
      {id:'N1002', type:'system', level:'info', title:'昨日用电账单已生成', text:'09月08日用电 7.2 kWh，费用 ¥3.87。', time:'今天 08:00', read:true}
    ]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return Object.assign(clone(defaults), JSON.parse(saved));
    } catch (_) {}
    return clone(defaults);
  }
  let state = load();
  const listeners = new Set();
  function emit() { listeners.forEach(fn => fn(clone(state))); window.dispatchEvent(new CustomEvent('campus-data-change', {detail:clone(state)})); }
  function save(source) {
    state.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    if (source !== 'channel' && channel) channel.postMessage(clone(state));
    emit();
  }
  async function pushBackend() {
    if (!backendStudent) return;
    try { await fetch('/api/my-data', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data:state})}); } catch (_) {}
  }
  function mutate(fn) { fn(state); save(); pushBackend(); return clone(state); }
  let backendStudent = false;
  let backendHydrated = false;
  async function hydrateFromBackend() {
    try {
      const response = await fetch('/api/my-data', {cache:'no-store'});
      if (!response.ok) return;
      const payload = await response.json();
      backendStudent = true;
      if (payload.data && (!backendHydrated || payload.data.updatedAt >= state.updatedAt)) { state=payload.data; backendHydrated=true; save('channel'); }
    } catch (_) {}
  }

  function notifyOnce(s, type, level, title, text) {
    const first = s.notifications[0];
    if (first && !first.read && first.title === title) return;
    s.notifications.unshift({ id: 'N' + Date.now(), type, level, title, text, time: '刚刚', read: false });
  }

  window.CampusStore = {
    get: () => clone(state),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    recharge(amount, channelName) {
      return mutate(s => {
        const value = Number(amount);
        s.room.balance = +(s.room.balance + value).toFixed(2);
        s.electricity.recharges.unshift({id:'RC'+Date.now(), amount:value, channel:channelName || '在线充值', time:'刚刚'});
        if (s.room.balance > 0 && s.room.powerState === 'arrears') {
          s.room.powerState = 'normal';
          s.notifications.forEach(n => { if (!n.read && n.type === 'power' && (n.level === 'danger' || n.level === 'warning')) n.read = true; });
          s.notifications.unshift({id:'N'+Date.now(),type:'power',level:'success',title:'充值复电成功',text:'充值已到账，平台已通过 NB-IoT 下发合闸指令。',time:'刚刚',read:false});
        }
      });
    },
    addElectricUsage(kwh) {
      return mutate(s => {
        const usage = Number(kwh);
        const fee = +(usage * 0.538).toFixed(2);
        if (s.room.powerState !== 'normal') {
          const map = {violation:'违规停电，无法用电', manual:'管理员已暂停供电，无法用电', arrears:'欠费停电，无法用电'};
          notifyOnce(s, 'power', 'warning', '停电中，无法用电', map[s.room.powerState] || '当前停电，无法用电。');
          return;
        }
        if (s.room.balance <= 0) {
          notifyOnce(s, 'balance', 'danger', '余额不足，无法用电', '请先完成电费充值。');
          return;
        }
        s.room.todayKwh = +(s.room.todayKwh + usage).toFixed(1);
        s.room.monthKwh = +(s.room.monthKwh + usage).toFixed(1);
        s.room.power = +(0.35 + usage * 0.42).toFixed(2);
        s.room.balance = +Math.max(0, s.room.balance - fee).toFixed(2);
        let today = s.electricity.daily.find(item => item.date === '今日');
        if (!today) { today={date:'今日',kwh:0,fee:0}; s.electricity.daily.push(today); }
        today.kwh = +(today.kwh + usage).toFixed(1); today.fee = +(today.fee + fee).toFixed(2);
        if (s.room.balance === 0) {
          s.room.powerState='arrears'; s.room.power=0;
          s.notifications.unshift({id:'N'+Date.now(),type:'power',level:'danger',title:'欠费自动停电',text:'账户余额已用尽，平台已通过 NB-IoT 下发拉闸指令。',time:'刚刚',read:false});
        }
      });
    },
    rechargeWater(amount) { return mutate(s => { s.water.balance=+(s.water.balance+Number(amount)).toFixed(2); }); },
    setPower(next, reason) {
      return mutate(s => {
        s.room.powerState = next;
        s.room.power = next === 'normal' ? 0.72 : 0;
        const map = {normal:['供电已恢复','管理员已下发合闸指令，宿舍恢复供电。','success'],violation:['违规用电告警','检测到疑似恶性负载，平台已自动跳闸。','danger'],manual:['设备已停止供电','管理员已远程下发拉闸指令。','warning'],arrears:['欠费停电提醒','账户余额为 0，平台已自动下发拉闸指令。','danger']};
        const item = map[next];
        s.notifications.unshift({id:'N'+Date.now(),type:'power',level:item[2],title:item[0],text:reason||item[1],time:'刚刚',read:false});
      });
    },
    setWaterValve(next) { return mutate(s => { s.water.valve = next; }); },
    addWaterRecord(liters, place) {
      return mutate(s => {
        const amount = +(Number(liters) * 0.5).toFixed(2);
        if (s.water.balance < amount || !s.water.online) {
          s.notifications.unshift({id:'N'+Date.now(),type:'water',level:'warning',title:'取水未完成',text:s.water.balance<amount?'饮水账户余额不足，请先充值。':'当前水表离线，无法下发开阀指令。',time:'刚刚',read:false});
          return;
        }
        s.water.balance = +(s.water.balance - amount).toFixed(2);
        s.water.monthLiters = +(s.water.monthLiters + Number(liters)).toFixed(1);
        s.water.records.unshift({id:'WT'+Date.now(),liters:Number(liters),amount,place:place||s.water.place,time:'刚刚'});
      });
    },
    markRead(id) { return mutate(s => { const n=s.notifications.find(x=>x.id===id); if(n)n.read=true; }); },
    deleteNotification(id) { return mutate(s => { s.notifications=s.notifications.filter(item=>item.id!==id); }); },
    reset() { state=clone(defaults); save(); }
  };
  window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) { state=JSON.parse(e.newValue); emit(); } });
  if (channel) channel.onmessage = e => { if (e.data && e.data.updatedAt > state.updatedAt) { state=e.data; save('channel'); } };
  hydrateFromBackend();
  setInterval(hydrateFromBackend, 3000);
})();
