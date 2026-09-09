const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.VOLTDORM_DB_FILE ? path.resolve(process.env.VOLTDORM_DB_FILE) : path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, user) {
  const actual = crypto.scryptSync(password, user.salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex'));
}
function initialDb() {
  const secured = hashPassword('123456');
  return { version: 1, users: [{ id:'admin', role:'admin', username:'admin', name:'系统管理员', salt:secured.salt, passwordHash:secured.hash, createdAt:new Date().toISOString() }], rooms:{}, studentData:{} };
}
function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive:true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initialDb(), null, 2));
}
function readDb() { ensureDb(); return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDb(db) { const tmp=DB_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(db,null,2)); fs.renameSync(tmp,DB_FILE); }
function json(res, code, body) { const text=JSON.stringify(body); res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(text),'Cache-Control':'no-store'}); res.end(text); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i).trim(),decodeURIComponent(v.slice(i+1))]})); }
function currentUser(req) { const token=parseCookies(req).vd_session; const session=token&&sessions.get(token); if(!session)return null; const db=readDb(); return db.users.find(u=>u.id===session.userId)||null; }
function safeUser(user) { return {id:user.id,role:user.role,username:user.username,name:user.name,building:user.building||null,floor:user.floor||null,room:user.room||null,roomKey:user.roomKey||null}; }
function readBody(req) { return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(e){reject(e)}});req.on('error',reject)}); }
function roomLabel(building,floor,room){return `${building} ${floor}层 ${room}室`;}
function newStudentState(user) {
  return {updatedAt:Date.now(),room:{id:user.roomKey,building:user.building,floor:`${user.floor}层`,students:[user.name],balance:0,powerState:'normal',power:0,todayKwh:0,monthKwh:0},electricity:{daily:[],recharges:[]},water:{balance:0,monthLiters:0,meterId:`WM-NB-${user.building}-${user.floor}F`,place:`${user.building}${user.floor}层直饮水机`,online:true,valve:'关闭',records:[]},notifications:[{id:'N'+Date.now(),type:'system',level:'info',title:'账户注册成功',text:'水电账户已开通，初始数据均为 0。',time:'刚刚',read:false}]};
}
function auth(req,res,role){const user=currentUser(req);if(!user){json(res,401,{error:'请先登录'});return null}if(role&&user.role!==role){json(res,403,{error:'无权访问'});return null}return user;}

