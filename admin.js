
    // 全局数据状态池
    const appState = {
      currentRole: 'admin',      // 'admin' | 'user'
      adminPage: 'workspace',    // 'workspace' | 'dorms' | 'users'
      dormViewMode: 'card',      // 'card' | 'list' | 'compact'
      activeRechargeDormId: '',
      activeDormDetailId: '',
      userFilter: 'ALL',
      recentDormClicks: [],
      drawerTab: 'deduct',
      weekRange: 7,
      weekDateAgg: new Map(),
      weekWaterAgg: new Map(),

      // 宿舍数据集 (包含每日用电柱状图数据、50条流水)
      dorms: [],

      // 系统全局通知清单 (闭环)
      notifications: []
    };

    // ==========================================
    // 角色与多页面路由切换
    // ==========================================
    function switchRole(role) {
      appState.currentRole = role;
      const isAdmin = role === 'admin';

      document.getElementById('roleAdminBtn').className = isAdmin 
        ? "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 bg-white text-indigo-600 shadow-2xs"
        : "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 transition flex items-center space-x-1.5";

      document.getElementById('roleUserBtn').className = !isAdmin 
        ? "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 bg-white text-indigo-600 shadow-2xs"
        : "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 transition flex items-center space-x-1.5";

      document.getElementById('adminNavTabs').style.display = isAdmin ? 'flex' : 'none';
      document.getElementById('avatarBox').textContent = isAdmin ? '管' : '林';
      document.getElementById('userNameLabel').textContent = isAdmin ? '宿管总控制台' : '学生端';

      if (isAdmin) {
        document.getElementById('pageUserPortal').classList.add('hidden');
        switchAdminPage(appState.adminPage);
      } else {
        hideAllAdminPages();
        document.getElementById('pageUserPortal').classList.remove('hidden');
        renderUserPortal();
      }
    }

    function switchAdminPage(pageKey) {
      appState.adminPage = pageKey;
      ['workspace', 'meters', 'water', 'users'].forEach(p => {
        const tabBtn = document.getElementById(`tab${p.charAt(0).toUpperCase() + p.slice(1)}`);
        if (p === pageKey) {
          tabBtn.className = "py-3 border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-1.5 font-bold";
        } else {
          tabBtn.className = "py-3 border-b-2 border-transparent hover:text-slate-900 flex items-center space-x-1.5 font-medium";
        }
      });

      hideAllAdminPages();
      if (pageKey === 'workspace') {
        document.getElementById('pageAdminWorkspace').classList.remove('hidden');
        renderWorkspaceCanvas();
      } else if (pageKey === 'meters') {
        document.getElementById('pageAdminDorms').classList.remove('hidden');
        renderMeterPage();
      } else if (pageKey === 'water') {
        document.getElementById('pageAdminWater').classList.remove('hidden');
        renderWaterPage();
      } else if (pageKey === 'users') {
        document.getElementById('pageAdminUsers').classList.remove('hidden');
        renderUsersDirectory(appState.userFilter || 'ALL');
      }
    }

    function hideAllAdminPages() {
      document.getElementById('pageAdminWorkspace').classList.add('hidden');
      document.getElementById('pageAdminDorms').classList.add('hidden');
      document.getElementById('pageAdminWater').classList.add('hidden');
      document.getElementById('pageAdminUsers').classList.add('hidden');
    }

    // ==========================================
    // A1. 工作区 (Workspace Canvas) 与双简略图渲染
    // ==========================================
    function renderWorkspaceCanvas() {
      renderCanvasAlerts();
    }

    function renderCanvasAlerts() {
      const box = document.getElementById('canvasAlertList');
      if (!box) return;
      const count = document.getElementById('canvasAlertCount');
      if (count) count.textContent = `${appState.notifications.length} 条待处理`;
      box.innerHTML = appState.notifications.map(n => `
        <div class="p-2.5 bg-white border border-slate-200 rounded-lg text-xs flex justify-between items-center gap-2 shadow-2xs">
          <div class="min-w-0 flex-1">
            <div class="font-bold ${n.type === 'arrears' ? 'text-rose-600' : 'text-amber-600'}">${n.title}</div>
            <div class="text-2xs text-slate-400">${n.text}</div>
          </div>
          <button onclick="openDormDetailDrawer('${n.dormId}')" class="shrink-0 whitespace-nowrap self-center px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded text-2xs font-semibold">排查</button>
        </div>
      `).join('');
    }

    // 近7/30日水电趋势：用电按宿舍 daily 汇总，饮水按取水记录时间汇总（无数据则显示占位）
    function switchWeekRange(v) {
      appState.weekRange = Number(v) === 30 ? 30 : 7;
      const sub = document.getElementById('weekSubTitle');
      if (sub) sub.textContent = appState.weekRange === 30 ? '近 30 日水电消耗趋势' : '近 7 日水电消耗趋势';
      renderWeekChart(appState.weekDateAgg || new Map(), appState.weekWaterAgg || new Map(), appState.weekRange);
    }
    function renderWeekChart(dateAgg, waterAgg, range) {
      range = range || appState.weekRange || 7;
      const box = document.getElementById('weekChartBars');
      const labels = document.getElementById('weekChartLabels');
      if (!box || !labels) return;
      let dates = [...dateAgg.keys()];
      dates.sort((a, b) => (a === '今日' ? 1 : b === '今日' ? -1 : a < b ? -1 : 1));
      dates = dates.slice(-range);
      if (!dates.length) {
        box.innerHTML = '<div class="m-auto text-xs text-slate-400">暂无用电数据</div>';
        labels.innerHTML = '';
        return;
      }
      const maxKwh = Math.max(...dates.map(d => dateAgg.get(d).kwh), 0.1);
      const maxL = Math.max(...dates.map(d => waterAgg.get(d) || 0), 0.1);
      labels.style.gridTemplateColumns = `repeat(${dates.length}, minmax(0, 1fr))`;
      labels.className = 'ml-8 mt-2 text-center text-3xs text-slate-400 grid';
      box.innerHTML = dates.map((d, i) => {
        const e = dateAgg.get(d), w = waterAgg.get(d) || 0;
        const h1 = Math.max(5, Math.round((e.kwh / maxKwh) * 100));
        const h2 = Math.max(5, Math.round((w / maxL) * 100));
        const indigo = i === dates.length - 1 ? 'bg-indigo-600' : 'bg-indigo-400';
        const sky = i === dates.length - 1 ? 'bg-sky-500' : 'bg-sky-300';
        return `<div class="h-full flex items-end gap-1" title="${d} 用电 ${e.kwh.toFixed(1)} kWh / 用水 ${w.toFixed(1)} L"><i class="w-3 ${indigo} rounded-t block" style="height:${h1}%"></i><i class="w-3 ${sky} rounded-t block" style="height:${h2}%"></i></div>`;
      }).join('');
      labels.innerHTML = dates.map((d, i) => {
        const show = dates.length <= 10 || i % 5 === 0 || i === dates.length - 1;
        return `<span>${show ? d : ''}</span>`;
      }).join('');
    }

    // ==========================================
    // A2. 电表与直饮水设备管理
    const meterDevices = [];
    const waterDevices = [];
    let registeredWaterOrders = [];
    function stateBadge(text, type) { return '<span class="px-2 py-1 rounded-full text-2xs font-bold '+(type==='ok'?'bg-emerald-50 text-emerald-600':type==='warn'?'bg-amber-50 text-amber-600':'bg-rose-50 text-rose-600')+'"><i class="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1"></i>'+text+'</span>'; }
    function renderMeterPage() {
      const body = document.getElementById('meterTableBody');
      if (!body) return;
      const query = (document.getElementById('meterSearch')?.value || '').toLowerCase();
      const filter = document.getElementById('meterStatus')?.value || 'all';
      const rows = meterDevices.filter(device =>
        (device.id.toLowerCase().includes(query) || device.room.toLowerCase().includes(query)) &&
        (filter === 'all' || device.filter === filter)
      );
      body.innerHTML = rows.map(device => `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-5 py-4"><div class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">⚡</span><div><b class="text-slate-800">${device.room}</b><p class="text-2xs text-slate-400 mt-0.5">${device.id}</p></div></div></td>
          <td class="px-5 py-4 font-semibold">${device.power}</td><td class="px-5 py-4">${device.today}</td>
          <td class="px-5 py-4 font-bold ${device.balance <= 10 ? 'text-rose-600' : 'text-slate-800'}">¥ ${device.balance.toFixed(2)}</td>
          <td class="px-5 py-4">${stateBadge(device.online ? '在线' : '离线', device.online ? 'ok' : 'bad')}</td>
          <td class="px-5 py-4">${stateBadge(device.state, device.filter === 'normal' ? 'ok' : device.filter === 'warning' ? 'warn' : 'bad')}</td>
          <td class="px-5 py-4 text-right whitespace-nowrap"><button onclick="showToast('已打开电表实时数据与账户明细')" class="text-indigo-600 font-semibold mr-3">详情</button><button onclick="toggleMeter('${device.id}')" class="text-slate-500 font-semibold">${device.filter === 'normal' ? '断电' : '恢复'}</button></td>
        </tr>`).join('') || '<tr><td colspan="7" class="py-12 text-center text-slate-400">未找到匹配的电表设备</td></tr>';
    }
    function toggleMeter(id,btn){const x=meterDevices.find(v=>v.id===id);if(!x)return;x.filter=x.filter==='normal'?'off':'normal';x.state=x.filter==='normal'?'正常供电':'手动停电';x.power=x.filter==='normal'?'0.72 kW':'0.00 kW';if(id==='EM-NB-30402'&&window.CampusStore)CampusStore.setPower(x.filter==='normal'?'normal':'manual');if(x.backendRoomKey)fetch('/api/admin/device-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'power',roomKey:x.backendRoomKey,next:x.filter==='normal'?'normal':'manual'})});showToast('已通过 NB-IoT 下发'+(x.filter==='normal'?'合闸':'拉闸')+'指令');renderMeterPage();}
    function renderDormsPage(){renderMeterPage();}
    function renderWaterPage() {
      const body = document.getElementById('waterTableBody');
      if (!body) return;
      const query = (document.getElementById('waterSearch')?.value || '').toLowerCase();
      body.innerHTML = waterDevices.filter(device => device.id.toLowerCase().includes(query) || device.place.toLowerCase().includes(query)).map(device => `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-4 py-4"><div class="flex gap-3 items-center"><span class="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">💧</span><div><b>${device.place}</b><p class="text-2xs text-slate-400 mt-0.5">${device.id}</p></div></div></td>
          <td class="px-4 py-4 font-bold">${device.usage}</td><td class="px-4 py-4">${device.orders} 笔</td>
          <td class="px-4 py-4">${stateBadge(device.online ? '在线' : '离线', device.online ? 'ok' : 'bad')}</td><td class="px-4 py-4">${stateBadge(device.valve, device.valve === '开启' ? 'ok' : 'bad')}</td>
          <td class="px-4 py-4 text-right whitespace-nowrap"><button onclick="showToast('已打开计量与扣费流水')" class="text-sky-600 font-semibold mr-3">用水记录</button><button onclick="toggleWater('${device.id}')" class="text-slate-500 font-semibold">${device.valve === '开启' ? '关阀' : '开阀'}</button></td>
        </tr>`).join('');
      const list = document.getElementById('waterOrderList');
      if (list) list.innerHTML = registeredWaterOrders.length ? registeredWaterOrders.slice(0,6).map(order => `<div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl"><div><b class="text-xs">${order.name} · ${Number(order.liters).toFixed(1)} L</b><p class="text-3xs text-slate-400 mt-1">${order.place} · ${order.time}</p></div><span class="text-xs font-bold text-sky-600">¥${Number(order.amount).toFixed(2)}</span></div>`).join('') : '<p class="py-8 text-center text-xs text-slate-400">暂无取水记录</p>';
    }
    function toggleWater(id){const x=waterDevices.find(v=>v.id===id);if(!x)return;if(!x.online){showToast('设备离线，无法下发阀控指令');return}x.valve=x.valve==='开启'?'关闭':'开启';if(id==='WM-NB-E303'&&window.CampusStore)CampusStore.setWaterValve(x.valve);if(x.backendFloor)fetch('/api/admin/device-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'water',building:x.backendFloor.building,floor:x.backendFloor.floor,next:x.valve})});showToast('已通过 NB-IoT 下发'+(x.valve==='开启'?'开阀':'关阀')+'指令');renderWaterPage();}

    // A3. 用户与空间级联台 (User Cascading Matrix)
    // ==========================================
    function filterUsersByCascader(building) {
      appState.userFilter = building;
      document.querySelectorAll('[data-building]').forEach(button => {
        const active = button.dataset.building === building;
        button.className = active
          ? 'w-full text-left p-2.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex justify-between transition ring-1 ring-indigo-100'
          : 'w-full text-left p-2.5 rounded-lg hover:bg-slate-50 text-slate-600 flex justify-between transition';
      });
      renderUsersDirectory(building);
    }

    function renderUsersDirectory(buildingFilter) {
      const grid = document.getElementById('usersDirectoryGrid');
      let users = [];
      appState.dorms.forEach(d => {
        if (buildingFilter === 'ALL' || d.building === buildingFilter) {
          d.users.forEach(u => {
            users.push({ name: u, dormId: d.id, dormStatus: d.status, building: d.building });
          });
        }
      });

      document.getElementById('filteredUserCount').textContent = `共 ${users.length} 位学生`;
      grid.innerHTML = users.map(u => `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs hover:border-indigo-200 hover:shadow-md transition">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl ${u.dormStatus === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center font-bold text-sm">
              ${u.name.slice(0, 1)}
            </div>
            <div>
              <div class="flex items-center space-x-1.5">
                <span class="font-bold text-slate-900 text-xs">${u.name}</span>
                <span class="text-3xs px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono">${u.dormId}</span>
              </div>
              <span class="inline-flex items-center mt-1 text-2xs ${u.dormStatus === 'danger' ? 'text-rose-600' : 'text-emerald-600'}"><i class="w-1.5 h-1.5 rounded-full bg-current mr-1"></i>${u.dormStatus === 'danger' ? '所在宿舍欠费' : '宿舍用电正常'}</span>
            </div>
          </div>
          <!-- 嵌入原图组件：通知小图标 + 简略充值按钮 -->
          <div class="flex items-center space-x-2">
            <div class="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:text-indigo-600 relative">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              ${u.dormStatus === 'danger' ? '<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full"></span>' : ''}
            </div>
            <button onclick="openRechargeModal('${u.dormId}')" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-2xs font-bold rounded-lg transition">
              代充
            </button>
          </div>
        </div>
      `).join('');
    }

    // ==========================================
    // B1. 学生/用户端主页渲染 (User Portal)
    // ==========================================
    function renderUserPortal() {
      const dorm = appState.dorms.find(d => d.id === '3#402');
      const isDanger = dorm.balance < 0;

      document.getElementById('portalBalanceDisplay').textContent = `¥ ${dorm.balance.toFixed(2)}`;
      document.getElementById('portalBalanceDisplay').className = `text-3xl font-bold mt-0.5 ${isDanger ? 'text-rose-400' : 'text-emerald-400'}`;

      const statusBadge = document.getElementById('portalDormStatusBadge');
      statusBadge.className = `text-xs px-2 py-0.5 rounded-full font-bold ${isDanger ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`;
      statusBadge.textContent = isDanger ? '欠费拉闸中' : '供电正常';

      const noticeBox = document.getElementById('portalNoticeBox');
      if (isDanger) {
        noticeBox.className = "p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1 block";
        noticeBox.innerHTML = `
          <div class="font-bold flex items-center space-x-1">
            <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            <span>已触发欠费断电</span>
          </div>
          <p class="text-2xs leading-relaxed">您的宿舍余额已透支，公摊电闸已断开，请充值后自动复电。</p>
        `;
      } else {
        noticeBox.className = "p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1 block";
        noticeBox.innerHTML = `
          <div class="font-bold text-emerald-700">供电正常</div>
          <p class="text-2xs">当前剩余电费充足，请继续保持节约用电习惯。</p>
        `;
      }

      // 绘制用电柱状图
      const barsBox = document.getElementById('portalUsageBars');
      barsBox.innerHTML = dorm.dailyUsage.map((val) => `
        <div class="flex-1 bg-slate-200 hover:bg-indigo-500 rounded-t-xs transition relative group" style="height: ${val * 4}px">
          <div class="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-3xs px-1 rounded">
            ${val}度
          </div>
        </div>
      `).join('');
    }

    // ==========================================
    // 宿舍详细全量抽屉 (原图左上角「宿舍详细」)
    // ==========================================
    function openDormDetailDrawer(dormId) {
      const dorm = appState.dorms.find(d => d.id === dormId);
      if (!dorm) return;
      appState.activeDormDetailId = dormId;

      if (!appState.recentDormClicks.includes(dormId)) {
        appState.recentDormClicks.unshift(dormId);
        if (appState.recentDormClicks.length > 3) appState.recentDormClicks.pop();
        renderDormsPage();
      }

      document.getElementById('drawerDormTitle').textContent = `${dorm.id} 详细运行看板`;
      document.getElementById('drawerDormUsers').textContent = `物理位置: ${dorm.building} ${dorm.floor} · 常驻人员: ${dorm.users.join(' / ')}`;
      document.getElementById('drawerBalanceAmount').textContent = `¥ ${dorm.balance.toFixed(2)}`;

      const tag = document.getElementById('drawerStatusTag');
      tag.className = `text-2xs px-2 py-0.5 rounded-full font-bold ${dorm.status === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`;
      tag.textContent = dorm.statusText;

      document.getElementById('drawerRechargeActionBtn').onclick = () => openRechargeModal(dorm.id);

      // 渲染近两个月每日用电柱状图 (60 Days)
      const chart = document.getElementById('drawerChartBars');
      chart.innerHTML = dorm.dailyUsage.map(v => `
        <div class="flex-1 bg-slate-200 hover:bg-indigo-600 rounded-t-xs transition" style="height: ${v * 4}px"></div>
      `).join('');

      renderDrawerLogs(dorm);
      document.getElementById('dormDetailDrawer').classList.remove('hidden');
    }

    function closeDormDetailDrawer() {
      document.getElementById('dormDetailDrawer').classList.add('hidden');
    }

    function switchDrawerTab(tab) {
      appState.drawerTab = tab;
      const deductBtn = document.getElementById('tabDeductBtn');
      const rechargeBtn = document.getElementById('tabRechargeBtn');
      if (tab === 'deduct') {
        deductBtn.className = "pb-2 border-b-2 border-indigo-600 text-indigo-600 px-3 font-bold";
        rechargeBtn.className = "pb-2 text-slate-400 hover:text-slate-700 px-3";
      } else {
        rechargeBtn.className = "pb-2 border-b-2 border-indigo-600 text-indigo-600 px-3 font-bold";
        deductBtn.className = "pb-2 text-slate-400 hover:text-slate-700 px-3";
      }
      const dorm = appState.dorms.find(d => d.id === appState.activeDormDetailId);
      renderDrawerLogs(dorm);
    }

    function renderDrawerLogs(dorm) {
      const logBox = document.getElementById('drawerLogList');
      if (!dorm) { logBox.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">暂无该宿舍流水记录</div>'; return; }
      if (appState.drawerTab === 'deduct') {
        logBox.innerHTML = dorm.deductions.map(item => `
          <div class="py-2 flex justify-between items-center">
            <div>
              <div class="font-bold text-slate-800">${item.desc}</div>
              <div class="text-3xs text-slate-400">${item.time}</div>
            </div>
            <div class="text-right">
              <div class="font-bold text-slate-900">${item.amount}</div>
              <div class="text-3xs text-slate-400">余: ${item.balanceAfter}</div>
            </div>
          </div>
        `).join('');
      } else {
        logBox.innerHTML = dorm.recharges.map(item => `
          <div class="py-2 flex justify-between items-center">
            <div>
              <div class="font-bold text-slate-800">${item.channel}</div>
              <div class="text-3xs text-slate-400">${item.time}</div>
            </div>
            <div class="font-bold text-emerald-600">${item.amount}</div>
          </div>
        `).join('');
      }
    }

    // ==========================================
    // 通知中心抽屉
    // ==========================================
    function toggleNoticeDrawer(force) {
      const drawer = document.getElementById('noticeDrawer');
      if (force !== undefined) {
        force ? drawer.classList.remove('hidden') : drawer.classList.add('hidden');
      } else {
        drawer.classList.toggle('hidden');
      }
      renderNoticeDrawerList();
    }

    function renderNoticeDrawerList() {
      const list = document.getElementById('noticeDrawerList');
      const badge = document.getElementById('noticeBadge');

      if (appState.notifications.length === 0) {
        list.innerHTML = '<div class="text-center text-xs text-slate-400 py-10">系统当前无任何异常告警</div>';
        badge.classList.add('hidden');
        return;
      }

      badge.classList.remove('hidden');
      list.innerHTML = appState.notifications.map(n => `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold ${n.type === 'arrears' ? 'text-rose-600' : 'text-amber-600'}">${n.title}</span>
            <span class="text-3xs text-slate-400">${n.time}</span>
          </div>
          <p class="text-2xs text-slate-600">${n.text}</p>
          <div class="flex justify-end">
            ${n.type === 'arrears' 
              ? `<button onclick="openRechargeModal('${n.dormId}')" class="px-2.5 py-1 bg-rose-600 text-white rounded-md text-2xs font-bold">立即缴费复电</button>`
              : `<button onclick="openDormDetailDrawer('${n.dormId}')" class="px-2.5 py-1 bg-indigo-600 text-white rounded-md text-2xs font-bold">查阅曲线</button>`
            }
          </div>
        </div>
      `).join('');
    }

    // ==========================================
    // 财务充值闭环执行器 (逻辑闭环关键)
    // ==========================================
    function openRechargeModal(dormId) {
      appState.activeRechargeDormId = dormId;
      document.getElementById('rechargeModalTarget').textContent = `充值目标账户：${dormId} 宿舍`;
      document.getElementById('rechargeModal').classList.remove('hidden');
      toggleNoticeDrawer(false);
    }

    function closeRechargeModal() {
      document.getElementById('rechargeModal').classList.add('hidden');
    }

    function setModalAmount(val) {
      document.getElementById('modalAmountInput').value = val;
    }

    async function confirmRechargeAction() {
      const amount = parseFloat(document.getElementById('modalAmountInput').value) || 0;
      if (amount <= 0 || !Number.isFinite(amount)) { showToast('请输入有效金额'); return; }

      const dorm = appState.dorms.find(d => d.id === appState.activeRechargeDormId);
      if (!dorm) { showToast('宿舍不存在，无法充值'); return; }
      let restored = true;
      try {
        const resp = await fetch('/api/admin/recharge', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({roomKey:dorm.id, amount})});
        const data = await resp.json().catch(()=>({}));
        if (!resp.ok) { showToast(data.error || '充值失败，请稍后重试'); return; }
        dorm.balance = data.balance;
        restored = data.powerState === 'normal';
        dorm.status = restored ? 'normal' : 'danger';
        dorm.statusText = restored ? '供电正常' : (data.powerState === 'manual' ? '手动停电' : data.powerState === 'violation' ? '违规停电' : '欠费断电');
        dorm.recharges.unshift({
          channel: '管理员台代充',
          time: '刚刚',
          amount: `+¥${amount.toFixed(2)}`
        });
        const meter = meterDevices.find(m => m.backendRoomKey === dorm.id);
        if (meter) { meter.balance = dorm.balance; meter.filter = restored ? 'normal' : 'off'; meter.state = restored ? '正常供电' : '手动停电'; meter.power = restored ? '0.72 kW' : '0.00 kW'; }
        if (restored) appState.notifications = appState.notifications.filter(n => !(n.dormId === dorm.id && n.type === 'arrears'));
      } catch (_) {
        dorm.balance += amount;
        dorm.status = 'normal';
        dorm.statusText = '供电正常';
        dorm.recharges.unshift({channel:'管理员台代充（本地，未同步）',time:'刚刚',amount:`+¥${amount.toFixed(2)}`});
        showToast('网络异常，已本地记账，刷新后可能丢失');
        return;
      }

      closeRechargeModal();
      closeDormDetailDrawer();

      // 全局刷新（保留用户筛选）
      renderWorkspaceCanvas();
      renderDormsPage();
      renderUsersDirectory(appState.userFilter || 'ALL');
      if (document.getElementById('portalBalanceDisplay')) renderUserPortal();
      renderNoticeDrawerList();
      loadRegisteredStudents();

      showToast(restored ? `已成功为 ${appState.activeRechargeDormId} 注入 ¥${amount.toFixed(2)}，欠费告警已解除，供电恢复！` : `已成功为 ${appState.activeRechargeDormId} 注入 ¥${amount.toFixed(2)}，当前仍为${dorm.statusText}，需手动合闸恢复！`);
    }

    let toastTimer = null;
    function showToast(text) {
      const toast = document.getElementById('toast');
      document.getElementById('toastText').textContent = text;
      toast.classList.remove('hidden');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    function resetWorkspaceWidgets() {
      renderWorkspaceCanvas();
      showToast('工作区已重置为默认监控视图');
    }

    function mountWidget(type) {
      showToast(`已将微件成功挂载到工作区`);
    }

    // 初始化运行
    window.addEventListener('DOMContentLoaded', () => {
      switchRole('admin');
    });
  

    // 将学生端共享账户状态映射到管理端现有组件
    function syncSharedDataToAdmin(shared) {
      const room = shared.room;
      const dorm = appState.dorms.find(item => item.id === room.id);
      if (dorm) {
        dorm.balance = room.balance;
        dorm.status = room.powerState === 'normal' ? 'normal' : 'danger';
        dorm.statusText = room.powerState === 'normal' ? '供电正常' : room.powerState === 'violation' ? '违规停电' : room.powerState === 'arrears' ? '欠费断电' : '手动停电';
        dorm.users = room.students.slice();
      }
      const meter = meterDevices.find(item => item.id === 'EM-NB-30402');
      if (meter) {
        meter.balance = room.balance;
        meter.power = room.powerState === 'normal' ? `${room.power.toFixed(2)} kW` : '0.00 kW';
        meter.today = `${room.todayKwh.toFixed(1)} kWh`;
        meter.filter = room.powerState === 'normal' ? (room.balance <= 10 ? 'warning' : 'normal') : 'off';
        meter.state = room.powerState === 'normal' ? (room.balance <= 10 ? '余额预警' : '正常供电') : room.powerState === 'violation' ? '违规停电' : room.powerState === 'arrears' ? '欠费停电' : '手动停电';
      }
      const water = waterDevices.find(item => item.id === shared.water.meterId);
      if (water) {
        water.valve = shared.water.valve;
        water.online = shared.water.online;
        water.usage = `${shared.water.monthLiters.toFixed(1)} L`;
        water.orders = shared.water.records.length;
      }
      appState.notifications = shared.notifications.filter(item => !item.read && (item.level === 'danger' || item.level === 'warning')).map(item => ({
        id: item.id, dormId: room.id,
        type: item.level === 'danger' ? 'arrears' : 'anomaly',
        title: item.title, text: item.text, time: item.time
      }));
      if (appState.adminPage === 'workspace') renderWorkspaceCanvas();
      if (appState.adminPage === 'meters') renderMeterPage();
      if (appState.adminPage === 'water') renderWaterPage();
      if (appState.adminPage === 'users') renderUsersDirectory(appState.userFilter || 'ALL');
      renderNoticeDrawerList();
    }
    async function loadRegisteredStudents() {
      try {
        const response = await fetch('/api/admin/students', {cache:'no-store'});
        if (!response.ok) return;
        const payload = await response.json();
        registeredWaterOrders = payload.students.flatMap(student => (student.waterRecords || []).map(record => ({...record,name:student.name}))); 
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        appState.dorms = appState.dorms.filter(item => !item.backendRegistered);
        meterDevices.splice(0, meterDevices.length, ...meterDevices.filter(item => !item.backendRegistered));
        waterDevices.splice(0, waterDevices.length, ...waterDevices.filter(item => !item.backendRegistered));
        payload.rooms.forEach(room => {
          const occupants = payload.students.filter(student => student.roomKey === room.key);
          const roomNormal=(room.powerState||'normal')==='normal';
          const roomLow = roomNormal && (room.balance||0) <= 10;
          const daily = Array.isArray(room.daily) ? room.daily : [];
          appState.dorms.push({id:room.key,building:room.building,floor:`${room.floor}层`,balance:room.balance||0,status:roomNormal?'normal':'danger',statusText:roomNormal?'供电正常':'暂停供电',users:occupants.map(item=>item.name),
            dailyUsage: daily.length ? daily.map(d=>Number(d.kwh||0)) : Array(20).fill(0),
            deductions: daily.slice().reverse().map(d=>({desc:`${d.date} 用电 ${Number(d.kwh||0).toFixed(1)} kWh`,time:d.date,amount:`-¥${Number(d.fee||0).toFixed(2)}`,balanceAfter:'—'})).slice(0,50),
            recharges: (room.recharges||[]).map(r=>({channel:r.channel,time:r.time,amount:`+¥${Number(r.amount||0).toFixed(2)}`})),backendRegistered:true});
          meterDevices.push({id:`EM-NB-${room.key}`,room:room.label,power:roomNormal?`${Number(room.power||0).toFixed(2)} kW`:'0.00 kW',today:`${Number(room.todayKwh||0).toFixed(1)} kWh`,balance:room.balance||0,online:true,state:roomLow?'余额预警':(roomNormal?'正常供电':'手动停电'),filter:roomLow?'warning':(roomNormal?'normal':'off'),backendRegistered:true,backendRoomKey:room.key});
        });
        // 近7日用电按宿舍 daily 汇总，饮水按取水记录时间汇总
        const dateAgg = new Map(), waterAgg = new Map();
        payload.rooms.forEach(room => (room.daily||[]).forEach(d => {
          const e = dateAgg.get(d.date) || {kwh:0, fee:0};
          e.kwh += Number(d.kwh||0); e.fee += Number(d.fee||0); dateAgg.set(d.date, e);
        }));
        payload.students.forEach(student => (student.waterRecords||[]).forEach(record => {
          const m = String(record.time||'').match(/(\d{2}-\d{2})/);
          const key = m ? m[1] : (String(record.time||'').includes('今天') ? '今日' : null);
          if (key) waterAgg.set(key, (waterAgg.get(key)||0) + Number(record.liters||0));
        }));
        renderWeekChart(dateAgg, waterAgg);
        appState.weekDateAgg = dateAgg;
        appState.weekWaterAgg = waterAgg;
        // 本周累计固定按近 7 日口径汇总，不跟随选择器
        const week7 = [...dateAgg.keys()].sort((a, b) => (a === '今日' ? 1 : b === '今日' ? -1 : a < b ? -1 : 1)).slice(-7);
        setText('weekKwh', week7.reduce((s, d) => s + dateAgg.get(d).kwh, 0).toFixed(1));
        const floors = new Map();
        payload.students.forEach(student => {
          const key = `${student.building}-${student.floor}`;
          if (!floors.has(key)) floors.set(key, {students: [], waterUsage: 0, orders: 0, fee: 0, online: true, valve: student.waterValve, meterId: student.waterMeterId, building: student.building, floor: student.floor});
          const agg = floors.get(key);
          agg.students.push(student);
          agg.waterUsage += Number(student.waterUsage || 0);
          agg.orders += (student.waterRecords || []).length;
          agg.fee += (student.waterRecords || []).reduce((s, r) => s + Number(r.amount || 0), 0);
          if (student.waterOnline === false) agg.online = false;
          agg.valve = student.waterValve;
          agg.meterId = student.waterMeterId || agg.meterId;
        });
        floors.forEach(agg => waterDevices.push({id:agg.meterId||`WM-NB-${agg.building}-${agg.floor}F`,place:`${agg.building} ${agg.floor}层`,usage:`${agg.waterUsage.toFixed(1)} L`,orders:agg.orders,online:agg.online,valve:agg.valve,backendRegistered:true,backendFloor:{building:agg.building,floor:agg.floor}}));
        const waterOnline = [...floors.values()].filter(f => f.online).length;
        const waterOrders = [...floors.values()].reduce((s, f) => s + f.orders, 0);
        const waterFee = [...floors.values()].reduce((s, f) => s + f.fee, 0);
        const waterAbnormal = [...floors.values()].filter(f => !f.online).length;
        setText('waterOnlineCount', `${waterOnline} 台在线`);
        setText('waterTodayVolume', ([...floors.values()].reduce((s, f) => s + f.waterUsage, 0) / 1000).toFixed(2));
        setText('waterTodayOrders', `${waterOrders} 笔`);
        setText('waterTodayFee', `¥${waterFee.toFixed(2)}`);
        setText('waterAbnormalCount', String(waterAbnormal));
        setText('waterOfflineCount', `${waterAbnormal} 台停用`);
        const studentTotal = payload.students.length;
        const abnormalTotal = payload.students.filter(student => student.powerState !== 'normal').length;
        const totalElectricity = payload.rooms.reduce((sum, room) => sum + Number(room.todayKwh || 0), 0);
        const totalWaterLiters = payload.students.reduce((sum, student) => sum + Number(student.waterUsage || 0), 0);
        const alerts = payload.students.flatMap(student => (student.notifications || []).filter(item => !item.read && (item.level === 'danger' || item.level === 'warning')).map(item => ({...item, dormId: student.roomKey})));
        document.getElementById('registeredStudentTotal').textContent = `${studentTotal} 人`;
        document.getElementById('registeredAbnormalTotal').textContent = `${abnormalTotal} 人`;
        document.getElementById('allStudentCount').textContent = `${studentTotal}人`;
        document.getElementById('meterCount').firstChild.textContent = `${payload.rooms.length} `;
        document.getElementById('waterMeterCount').firstChild.textContent = `${floors.size} `;
        document.getElementById('overviewElectricity').innerHTML = `${totalElectricity.toFixed(1)} <span class="text-sm font-medium">kWh</span>`;
        document.getElementById('overviewWater').innerHTML = `${(totalWaterLiters / 1000).toFixed(2)} <span class="text-sm font-medium">m³</span>`;
        document.getElementById('overviewDevices').innerHTML = `${payload.rooms.length + floors.size} <span class="text-sm font-medium text-slate-400">台</span>`;
        document.getElementById('overviewAlerts').innerHTML = `${alerts.length} <span class="text-sm font-medium text-slate-400">条</span>`;
        const totalLoad = payload.rooms.reduce((sum, room) => sum + Number(room.power || 0), 0);
        const warnRooms = payload.rooms.filter(room => (room.powerState||'normal') === 'normal' && (room.balance||0) <= 10).length;
        const offRooms = payload.rooms.filter(room => (room.powerState||'normal') !== 'normal').length;
        const arrearsRooms = payload.rooms.filter(room => room.powerState === 'arrears').length;
        setText('liveLoad', `实时负荷 ${totalLoad.toFixed(1)} kW`);
        setText('perCapita', `人均 ${studentTotal ? (totalWaterLiters / studentTotal).toFixed(2) : '0.00'} L`);
        setText('deviceRunText', payload.rooms.length ? '运行正常' : '等待学生注册');
        setText('deviceAbnormalText', `${abnormalTotal} 台异常`);
        setText('alertRunText', alerts.length ? `${alerts.length} 条待处理` : '暂无告警');
        setText('weekWaterM3', (totalWaterLiters / 1000).toFixed(2));
        setText('meterCountSub', payload.rooms.length ? '已接入' : '等待注册');
        setText('meterTotalLoad', totalLoad.toFixed(1));
        setText('meterWarnCount', String(warnRooms));
        setText('meterOffCount', String(offRooms));
        setText('miniMeterCount', `${payload.rooms.length} / ${payload.rooms.length}`);
        setText('miniWaterCount', `${waterOnline} / ${floors.size}`);
        setText('miniArrearsCount', `${arrearsRooms} 间`);
        const setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`; };
        setWidth('miniMeterBar', payload.rooms.length ? 100 : 0);
        setWidth('miniWaterBar', floors.size ? (waterOnline / floors.size) * 100 : 0);
        setWidth('miniArrearsBar', payload.rooms.length ? (arrearsRooms / payload.rooms.length) * 100 : 0);
        appState.notifications = alerts.map(item => ({id:item.id,dormId:item.dormId || '',type:item.level==='danger'?'arrears':'anomaly',title:item.title,text:item.text,time:item.time}));
        const buildingCounts = new Map();
        payload.students.forEach(student => buildingCounts.set(student.building, (buildingCounts.get(student.building) || 0) + 1));
        document.getElementById('registeredBuildingFilters').innerHTML = buildingCounts.size ? [...buildingCounts].map(([building,count]) => `<button data-building="${building}" onclick="filterUsersByCascader('${building}')" class="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 text-slate-600 flex justify-between transition"><span>${building}</span><span class="text-slate-400">${count}人</span></button>`).join('') : '<p class="p-2 text-slate-400">暂无注册数据</p>';
        if (appState.adminPage === 'meters') renderMeterPage();
        if (appState.adminPage === 'water') renderWaterPage();
        if (appState.adminPage === 'users') renderUsersDirectory(appState.userFilter || 'ALL');
        if (appState.adminPage === 'workspace') renderWorkspaceCanvas();
        renderNoticeDrawerList();
      } catch (_) {}
    }
    async function logoutAdmin(){await fetch('/api/logout',{method:'POST'});location.href='/login.html'}
    loadRegisteredStudents();
    setInterval(loadRegisteredStudents, 3000);
  