async function api(req,res,url) {
  if (req.method==='POST'&&url.pathname==='/api/login') {
    const body=await readBody(req),db=readDb(); const user=db.users.find(u=>u.username===String(body.username||'').trim()&&u.role===body.role);
    if(!user||!verifyPassword(String(body.password||''),user)) return json(res,401,{error:'账号、密码或身份不正确'});
    const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{userId:user.id,createdAt:Date.now()});
    res.setHeader('Set-Cookie',`vd_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`); return json(res,200,{ok:true,user:safeUser(user),redirect:user.role==='admin'?'/admin.html':'/student.html'});
  }
  if (req.method==='POST'&&url.pathname==='/api/register') {
    const body=await readBody(req),db=readDb(); const username=String(body.username||'').trim(),name=String(body.name||'').trim(),password=String(body.password||''),building=String(body.building||''),floor=Number(body.floor),room=Number(body.room);
    if(!/^学([一二三四五六七八九十]|十一|十二|十三)$/.test(building)||floor<1||floor>5||room<1||room>14) return json(res,400,{error:'请选择有效的宿舍'});
    if(name.length<2||username.length<3||password.length<6) return json(res,400,{error:'姓名至少2位，账号至少3位，密码至少6位'});
    if(db.users.some(u=>u.username===username)) return json(res,409,{error:'该账号已被注册'});
    const secured=hashPassword(password),roomKey=`${building}-${floor}-${String(room).padStart(2,'0')}`,id='stu_'+crypto.randomBytes(8).toString('hex');
    const user={id,role:'student',username,name,building,floor,room,roomKey,salt:secured.salt,passwordHash:secured.hash,createdAt:new Date().toISOString()}; db.users.push(user);
    if(!db.rooms[roomKey]) db.rooms[roomKey]={key:roomKey,building,floor,room,label:roomLabel(building,floor,room),studentIds:[],balance:0,powerState:'normal',power:0,todayKwh:0,monthKwh:0,daily:[],recharges:[]};
    db.rooms[roomKey].studentIds.push(id); db.studentData[id]=newStudentState(user); db.studentData[id].room={...db.studentData[id].room,balance:db.rooms[roomKey].balance||0,powerState:db.rooms[roomKey].powerState||'normal',power:db.rooms[roomKey].power||0,todayKwh:db.rooms[roomKey].todayKwh||0,monthKwh:db.rooms[roomKey].monthKwh||0};db.studentData[id].electricity={daily:db.rooms[roomKey].daily||[],recharges:db.rooms[roomKey].recharges||[]}; db.studentData[id].room.students=db.rooms[roomKey].studentIds.map(uid=>db.users.find(u=>u.id===uid)?.name).filter(Boolean);
    for(const uid of db.rooms[roomKey].studentIds){if(db.studentData[uid])db.studentData[uid].room.students=db.studentData[id].room.students.slice()}
    writeDb(db); return json(res,201,{ok:true,message:'注册成功，请登录'});
  }
  if (req.method==='POST'&&url.pathname==='/api/logout') {const token=parseCookies(req).vd_session;if(token)sessions.delete(token);res.setHeader('Set-Cookie','vd_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
  if (req.method==='DELETE'&&url.pathname==='/api/account') {
    const user=auth(req,res,'student'); if(!user)return; const db=readDb(),room=db.rooms[user.roomKey];
    db.users=db.users.filter(item=>item.id!==user.id); delete db.studentData[user.id];
    if(room){room.studentIds=room.studentIds.filter(id=>id!==user.id);if(room.studentIds.length===0)delete db.rooms[user.roomKey];else{const names=room.studentIds.map(id=>db.users.find(item=>item.id===id)?.name).filter(Boolean);room.studentIds.forEach(id=>{if(db.studentData[id])db.studentData[id].room.students=names.slice()})}}
    writeDb(db); const token=parseCookies(req).vd_session;if(token)sessions.delete(token);res.setHeader('Set-Cookie','vd_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});
  }
  if (req.method==='GET'&&url.pathname==='/api/me') {const user=auth(req,res);if(!user)return;return json(res,200,{user:safeUser(user)});}
  if (req.method==='GET'&&url.pathname==='/api/my-data') {const user=auth(req,res,'student');if(!user)return;const db=readDb(),data=db.studentData[user.id],room=db.rooms[user.roomKey];if(data&&room){data.room={...data.room,id:room.key,building:room.building,floor:`${room.floor}层`,students:room.studentIds.map(id=>db.users.find(u=>u.id===id)?.name).filter(Boolean),balance:room.balance||0,powerState:room.powerState||'normal',power:room.power||0,todayKwh:room.todayKwh||0,monthKwh:room.monthKwh||0};data.electricity={daily:room.daily||[],recharges:room.recharges||[]}}return json(res,200,{user:safeUser(user),data});}
  if (req.method==='PUT'&&url.pathname==='/api/my-data') {const user=auth(req,res,'student');if(!user)return;const body=await readBody(req),db=readDb();if(!body.data||typeof body.data!=='object')return json(res,400,{error:'数据格式错误'});const incoming=body.data,room=db.rooms[user.roomKey];if(room){room.balance=Number(incoming.room?.balance)||0;room.powerState=incoming.room?.powerState||'normal';room.power=Number(incoming.room?.power)||0;room.todayKwh=Number(incoming.room?.todayKwh)||0;room.monthKwh=Number(incoming.room?.monthKwh)||0;room.daily=incoming.electricity?.daily||[];room.recharges=incoming.electricity?.recharges||[];room.studentIds.forEach(id=>{const existing=db.studentData[id];if(!existing)return;existing.room={...incoming.room,students:room.studentIds.map(uid=>db.users.find(u=>u.id===uid)?.name).filter(Boolean)};existing.electricity=incoming.electricity;existing.updatedAt=incoming.updatedAt||Date.now()})}db.studentData[user.id]={...incoming,water:incoming.water,notifications:incoming.notifications};writeDb(db);return json(res,200,{ok:true,updatedAt:Date.now()});}
  if (req.method==='GET'&&url.pathname==='/api/admin/students') {const user=auth(req,res,'admin');if(!user)return;const db=readDb();const students=db.users.filter(u=>u.role==='student').map(u=>{const data=db.studentData[u.id],room=db.rooms[u.roomKey];return {...safeUser(u),roomLabel:roomLabel(u.building,u.floor,u.room),balance:room?.balance||0,powerState:room?.powerState||'normal',todayKwh:room?.todayKwh||0,monthKwh:room?.monthKwh||0,waterBalance:data?.water?.balance||0,waterUsage:data?.water?.monthLiters||0,waterValve:data?.water?.valve||'关闭',waterOnline:data?.water?.online!==false,waterMeterId:data?.water?.meterId,waterRecords:data?.water?.records||[],notifications:data?.notifications||[],createdAt:u.createdAt}});return json(res,200,{students,rooms:Object.values(db.rooms)});}
  if (req.method==='POST'&&url.pathname==='/api/admin/device-action') {
    const user=auth(req,res,'admin'); if(!user)return; const body=await readBody(req),db=readDb();
    if(body.type==='power'){
      const room=db.rooms[body.roomKey]; if(!room)return json(res,404,{error:'宿舍不存在'}); room.powerState=body.next;
      room.studentIds.forEach(id=>{const data=db.studentData[id];if(!data)return;data.room.powerState=body.next;data.room.power=body.next==='normal'?0.72:0;data.updatedAt=Date.now();data.notifications.unshift({id:'N'+Date.now()+id,type:'power',level:body.next==='normal'?'success':'warning',title:body.next==='normal'?'供电已恢复':'管理员暂停供电',text:body.next==='normal'?'管理员已通过 NB-IoT 下发合闸指令。':'管理员已通过 NB-IoT 下发拉闸指令。',time:'刚刚',read:false})});
    } else if(body.type==='water'){
      db.users.filter(u=>u.role==='student'&&u.building===body.building&&u.floor===Number(body.floor)).forEach(u=>{const data=db.studentData[u.id];if(data){data.water.valve=body.next;data.updatedAt=Date.now()}});
    } else return json(res,400,{error:'无效的控制类型'});
    writeDb(db); return json(res,200,{ok:true});
  }
  return json(res,404,{error:'接口不存在'});
}

function serveFile(req,res,url) {
  let pathname=url.pathname;
  if(pathname==='/'||pathname==='/login')pathname='/login.html';
  const protectedRole=pathname==='/admin.html'?'admin':pathname==='/student.html'?'student':null;
  if(protectedRole){const user=currentUser(req);if(!user||user.role!==protectedRole){res.writeHead(302,{Location:'/login.html'});return res.end();}}
  const allowed=new Set(['/login.html','/admin.html','/student.html','/campus-data.js']);
  if(!allowed.has(pathname)) {res.writeHead(404);return res.end('Not found');}
  const file=path.join(ROOT,pathname.slice(1)); if(!fs.existsSync(file)){res.writeHead(404);return res.end('Not found')}
  const ext=path.extname(file); const type=ext==='.js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8'; const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':type,'Content-Length':content.length,'Cache-Control':'no-cache'});res.end(content);
}

ensureDb();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))await api(req,res,url);else serveFile(req,res,url)}catch(error){console.error(error);json(res,500,{error:'服务器内部错误'})}});
server.listen(PORT,()=>console.log(`VoltDorm server running at http://localhost:${PORT}`));
