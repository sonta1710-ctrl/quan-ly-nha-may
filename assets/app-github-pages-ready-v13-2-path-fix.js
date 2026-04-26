
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const statusMeta={running:{label:"Đang chạy",className:"running"},stopped:{label:"Dừng",className:"stopped"},error:{label:"Báo lỗi / bảo trì",className:"error"},planned:{label:"Chuẩn bị có lịch sản xuất",className:"maintenance"}};
const departmentPresets=[{id:"ep-nhua",name:"Ép nhựa"},{id:"phong-sach",name:"Phòng sạch"},{id:"dong-goi",name:"Đóng gói"},{id:"khuon",name:"Khuôn"}];
const defaultMachines=Array.from({length:24},(_,index)=>{const n=String(index+1).padStart(3,"0");const dept=departmentPresets[index%departmentPresets.length];const names=["Máy ép","Máy thổi","Máy đóng gói","Robot gắp","Chiller","Băng tải"];const statuses=["running","stopped","error","planned"];const row=Math.floor(index/6),col=index%6;return{id:`M-${n}`,name:`${names[index%names.length]} ${index+1}`,area:dept.name,departmentId:dept.id,departmentName:dept.name,status:statuses[index%statuses.length],note:`Thiết bị mẫu số ${index+1}`,x:Number((10+col*14.5).toFixed(2)),y:Number((18+row*14).toFixed(2)),updatedAt:null};});
const VALID_ROLES=["admin","operator","department","viewer"];
const appState={firebaseReady:false,editMode:false,selectedMachineId:null,draggingId:null,machines:[],departments:[],users:[],db:null,auth:null,currentUser:null,currentProfile:null,selectedDepartmentFilter:""};

const $=(id)=>document.getElementById(id);
const origin=()=>window.location.origin;
function appBasePath(){
  const parts=location.pathname.split("/").filter(Boolean);
  if(location.hostname.endsWith("github.io") && parts.length){ return "/" + parts[0]; }
  return "";
}
function appUrl(path){
  const p=path.startsWith("/")?path:"/"+path;
  return origin()+appBasePath()+p;
}
function setAuthButtonsVisible(loggedIn){const loginBtn=$("loginBtn"),logoutBtn=$("logoutBtn"); if(loginBtn) loginBtn.classList.toggle("hidden",loggedIn); if(logoutBtn) logoutBtn.classList.toggle("hidden",!loggedIn);}
const firebaseConfig = {
  apiKey: "AIzaSyB0swKLdrzzDXFS-YY6RTFiH7J8tg3_1SI",
  authDomain: "quanlythietbi-d3ba6.firebaseapp.com",
  projectId: "quanlythietbi-d3ba6",
  storageBucket: "quanlythietbi-d3ba6.firebasestorage.app",
  messagingSenderId: "944772016712",
  appId: "1:944772016712:web:e301c531040a045275067d"
};
window.fillFirebaseConfig=function(){};
window.saveFirebaseConfig=function(){};
window.clearFirebaseConfig=function(){};

function setBootStatus(text, kind){
  notice("syncStatus", text, kind);
  if($("loginInfo")){
    $("loginInfo").textContent = text;
    $("loginInfo").className = "notice";
    if(kind==="err") $("loginInfo").classList.add("err");
    if(kind==="warn") $("loginInfo").classList.add("warn");
  }
}

function notice(id,text,kind){const el=$(id); if(!el) return; el.textContent=text; el.className="notice"; if(kind==="warn") el.classList.add("warn"); if(kind==="err") el.classList.add("err");}
function isPage(name){return location.pathname.endsWith(name)||(name==="index.html"&&(location.pathname==="/"||location.pathname===""));}
function badgeHtml(status){const m=statusMeta[status]; return `<span class="badge ${m.className}">${m.label}</span>`;}
function parseMachineId(input){const m=(input||"").match(/M-\d{3,}/i); return m?m[0].toUpperCase():null;}
function parseDepartmentId(input){if(!input) return null; let m=input.match(/\/department\/([a-z0-9-]+)/i); if(m) return m[1].toLowerCase(); m=input.match(/department\.html\?id=([a-z0-9-]+)/i); if(m) return m[1].toLowerCase(); m=input.match(/[a-z0-9-]{3,}/i); return m?m[0].toLowerCase():null;}

const CACHE_TTL_MS = 2 * 60 * 1000;
function cacheKey(name){ return `factory_cache_${name}_${firebaseConfig.projectId}`; }
function saveCache(name,data){ try{ localStorage.setItem(cacheKey(name), JSON.stringify({time:Date.now(),data})); }catch(e){} }
function loadCache(name){ try{ const raw=localStorage.getItem(cacheKey(name)); if(!raw) return null; const parsed=JSON.parse(raw); if(Date.now()-parsed.time>CACHE_TTL_MS) return null; return parsed.data; }catch(e){ return null; } }
function applyCachedRootData(){ const machines=loadCache("machines"), departments=loadCache("departments"); if(Array.isArray(machines)) appState.machines=machines; if(Array.isArray(departments)) appState.departments=departments; }

window.openScanInput=function(){const val=$("scanInput")?.value||""; const mid=parseMachineId(val); if(mid) return location.href=`machine.html?id=${encodeURIComponent(mid)}`; const did=parseDepartmentId(val); if(did) return location.href=`department.html?id=${encodeURIComponent(did)}`; alert("Mã không hợp lệ.");}

async function initFirebase(){
  try{
    const app = initializeApp(firebaseConfig);
    appState.db = getFirestore(app);
    appState.auth = getAuth(app);
    appState.firebaseReady = true;
    return true;
  }catch(err){
    console.error(err);
    notice("syncStatus","Firebase config trong code chưa được điền đúng.","err");
    return false;
  }
}
window.login=async function(){
  const email=$("loginEmail")?.value.trim();
  const password=$("loginPassword")?.value||"";
  if(!email||!password) return alert("Nhập email và mật khẩu.");
  try{
    setBootStatus("Đang đăng nhập...");
    await signInWithEmailAndPassword(appState.auth,email,password);
  }catch(err){
    console.error(err);
    let msg="Đăng nhập thất bại.";
    if(err.code==="auth/invalid-credential"||err.code==="auth/wrong-password") msg="Email hoặc mật khẩu không đúng.";
    else if(err.code==="auth/user-not-found") msg="Tài khoản này chưa có trong Firebase Authentication.";
    else if(err.code==="auth/too-many-requests") msg="Tài khoản bị tạm khóa do thử sai nhiều lần. Chờ một lúc rồi thử lại.";
    else if(err.code==="auth/unauthorized-domain") msg="Tên miền Netlify chưa được thêm vào Firebase Authentication > Settings > Authorized domains.";
    else if(err.code==="auth/configuration-not-found") msg="Firebase Authentication chưa bật Email/Password hoặc config sai project.";
    else if(err.code) msg=`Đăng nhập thất bại: ${err.code}`;
    setBootStatus(msg,"err");
    alert(msg);
  }
}
window.registerAccount=async function(){
  const email=$("loginEmail")?.value.trim();
  const password=$("loginPassword")?.value||"";
  if(!email||!password) return alert("Nhập email và mật khẩu.");
  try{
    setBootStatus("Đang tạo tài khoản...");
    const cred=await createUserWithEmailAndPassword(appState.auth,email,password);
    try{
      await setDoc(doc(appState.db,"users",cred.user.uid),{uid:cred.user.uid,email,displayName:email,role:"viewer",departmentId:null,createdAt:serverTimestamp()},{merge:true});
      setBootStatus("Đã tạo tài khoản viewer. Admin có thể gán role.");
      alert("Đã tạo tài khoản viewer. Admin có thể gán role.");
    }catch(e){
      console.error(e);
      setBootStatus(`Tạo Auth thành công nhưng chưa tạo được quyền Firestore. UID: ${cred.user.uid}. Admin cần tạo document users/${cred.user.uid}`,"err");
      alert(`Tạo Auth thành công nhưng chưa tạo được quyền Firestore. UID: ${cred.user.uid}`);
    }
  }catch(err){
    console.error(err);
    let msg="Tạo tài khoản thất bại.";
    if(err.code==="auth/email-already-in-use") msg="Email này đã có tài khoản.";
    else if(err.code==="auth/weak-password") msg="Mật khẩu cần tối thiểu 6 ký tự.";
    else if(err.code==="auth/unauthorized-domain") msg="Domain Netlify chưa được thêm vào Firebase Authentication > Settings > Authorized domains.";
    else if(err.code) msg=`Tạo tài khoản thất bại: ${err.code}`;
    setBootStatus(msg,"err");
    alert(msg);
  }
}
window.logout=async function(){if(appState.auth) await signOut(appState.auth); location.href="login.html";}

async function loadCurrentProfile(uid){
  const ref=doc(appState.db,"users",uid);
  const snap=await getDoc(ref);
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}
const canAccessAdmin=()=>appState.currentProfile&&appState.currentProfile.role==="admin";
const canViewMachine=()=>VALID_ROLES.includes((appState.currentProfile&&appState.currentProfile.role)||"");
function canEditMachine(machine){if(!appState.currentProfile||!machine) return false; if(appState.currentProfile.role==="admin") return true; if(appState.currentProfile.role==="operator") return true; return appState.currentProfile.role==="department"&&appState.currentProfile.departmentId===machine.departmentId;}
function canChangeMachineStatus(machine){if(!appState.currentProfile||!machine) return false; if(appState.currentProfile.role==="admin") return true; if(appState.currentProfile.role==="operator") return true; return appState.currentProfile.role==="department"&&appState.currentProfile.departmentId===machine.departmentId;}
async function addHistory(machineId,action){
  const user=appState.auth.currentUser;
  await addDoc(collection(appState.db,"machines",machineId,"history"),{
    action,
    changedByUid:user?.uid||"",
    changedByEmail:user?.email||"",
    changedByName:appState.currentProfile?.displayName||user?.email||"Không rõ",
    changedAt:serverTimestamp()
  });
}
function getMachineById(id){return appState.machines.find(m=>m.id.toLowerCase()===id.toLowerCase());}

async function loadRootDataOnce(cb){
  applyCachedRootData();
  cb&&cb();
  try{
    const machineSnap=await getDocs(collection(appState.db,"machines"));
    appState.machines=machineSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
    saveCache("machines",appState.machines);
  }catch(err){ console.error("load machines failed",err); notice("syncStatus","Không tải được danh sách máy. Kiểm tra quyền Firestore Rules.","err"); }
  try{
    const deptSnap=await getDocs(collection(appState.db,"departments"));
    appState.departments=deptSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
    saveCache("departments",appState.departments);
  }catch(err){ console.error("load departments failed",err); }
  if(appState.currentProfile?.role==="admin"){
    try{
      const userSnap=await getDocs(collection(appState.db,"users"));
      appState.users=userSnap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(err){ console.error("load users failed",err); appState.users=[]; }
  }else{
    appState.users=[];
  }
  cb&&cb();
}
window.refreshData=async function(){
  await loadRootDataOnce(()=>{fillDepartmentSelects(); renderIndexPage(); renderDepartmentPage(); renderMachinePage();});
};
function fillDepartmentSelects(){
  const options=['<option value="">-- chọn bộ phận --</option>'].concat(appState.departments.map(d=>`<option value="${d.id}">${d.name} (${d.id})</option>`)).join("");
  if($("manageMachineDepartmentId")) $("manageMachineDepartmentId").innerHTML=options;
  if($("userDepartmentIdInput")) $("userDepartmentIdInput").innerHTML=options;
}
window.seedMachines=async function(){
  const snap=await getDocs(collection(appState.db,"machines"));
  if(!snap.empty) return alert("Đã có dữ liệu machines rồi.");
  for(const dept of departmentPresets){await setDoc(doc(appState.db,"departments",dept.id),{id:dept.id,name:dept.name,qrPath:`${origin()}/department/${dept.id}`},{merge:true})}
  for(const machine of defaultMachines){await setDoc(doc(appState.db,"machines",machine.id),machine); await addHistory(machine.id,"Khởi tạo dữ liệu mẫu");}
  alert("Đã khởi tạo dữ liệu mẫu.");
}

function num(v){return Number(v||0)||0;}
/* removed duplicate calcProduction */

function perfClass(p){return p>=95?"running":p>=80?"maintenance":"error";}
function progressColorClass(p){return p>=95?"":p>=80?"warn":"bad";}
function renderProductionDashboard(){
  if(!isPage("index.html")) return;
  const machines=appState.machines||[];
  const totals=machines.reduce((a,m)=>{const p=calcProduction(m);a.target+=p.target;a.actual+=p.actual;return a;},{target:0,actual:0});
  const perf=totals.target>0?Math.round(totals.actual/totals.target*100):0;
  if($("productionKpis")) $("productionKpis").innerHTML=`
    <div class="stat stopped"><div>Mong muốn</div><div style="font-size:26px;font-weight:800">${totals.target.toLocaleString("vi-VN")}</div></div>
    <div class="stat ${perfClass(perf)}"><div>Thực tế</div><div style="font-size:26px;font-weight:800">${totals.actual.toLocaleString("vi-VN")}</div><div class="small">${perf}% tiến độ</div></div>
    <div class="stat ${perfClass(perf)}"><div>Tiến độ</div><div style="font-size:26px;font-weight:800">${perf}%</div></div>
    <div class="stat error"><div>Còn thiếu</div><div style="font-size:26px;font-weight:800">${Math.max(0,totals.target-totals.actual).toLocaleString("vi-VN")}</div></div>
    <div class="stat running"><div>Máy có dữ liệu</div><div style="font-size:26px;font-weight:800">${machines.filter(m=>num(m.targetQty)>0||num(m.actualQty)>0).length}</div></div>`;
  const deptMap={};
  machines.forEach(m=>{const d=m.departmentName||m.area||m.departmentId||"Khác";const p=calcProduction(m);deptMap[d]=deptMap[d]||{target:0,actual:0};deptMap[d].target+=p.target;deptMap[d].actual+=p.actual;});
  const max=Math.max(1,...Object.values(deptMap).map(d=>Math.max(d.target,d.actual)));
  if($("departmentProductionBars")) $("departmentProductionBars").innerHTML=Object.entries(deptMap).map(([name,d])=>{
    const pct=Math.round(d.actual/max*100); const rate=d.target>0?Math.round(d.actual/d.target*100):0;
    return `<div class="bar-row"><div class="small">${name}</div><div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="small">MW ${d.target.toLocaleString("vi-VN")} | TT ${d.actual.toLocaleString("vi-VN")}</div></div><div style="font-weight:800">${rate}%</div></div>`;
  }).join("");
  if($("okNgDonut")) $("okNgDonut").style.setProperty("--okdeg",(Math.min(100,perf)*3.6)+"deg");
  if($("okNgText")) $("okNgText").innerHTML=`${perf}%<div class="small">Tiến độ</div>`;
  if($("okNgSub")) $("okNgSub").textContent=`Thực tế ${totals.actual.toLocaleString("vi-VN")} / Mong muốn ${totals.target.toLocaleString("vi-VN")}`;
  const sorted=[...machines].map(m=>({m,p:calcProduction(m)})).filter(x=>x.p.target>0);
  const low=sorted.filter(x=>x.p.performance<80).sort((a,b)=>a.p.performance-b.p.performance).slice(0,5);
  const top=[...sorted].sort((a,b)=>b.p.performance-a.p.performance).slice(0,5);
  const mini=(arr,empty)=>arr.length?arr.map(x=>`<div class="item"><div class="row"><div><strong>${x.m.id} - ${x.m.name}</strong><div class="small">${x.m.departmentName||x.m.area||""}</div><div class="progress"><div class="progress-bar ${progressColorClass(x.p.performance)}" style="width:${Math.min(100,x.p.performance)}%"></div></div></div><div style="font-weight:800">${x.p.performance}%</div></div></div>`).join(""):`<div class="muted">${empty}</div>`;
  if($("lowProductionList")) $("lowProductionList").innerHTML=mini(low,"Chưa có máy dưới 80% hoặc chưa nhập sản lượng.");
  if($("topProductionList")) $("topProductionList").innerHTML=mini(top,"Chưa có dữ liệu sản lượng.");
  if($("productionTableBox")?.innerHTML) showProductionTable();
}
/* removed duplicate renderMachineProduction */


function renderStats(machines){const el=$("stats"); if(!el) return; const c={running:machines.filter(m=>m.status==="running").length,stopped:machines.filter(m=>m.status==="stopped").length,error:machines.filter(m=>m.status==="error").length,maintenance:machines.filter(m=>m.status==="maintenance").length}; el.innerHTML=`<div class="stat running"><div>Đang chạy</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${c.running}</div></div><div class="stat stopped"><div>Dừng</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${c.stopped}</div></div><div class="stat error"><div>Báo lỗi</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${c.error}</div></div><div class="stat maintenance"><div>Bảo trì</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${c.maintenance}</div></div>`;}
window.toggleEditMode=function(){if(!canAccessAdmin()) return alert("Chỉ admin được chỉnh layout tổng."); appState.editMode=!appState.editMode; $("toggleEditBtn")&&($("toggleEditBtn").textContent=appState.editMode?"Tắt kéo thả":"Bật kéo thả"); renderIndexPage();}
function updateSelectedInputs(){const m=appState.selectedMachineId?getMachineById(appState.selectedMachineId):null; $("selectedMachineInfo")&&($("selectedMachineInfo").value=m?`${m.id} - ${m.name}`:""); $("selectedMachineXY")&&($("selectedMachineXY").value=m?`x: ${Number(m.x).toFixed(2)}%, y: ${Number(m.y).toFixed(2)}%`:"");}
function ptr(evt,container){const r=container.getBoundingClientRect(); const cx=evt.touches?evt.touches[0].clientX:evt.clientX; const cy=evt.touches?evt.touches[0].clientY:evt.clientY; let x=((cx-r.left)/r.width)*100,y=((cy-r.top)/r.height)*100; x=Math.max(0,Math.min(100,x)); y=Math.max(0,Math.min(100,y)); return {x:Number(x.toFixed(2)),y:Number(y.toFixed(2))};}
function startDrag(id,evt){if(!appState.editMode||!canAccessAdmin()) return; appState.draggingId=id; appState.selectedMachineId=id; evt.preventDefault();}
function moveDrag(evt){if(!appState.editMode||!appState.draggingId) return; const container=$("layoutWrap"); if(!container) return; evt.preventDefault(); const pos=ptr(evt,container); const m=getMachineById(appState.draggingId); if(!m) return; m.x=pos.x; m.y=pos.y; updateSelectedInputs(); if(isPage("index.html")) drawAdminDotsOnly();}
async function endDrag(){if(!appState.draggingId) return; const id=appState.draggingId, m=getMachineById(id); appState.draggingId=null; if(!m) return; await updateDoc(doc(appState.db,"machines",id),{x:m.x,y:m.y,updatedAt:serverTimestamp()}); await addHistory(id,"Cập nhật vị trí chấm");}
window.copySelectedPosition=function(){const m=appState.selectedMachineId?getMachineById(appState.selectedMachineId):null; if(!m) return alert("Chưa chọn máy."); const t=`{ id: "${m.id}", x: ${m.x}, y: ${m.y} }`; navigator.clipboard?.writeText(t); $("exportBox")&&($("exportBox").value=t);}
window.exportPositions=function(){if($("exportBox")) $("exportBox").value=JSON.stringify(appState.machines.map(m=>({id:m.id,x:m.x,y:m.y})),null,2);}

window.loadManagedMachineToForm=function(){const m=appState.selectedMachineId?getMachineById(appState.selectedMachineId):null; if(!m) return alert("Chưa chọn máy."); const set=(id,val)=>{$(id)&&($(id).value=val??"")}; set("manageMachineId",m.id); set("manageMachineName",m.name); set("manageMachineArea",m.area); set("manageMachineDepartmentId",m.departmentId); set("manageDepartmentName",m.departmentName||m.area); set("manageMachineStatus",m.status); set("manageMachineX",m.x); set("manageMachineY",m.y); set("manageMachineNote",m.note||"");}
window.fillFormFromSelectedPosition=function(){const m=appState.selectedMachineId?getMachineById(appState.selectedMachineId):null; if(!m) return alert("Chưa chọn máy."); $("manageMachineX")&&($("manageMachineX").value=m.x); $("manageMachineY")&&($("manageMachineY").value=m.y);}
window.clearManagedMachineForm=function(){["manageMachineId","manageMachineName","manageMachineArea","manageMachineDepartmentId","manageDepartmentName","manageMachineX","manageMachineY","manageMachineNote"].forEach(id=>{$(id)&&($(id).value="")}); $("manageMachineStatus")&&($("manageMachineStatus").value="running");}
window.saveManagedMachine=async function(){
  if(!canAccessAdmin()) return alert("Chỉ admin được thêm/sửa máy ở form quản trị.");
  const get=id=>$(id)?$(id).value.trim():"";
  const id=get("manageMachineId").toUpperCase(),name=get("manageMachineName"),area=get("manageMachineArea"),departmentId=get("manageMachineDepartmentId").toLowerCase(),departmentName=get("manageDepartmentName")||area,status=$("manageMachineStatus")?.value||"running",x=Number(get("manageMachineX")),y=Number(get("manageMachineY")),note=get("manageMachineNote");
  if(!/^M-\d{3,}$/.test(id)) return alert("Mã máy nên theo dạng M-001.");
  if(!name||!area||!departmentId) return alert("Thiếu tên máy / bộ phận / mã bộ phận.");
  if(Number.isNaN(x)||x<0||x>100||Number.isNaN(y)||y<0||y>100) return alert("Tọa độ X/Y phải từ 0 đến 100.");
  const existed=getMachineById(id);
  await setDoc(doc(appState.db,"machines",id),{id,name,area,departmentId,departmentName,status,x:Number(x.toFixed(2)),y:Number(y.toFixed(2)),note,updatedAt:serverTimestamp()},{merge:true});
  await setDoc(doc(appState.db,"departments",departmentId),{id:departmentId,name:departmentName,qrPath:`${origin()}/department/${departmentId}`},{merge:true});
  await addHistory(id,existed?"Cập nhật thông tin máy":"Thêm máy mới");
  appState.selectedMachineId=id;
  alert(existed?"Đã cập nhật máy.":"Đã thêm máy mới.");
}
window.deleteManagedMachine=async function(){if(!canAccessAdmin()) return alert("Chỉ admin được xóa máy."); const id=($("manageMachineId")?.value||"").trim().toUpperCase(); if(!id) return alert("Nhập mã máy cần xóa."); if(!confirm(`Xóa máy ${id}?`)) return; await deleteDoc(doc(appState.db,"machines",id)); alert("Đã xóa máy.");}
window.saveDepartment=async function(){if(!canAccessAdmin()) return alert("Chỉ admin."); const id=($("departmentIdInput")?.value||"").trim().toLowerCase(),name=($("departmentNameInput")?.value||"").trim(); if(!id||!name) return alert("Nhập mã và tên bộ phận."); await setDoc(doc(appState.db,"departments",id),{id,name,qrPath:appUrl(`/department.html?id=${id}`),updatedAt:serverTimestamp()},{merge:true}); $("departmentQrLink")&&($("departmentQrLink").textContent=appUrl(`/department.html?id=${id}`)); alert("Đã lưu bộ phận.");}
window.deleteDepartment=async function(){if(!canAccessAdmin()) return alert("Chỉ admin."); const id=($("departmentIdInput")?.value||"").trim().toLowerCase(); if(!id) return alert("Nhập mã bộ phận cần xóa."); if(!confirm(`Xóa bộ phận ${id}?`)) return; await deleteDoc(doc(appState.db,"departments",id)); alert("Đã xóa bộ phận.");}
window.generateDepartmentQr=function(){const id=($("departmentIdInput")?.value||"").trim().toLowerCase(); if(!id) return alert("Nhập mã bộ phận."); $("departmentQrLink")&&($("departmentQrLink").textContent=appUrl(`/department.html?id=${id}`));}
window.saveUserRole=async function(){if(!canAccessAdmin()) return alert("Chỉ admin."); const uid=($("userUidInput")?.value||"").trim(),email=($("userEmailInput")?.value||"").trim(),displayName=($("userDisplayNameInput")?.value||"").trim()||email,role=$("userRoleInput")?.value||"viewer",departmentId=($("userDepartmentIdInput")?.value||"").trim().toLowerCase()||null; if(!uid) return alert("Nhập UID."); await setDoc(doc(appState.db,"users",uid),{uid,email,displayName,role,departmentId,updatedAt:serverTimestamp()},{merge:true}); alert("Đã lưu quyền người dùng.");}
window.deleteUserRole=async function(){if(!canAccessAdmin()) return alert("Chỉ admin."); const uid=($("userUidInput")?.value||"").trim(); if(!uid) return alert("Nhập UID."); if(!confirm(`Xóa user doc ${uid}?`)) return; await deleteDoc(doc(appState.db,"users",uid)); alert("Đã xóa user doc.");}
window.selectDepartmentFilter=function(id){appState.selectedDepartmentFilter=id||""; renderIndexPage();}

function drawAdminDotsOnly(){
  const dots=$("dotsLayer"),search=$("searchInput"); if(!dots||!search) return;
  const q=search.value.trim().toLowerCase();
  let filtered=appState.machines;
  if(appState.selectedDepartmentFilter) filtered=filtered.filter(m=>m.departmentId===appState.selectedDepartmentFilter);
  if(q) filtered=filtered.filter(m=>[m.id,m.name,m.area,m.departmentId].join(" ").toLowerCase().includes(q));
  dots.innerHTML=filtered.map(m=>{const cls=`dot ${m.status} ${appState.selectedMachineId===m.id?"selected":""}`; return `<a class="${cls}" href="machine.html?id=${encodeURIComponent(m.id)}" data-id="${m.id}" style="left:${m.x}%;top:${m.y}%" title="${m.id} - ${m.name} - ${m.departmentName||m.area}"></a>`;}).join("");
  syncLayoutOverlay(); Array.from(dots.querySelectorAll(".dot")).forEach(el=>{const id=el.getAttribute("data-id"); el.addEventListener("click",e=>{if(appState.editMode){e.preventDefault(); appState.selectedMachineId=id; window.loadManagedMachineToForm(); updateSelectedInputs(); renderIndexPage();}}); el.addEventListener("mousedown",e=>startDrag(id,e)); el.addEventListener("touchstart",e=>startDrag(id,e),{passive:false});});
}
function renderDepartmentFilterChips(){const wrap=$("departmentFilterChips"); if(!wrap) return; wrap.innerHTML=appState.departments.map(d=>`<button class="filter-chip ${appState.selectedDepartmentFilter===d.id?"active":""}" onclick="selectDepartmentFilter('${d.id}')">${d.name}</button>`).join(""); if($("allDeptChip")) $("allDeptChip").className=`filter-chip ${!appState.selectedDepartmentFilter?"active":""}`;}
function renderDepartmentsList(){const list=$("departmentsList"); if(!list) return; list.innerHTML=appState.departments.map(d=>{const count=appState.machines.filter(m=>m.departmentId===d.id).length; const active=appState.selectedDepartmentFilter===d.id?"active":""; return `<div class="dept-item ${active}"><div class="row"><div><div style="font-weight:800">${d.name}</div><div class="muted">${d.id}</div><div class="small">${count} máy</div><div class="small">QR: ${origin()}/department/${d.id}</div></div><div class="toolbar"><button class="btn btn-light" onclick="selectDepartmentFilter('${d.id}')">Xem máy</button><button class="btn btn-light" onclick="document.getElementById('departmentIdInput').value='${d.id}';document.getElementById('departmentNameInput').value='${(d.name||'').replace(/'/g,"\\'")}';generateDepartmentQr()">Nạp</button></div></div></div>`;}).join("");}
function renderUsersList(){const list=$("usersList"); if(!list) return; list.innerHTML=appState.users.map(u=>`<div class="user-item"><div class="row"><div><div style="font-weight:800">${u.displayName||u.email||u.id}</div><div class="muted">${u.email||"-"}</div><div class="small">UID: ${u.id}</div><div class="small">Role: ${u.role||"-"} | Dept: ${u.departmentId||"-"}</div></div><button class="btn btn-light" onclick="document.getElementById('userUidInput').value='${u.id}';document.getElementById('userEmailInput').value='${u.email||""}';document.getElementById('userDisplayNameInput').value='${(u.displayName||"").replace(/'/g,"\\'")}';document.getElementById('userRoleInput').value='${u.role||"viewer"}';document.getElementById('userDepartmentIdInput').value='${u.departmentId||""}'">Nạp</button></div></div>`).join("");}

function applyRoleUI(){
  const role=appState.currentProfile?.role||"-";
  $("rolePill")&&($("rolePill").textContent=`Role: ${role}`);
  const isAdmin=role==="admin";
  ["machineAdminPanel","departmentAdminPanel","userAdminPanel","toggleEditBtn"].forEach(id=>{$(id)&&$(id).classList.toggle("hidden",!isAdmin);});
}
function renderIndexPage(){
  if(!isPage("index.html")) return;
  if(!canViewMachine()) return;
  applyRoleUI();
  fillDepartmentSelects();
  const search=$("searchInput"),list=$("machineList"),pill=$("machineCountPill"); if(!search||!list) return;
  if(!search.dataset.bound){search.addEventListener("input",renderIndexPage); document.addEventListener("mousemove",moveDrag); document.addEventListener("touchmove",moveDrag,{passive:false}); document.addEventListener("mouseup",endDrag); document.addEventListener("touchend",endDrag); search.dataset.bound="1";}
  if(!appState.selectedMachineId&&appState.machines.length) appState.selectedMachineId=appState.machines[0].id;
  let display=appState.machines;
  if(appState.selectedDepartmentFilter) display=display.filter(m=>m.departmentId===appState.selectedDepartmentFilter);
  renderStats(display); renderProductionDashboard();
  pill&& (pill.textContent=`${display.length} máy`);
  const q=search.value.trim().toLowerCase(); let filtered=display; if(q) filtered=filtered.filter(m=>[m.id,m.name,m.area,m.departmentId].join(" ").toLowerCase().includes(q));
  drawAdminDotsOnly(); syncLayoutOverlay(); renderDepartmentFilterChips(); renderDepartmentsList(); renderUsersList(); updateSelectedInputs();
  list.innerHTML=filtered.map(m=>{const canEdit=canChangeMachineStatus(m); return `<div class="item ${appState.selectedMachineId===m.id?"active":""}" data-id="${m.id}"><div class="row"><div><div class="muted">${m.id}</div><div style="font-weight:800;margin-top:4px">${m.name}</div><div class="muted" style="margin-top:4px">${m.departmentName||m.area}</div><div class="small" style="margin-top:6px">Dept: ${m.departmentId||"-"} | x: ${Number(m.x).toFixed(2)}% | y: ${Number(m.y).toFixed(2)}%</div></div><div><div>${badgeHtml(m.status)}</div><div class="toolbar" style="justify-content:flex-end"><a class="btn btn-light" href="machine.html?id=${encodeURIComponent(m.id)}">Mở</a>${canEdit?`<button class="btn btn-blue" onclick="quickEditMachine('${m.id}')">Sửa</button>`:`<span class="small">Chỉ xem</span>`}</div></div></div></div>`;}).join("");
  Array.from(list.querySelectorAll(".item")).forEach(el=>{const id=el.getAttribute("data-id"); el.addEventListener("click",()=>{appState.selectedMachineId=id; updateSelectedInputs(); if(canAccessAdmin()) window.loadManagedMachineToForm(); renderIndexPage();});});
  notice("syncStatus",`Đang đồng bộ realtime. Vai trò hiện tại: ${appState.currentProfile?.role||"-"}.`);
}
window.quickEditMachine=function(id){
  const m=getMachineById(id); if(!m) return;
  if(!canChangeMachineStatus(m)) return alert("Bạn không có quyền đổi trạng thái máy này.");
  location.href=`machine.html?id=${encodeURIComponent(id)}`;
}

function getRequestedDeptFromLocation(){const path=window.location.pathname; let m=path.match(/\/department\/([a-z0-9-]+)/i); if(m) return m[1].toLowerCase(); const params=new URLSearchParams(location.search); return (params.get("id")||appState.currentProfile?.departmentId||"").toLowerCase();}
function renderDepartmentPage(){
  if(!isPage("department.html")&&!window.location.pathname.match(/\/department\/[a-z0-9-]+/i)) return;
  const requested=getRequestedDeptFromLocation(); if(!requested) return notice("departmentStatus","Thiếu mã bộ phận.","err");
  if(!canViewMachine()) return notice("departmentStatus","Bạn không có quyền xem dữ liệu.","err");
  const dept=appState.departments.find(d=>d.id===requested); $("departmentTitle")&&($("departmentTitle").textContent=`Bộ phận: ${dept?.name||requested}`); $("departmentDesc")&&($("departmentDesc").textContent=`QR bộ phận: ${origin()}/department/${requested}`);
  const machines=appState.machines.filter(m=>m.departmentId===requested); renderStats(machines); $("machineCountPill")&&($("machineCountPill").textContent=`${machines.length} máy`); notice("departmentStatus",`Bạn đang xem bộ phận ${dept?.name||requested}.`);
  const search=$("searchInput"),dots=$("dotsLayer"),list=$("machineList"); if(!search||!dots||!list) return; if(!search.dataset.bound){ search.addEventListener("input",renderDepartmentPage); search.dataset.bound="1"; }
  const q=search.value.trim().toLowerCase(); const filtered=!q?machines:machines.filter(m=>[m.id,m.name,m.area].join(" ").toLowerCase().includes(q));
  dots.innerHTML=filtered.map(m=>`<a class="dot ${m.status}" href="machine.html?id=${encodeURIComponent(m.id)}" style="left:${m.x}%;top:${m.y}%" title="${m.id} - ${m.name}"></a>`).join(""); syncLayoutOverlay();
  list.innerHTML=filtered.map(m=>`<div class="item"><div class="row"><div><div class="muted">${m.id}</div><div style="font-weight:800;margin-top:4px">${m.name}</div><div class="muted" style="margin-top:4px">${m.departmentName||m.area}</div></div><div><div>${badgeHtml(m.status)}</div><div class="toolbar" style="justify-content:flex-end"><a class="btn btn-light" href="machine.html?id=${encodeURIComponent(m.id)}">Mở</a></div></div></div></div>`).join("");
}

function getMachineIdFromLocation(){const path=window.location.pathname; let m=path.match(/\/machine\/(M-\d{3,})/i); if(m) return m[1].toUpperCase(); const params=new URLSearchParams(location.search); return params.get("id");}
function renderMachinePage(){
  if(!isPage("machine.html")&&!window.location.pathname.match(/\/machine\/M-\d{3,}/i)) return;
  const id=getMachineIdFromLocation(); if(!id) return;
  onSnapshot(doc(appState.db,"machines",id),snap=>{
    if(!snap.exists()){document.body.innerHTML='<main class="container"><div class="card" style="margin-top:20px"><h1>Không tìm thấy máy</h1></div></main>'; return;}
    const machine={id:snap.id,...snap.data()};
    if(!canViewMachine()) return notice("machineRealtimeStatus","Bạn không có quyền truy cập máy này.","err");
    $("machineId")&&($("machineId").textContent=machine.id); $("machineName")&&($("machineName").textContent=machine.name); $("machineArea")&&($("machineArea").textContent=`${machine.departmentName||machine.area} (${machine.departmentId||"-"})`); $("machineBadge")&&($("machineBadge").innerHTML=badgeHtml(machine.status)); $("machineNote")&&($("machineNote").value=machine.note||""); $("machineQrLink")&&($("machineQrLink").textContent=`${origin()}/machine/${machine.id}`);
    const canEdit=canChangeMachineStatus(machine); const canEditNote=canEditMachine(machine);
    $("statusGrid")&&($("statusGrid").innerHTML=Object.keys(statusMeta).map(key=>{const meta=statusMeta[key]; return `<button ${canEdit?"":"disabled"} class="btn-light ${meta.className}" style="text-align:left;border-radius:24px;padding:16px;border:1px solid #e2e8f0" onclick="changeMachineStatus('${machine.id}','${key}')">${meta.label}<div class="small" style="margin-top:6px">${canEdit?"Chạm để đổi trạng thái":"Chỉ xem"}</div></button>`;}).join(""));
    $("machineNote")&&($("machineNote").disabled=!canEditNote);
    renderMachineProduction(machine); notice("machineRealtimeStatus",canEdit?"Bạn có thể đổi trạng thái máy này.":(canEditNote?"Bạn có thể chỉnh máy này.":"Bạn chỉ có quyền xem máy này."));
  });
  onSnapshot(query(collection(appState.db,"machines",id,"history"),orderBy("changedAt","desc"),limit(20)),snap=>{
    $("historyList")&&($("historyList").innerHTML=snap.docs.map(d=>{const data=d.data(); const time=data.changedAt?.toDate?data.changedAt.toDate().toLocaleString("vi-VN"):"--"; return `<div class="history-card"><div style="font-weight:800">${data.changedByName||data.changedByEmail||"Không rõ"}</div><div class="muted">${data.changedByEmail||""}</div><div style="margin-top:6px">${data.action||""}</div><div class="small" style="margin-top:6px">${time}</div></div>`;}).join(""));
  });
  onSnapshot(query(collection(appState.db,"machines",id,"productionLogs"),orderBy("changedAt","desc"),limit(20)),snap=>{
    if($("productionHistoryList")) $("productionHistoryList").innerHTML=snap.docs.slice(0,20).map(d=>renderProductionLogCard(d.data())).join("");
  });
}

function updateLocalMachine(id, patch){
  appState.machines = (appState.machines||[]).map(m=>m.id===id?{...m,...patch}:m);
  if(typeof saveCache==='function') saveCache("machines",appState.machines);
  renderIndexPage();
  renderDepartmentPage();
}

window.changeMachineStatus=async function(id,nextStatus){const machine=getMachineById(id)||null; if(machine&&!canChangeMachineStatus(machine)) return alert("Bạn không có quyền đổi trạng thái máy này."); await updateDoc(doc(appState.db,"machines",id),{status:nextStatus,updatedAt:serverTimestamp(),updatedByEmail:appState.auth.currentUser?.email||"",updatedByName:appState.currentProfile?.displayName||appState.auth.currentUser?.email||"Không rõ"}); await addHistory(id,`Đổi trạng thái sang ${statusMeta[nextStatus].label}`);}
window.saveMachineNote=async function(){
  const id=getMachineIdFromLocation(); if(!id) return;
  const machine=getMachineById(id)||null;
  if(machine&&!canEditMachine(machine)) return alert("Bạn không có quyền sửa máy này.");
  const note=$("machineNote").value;
  await updateDoc(doc(appState.db,"machines",id),{
    note,
    updatedAt:serverTimestamp(),
    updatedByEmail:appState.auth.currentUser?.email||"",
    updatedByName:appState.currentProfile?.displayName||appState.auth.currentUser?.email||"Không rõ"
  });
  const shortNote=(note||"").trim()||"(trống)";
  await addHistory(id,`Cập nhật ghi chú: ${shortNote}`);
  alert("Đã lưu ghi chú.");
}



function syncLayoutOverlay(){
  const wrap=$("layoutWrap");
  const img=wrap?wrap.querySelector(".layout-img"):null;
  const overlay=$("dotsLayer");
  if(!wrap||!img||!overlay) return;
  const apply=()=>{
    overlay.style.left = img.offsetLeft + "px";
    overlay.style.top = img.offsetTop + "px";
    overlay.style.width = img.clientWidth + "px";
    overlay.style.height = img.clientHeight + "px";
  };
  if(img.complete){ apply(); } else { img.onload = apply; }
  requestAnimationFrame(apply);
  setTimeout(apply, 60);
}

window.toggleLayoutFullscreen=function(){
  const wrap=$("layoutWrap");
  const btn=$("toggleLayoutSizeBtn");
  if(!wrap||!btn) return;
  const isFull=wrap.classList.contains("layout-fullscreen");
  if(isFull){
    wrap.classList.remove("layout-fullscreen");
    document.body.classList.remove("lock-scroll");
    btn.textContent="Phóng to sơ đồ";
  }else{
    wrap.classList.add("layout-fullscreen");
    document.body.classList.add("lock-scroll");
    btn.textContent="Thu nhỏ sơ đồ";
  }
  syncLayoutOverlay();
  setTimeout(syncLayoutOverlay,120);
};
document.addEventListener("keydown",(e)=>{
  if(e.key==="Escape"){
    const wrap=$("layoutWrap"),btn=$("toggleLayoutSizeBtn");
    if(wrap&&wrap.classList.contains("layout-fullscreen")){
      wrap.classList.remove("layout-fullscreen");
      document.body.classList.remove("lock-scroll");
      if(btn) btn.textContent="Phóng to sơ đồ";
    }
  }
});


window.changeMyPassword=async function(){
  const user=appState.auth?.currentUser;
  if(!user||!user.email) return alert("Bạn cần đăng nhập trước.");
  const current=$("currentPasswordInput")?.value||"";
  const next=$("newPasswordInput")?.value||"";
  const confirm=$("confirmPasswordInput")?.value||"";
  if(!current||!next||!confirm) return alert("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
  if(next.length<6) return alert("Mật khẩu mới cần tối thiểu 6 ký tự.");
  if(next!==confirm) return alert("Mật khẩu mới nhập lại chưa khớp.");
  try{
    const cred=EmailAuthProvider.credential(user.email,current);
    await reauthenticateWithCredential(user,cred);
    await updatePassword(user,next);
    if($("currentPasswordInput")) $("currentPasswordInput").value="";
    if($("newPasswordInput")) $("newPasswordInput").value="";
    if($("confirmPasswordInput")) $("confirmPasswordInput").value="";
    alert("Đã đổi mật khẩu thành công.");
  }catch(err){
    console.error(err);
    if(err.code==="auth/wrong-password"||err.code==="auth/invalid-credential") alert("Mật khẩu hiện tại không đúng.");
    else if(err.code==="auth/weak-password") alert("Mật khẩu mới quá yếu.");
    else if(err.code==="auth/requires-recent-login") alert("Phiên đăng nhập đã lâu. Hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu.");
    else alert("Đổi mật khẩu thất bại.");
  }
};



function productionItemsFromMachine(m){
  const arr = Array.isArray(m.productionItems) ? m.productionItems : [];
  if(arr.length) return arr.map(x=>({code:x.code||"",targetQty:num(x.targetQty),actualQty:num(x.actualQty)}));
  const target=num(m.targetQty), actual=num(m.actualQty)||(num(m.okQty)+num(m.ngQty));
  return (target||actual)?[{code:"Mã chính",targetQty:target,actualQty:actual}]:[];
}
function calcProductionFromItems(items){
  const target=items.reduce((s,x)=>s+num(x.targetQty),0);
  const actual=items.reduce((s,x)=>s+num(x.actualQty),0);
  const performance=target>0?Math.round(actual/target*100):0;
  const count=items.filter(x=>x.code||num(x.targetQty)||num(x.actualQty)).length;
  return {target,actual,performance,count};
}
function calcProduction(m){
  const items=productionItemsFromMachine(m);
  const c=calcProductionFromItems(items);
  return {target:c.target,actual:c.actual,ok:c.actual,ng:0,performance:c.performance,okRate:c.performance,count:c.count};
}
function renderProductionItemRows(machine){
  const box=$("productionItemsBox"); if(!box) return;
  const items=productionItemsFromMachine(machine);
  const rows=items.length?items:[{code:"",targetQty:"",actualQty:""}];
  box.innerHTML=rows.map((it,idx)=>`<div class="prod-item-row">
    <div><label class="small">Mã sản phẩm ${idx+1}</label><input class="input prod-code" value="${it.code||""}" placeholder="VD: SP-A"></div>
    <div><label class="small">Mong muốn</label><input class="input prod-target" type="number" value="${it.targetQty||""}" placeholder="1000"></div>
    <div><label class="small">Thực tế</label><input class="input prod-actual" type="number" value="${it.actualQty||""}" placeholder="850"></div>
    <button type="button" class="btn btn-light" onclick="removeProductionItemRow(this)">Xóa</button>
  </div>`).join("");
}
window.addProductionItemRow=function(){
  const box=$("productionItemsBox"); if(!box) return;
  const idx=box.querySelectorAll(".prod-item-row").length+1;
  box.insertAdjacentHTML("beforeend",`<div class="prod-item-row">
    <div><label class="small">Mã sản phẩm ${idx}</label><input class="input prod-code" placeholder="VD: SP-A"></div>
    <div><label class="small">Mong muốn</label><input class="input prod-target" type="number" placeholder="1000"></div>
    <div><label class="small">Thực tế</label><input class="input prod-actual" type="number" placeholder="850"></div>
    <button type="button" class="btn btn-light" onclick="removeProductionItemRow(this)">Xóa</button>
  </div>`);
};
window.removeProductionItemRow=function(btn){btn.closest(".prod-item-row")?.remove();};
function collectProductionItems(){
  return Array.from(document.querySelectorAll(".prod-item-row")).map(row=>({
    code:row.querySelector(".prod-code")?.value.trim()||"",
    targetQty:num(row.querySelector(".prod-target")?.value),
    actualQty:num(row.querySelector(".prod-actual")?.value)
  })).filter(x=>x.code||x.targetQty||x.actualQty);
}
function renderMachineProduction(machine){
  if(!$("machineProductionPanel")) return;
  const p=calcProduction(machine);
  if($("machineProductionBadge")) $("machineProductionBadge").innerHTML=`<span class="badge ${perfClass(p.performance)}">${p.performance}% hoàn thành</span>`;
  if($("machineProductionKpis")) $("machineProductionKpis").innerHTML=`<div class="prod-card"><div class="small">Số mã chạy</div><div style="font-size:26px;font-weight:800">${p.count}</div></div><div class="prod-card"><div class="small">Tổng mong muốn</div><div style="font-size:26px;font-weight:800">${p.target.toLocaleString("vi-VN")}</div></div><div class="prod-card"><div class="small">Tổng thực tế</div><div style="font-size:26px;font-weight:800">${p.actual.toLocaleString("vi-VN")}</div></div><div class="prod-card"><div class="small">Tiến độ</div><div style="font-size:26px;font-weight:800">${p.performance}%</div></div>`;
  if($("machineProgressBar")){$("machineProgressBar").style.width=Math.min(100,p.performance)+"%";$("machineProgressBar").className="progress-bar "+progressColorClass(p.performance);}
  renderProductionItemRows(machine);
}
window.saveProduction=async function(){
  const id=getMachineIdFromLocation(); if(!id) return;
  const machine=getMachineById(id)||null;
  if(machine&&!canEditMachine(machine)) return alert("Bạn không có quyền cập nhật sản lượng máy này.");
  const shift=$("prodShift")?.value||"Hôm nay";
  const items=collectProductionItems();
  if(!items.length) return alert("Vui lòng nhập ít nhất 1 mã sản phẩm.");
  const totals=calcProductionFromItems(items);
  const note=($("prodNote")?.value||"").trim();
  const patch={productionItems:items,targetQty:totals.target,actualQty:totals.actual,okQty:totals.actual,ngQty:0,performance:totals.performance,productionCodeCount:totals.count,productionShift:shift,productionNote:note,productionUpdatedAt:serverTimestamp(),productionUpdatedByEmail:appState.auth.currentUser?.email||"",productionUpdatedByName:appState.currentProfile?.displayName||appState.auth.currentUser?.email||"Không rõ"};
  await updateDoc(doc(appState.db,"machines",id),patch);
  await addDoc(collection(appState.db,"machines",id,"productionLogs"),{shift,items,targetQty:totals.target,actualQty:totals.actual,performance:totals.performance,codeCount:totals.count,note,changedByUid:appState.auth.currentUser?.uid||"",changedByEmail:appState.auth.currentUser?.email||"",changedByName:appState.currentProfile?.displayName||appState.auth.currentUser?.email||"Không rõ",changedAt:serverTimestamp()});
  await addHistory(id,`Cập nhật sản lượng ${shift}: ${totals.count} mã, mong muốn ${totals.target}, thực tế ${totals.actual}, đạt ${totals.performance}%${note?` - ${note}`:""}`);
  if(typeof updateLocalMachine==='function') updateLocalMachine(id,{...patch,productionUpdatedAt:new Date()});
  alert("Đã lưu sản lượng.");
};
function renderProductionLogCard(data){
  const time=data.changedAt?.toDate?data.changedAt.toDate().toLocaleString("vi-VN"):"--";
  const items=Array.isArray(data.items)?data.items:[];
  const target=num(data.targetQty), actual=num(data.actualQty), perf=target>0?Math.round(actual/target*100):0;
  const itemText=items.length?`<div class="small">${items.map(x=>`${x.code||"Mã"}: ${num(x.actualQty).toLocaleString("vi-VN")}/${num(x.targetQty).toLocaleString("vi-VN")}`).join(" | ")}</div>`:"";
  return `<div class="history-card"><div style="font-weight:800">${data.shift||"Hôm nay"} - ${items.length||data.codeCount||0} mã - ${perf}% kế hoạch</div><div>Mong muốn ${target.toLocaleString("vi-VN")} | Thực tế ${actual.toLocaleString("vi-VN")}</div>${itemText}<div class="muted">${data.note||""}</div><div class="small">${data.changedByName||data.changedByEmail||"Không rõ"} - ${time}</div></div>`;
}
window.exportProductionReport=function(){
  const machines=(appState.machines||[]).filter(m=>calcProduction(m).count>0);
  const detailRows=[];
  const deptSummary={};
  machines.forEach(m=>{
    const items=productionItemsFromMachine(m);
    const dept=m.departmentName||m.area||m.departmentId||"Khác";
    if(!deptSummary[dept]) deptSummary[dept]={machines:0,codes:0,target:0,actual:0};
    deptSummary[dept].machines += 1;
    items.forEach(it=>{
      const target=num(it.targetQty);
      const actual=num(it.actualQty);
      const perf=target>0?Math.round(actual/target*100):0;
      deptSummary[dept].codes += 1;
      deptSummary[dept].target += target;
      deptSummary[dept].actual += actual;
      detailRows.push({machineId:m.id||"",machineName:m.name||"",dept,status:(statusMeta[m.status]&&statusMeta[m.status].label)||m.status||"",codeCount:items.length,productCode:it.code||"",target,actual,perf,missing:Math.max(0,target-actual),updater:m.productionUpdatedByName||m.productionUpdatedByEmail||"",note:String(m.productionNote||"").replace(/\n/g," ")});
    });
  });
  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
  function n(v){return Number(v||0).toLocaleString("vi-VN");}
  function perfClass(p){return p>=95?"ok":p>=80?"warn":"bad";}
  const totalTarget=detailRows.reduce((s,r)=>s+r.target,0);
  const totalActual=detailRows.reduce((s,r)=>s+r.actual,0);
  const totalPerf=totalTarget>0?Math.round(totalActual/totalTarget*100):0;
  const today=new Date().toLocaleDateString("vi-VN");
  const summaryRows=Object.entries(deptSummary).map(([dept,d])=>{const p=d.target>0?Math.round(d.actual/d.target*100):0;return `<tr><td>${esc(dept)}</td><td class="num">${d.machines}</td><td class="num">${d.codes}</td><td class="num">${n(d.target)}</td><td class="num">${n(d.actual)}</td><td class="num ${perfClass(p)}">${p}%</td><td class="num">${n(Math.max(0,d.target-d.actual))}</td></tr>`;}).join("");
  const detailHtml=detailRows.map(r=>`<tr><td>${esc(r.machineId)}</td><td>${esc(r.machineName)}</td><td>${esc(r.dept)}</td><td>${esc(r.status)}</td><td class="num">${r.codeCount}</td><td>${esc(r.productCode)}</td><td class="num">${n(r.target)}</td><td class="num">${n(r.actual)}</td><td class="num ${perfClass(r.perf)}">${r.perf}%</td><td class="num">${n(r.missing)}</td><td>${esc(r.updater)}</td><td>${esc(r.note)}</td></tr>`).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;}h1{font-size:22px;margin:0 0 6px;}h2{font-size:16px;margin:18px 0 8px;}.muted{color:#64748b;font-size:12px;margin-bottom:10px;}table{border-collapse:collapse;width:100%;font-size:12px;}th{background:#0f172a;color:#fff;font-weight:bold;text-align:center;border:1px solid #94a3b8;padding:7px;}td{border:1px solid #cbd5e1;padding:6px;vertical-align:top;}.num{text-align:right;}.ok{background:#dcfce7;color:#166534;font-weight:bold;}.warn{background:#fef3c7;color:#92400e;font-weight:bold;}.bad{background:#fee2e2;color:#991b1b;font-weight:bold;}.total td{background:#e0f2fe;font-weight:bold;}</style></head><body><h1>BÁO CÁO SẢN LƯỢNG THEO MÃ</h1><div class="muted">Ngày xuất: ${today}</div><h2>Tổng quan</h2><table><tr><th>Tổng máy có dữ liệu</th><th>Tổng mã sản phẩm</th><th>Tổng sản lượng mong muốn</th><th>Tổng sản lượng thực tế</th><th>Tiến độ tổng</th><th>Còn thiếu</th></tr><tr class="total"><td class="num">${machines.length}</td><td class="num">${detailRows.length}</td><td class="num">${n(totalTarget)}</td><td class="num">${n(totalActual)}</td><td class="num ${perfClass(totalPerf)}">${totalPerf}%</td><td class="num">${n(Math.max(0,totalTarget-totalActual))}</td></tr></table><h2>Tổng hợp theo bộ phận</h2><table><tr><th>Bộ phận</th><th>Số máy</th><th>Số mã</th><th>Sản lượng mong muốn</th><th>Sản lượng thực tế</th><th>Tiến độ</th><th>Còn thiếu</th></tr>${summaryRows||`<tr><td colspan="7">Chưa có dữ liệu sản lượng.</td></tr>`}</table><h2>Chi tiết từng mã sản phẩm</h2><table><tr><th>Mã máy</th><th>Tên máy</th><th>Bộ phận</th><th>Trạng thái</th><th>Số mã của máy</th><th>Mã sản phẩm</th><th>Sản lượng mong muốn</th><th>Sản lượng thực tế</th><th>Tiến độ %</th><th>Còn thiếu</th><th>Người cập nhật</th><th>Ghi chú</th></tr>${detailHtml||`<tr><td colspan="12">Chưa có dữ liệu sản lượng.</td></tr>`}</table></body></html>`;
  const blob=new Blob(["\ufeff"+html],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  const date=new Date().toISOString().slice(0,10);
  a.href=url;
  a.download=`bao-cao-san-luong-nang-cao-${date}.xls`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};

window.showProductionTable=function(){
  const box=$("productionTableBox"); if(!box) return;
  const machines=(appState.machines||[]).filter(m=>calcProduction(m).count>0);
  if(!machines.length){box.innerHTML='<div class="muted">Chưa có máy nào nhập sản lượng.</div>'; return;}
  box.innerHTML=`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Máy</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Bộ phận</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Số mã</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Mong muốn</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Thực tế</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Tiến độ</th></tr></thead><tbody>${machines.map(m=>{const p=calcProduction(m);return `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${m.id}</strong> - ${m.name||""}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${m.departmentName||m.area||m.departmentId||""}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">${p.count}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">${p.target.toLocaleString("vi-VN")}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">${p.actual.toLocaleString("vi-VN")}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">${p.performance}%</td></tr>`}).join("")}</tbody></table></div>`;
};
let smartRealtimeStarted=false;
window.startSmartRealtime=function(){
  if(smartRealtimeStarted||!appState.db) return;
  smartRealtimeStarted=true;
  onSnapshot(collection(appState.db,"machines"),snap=>{
    let changed=false;
    snap.docChanges().forEach(ch=>{
      const d={id:ch.doc.id,...ch.doc.data()};
      const idx=(appState.machines||[]).findIndex(m=>m.id===d.id);
      if(ch.type==="removed"){if(idx>=0){appState.machines.splice(idx,1);changed=true;}}
      else if(idx>=0){appState.machines[idx]={...appState.machines[idx],...d};changed=true;}
      else{appState.machines.push(d);changed=true;}
    });
    if(changed){appState.machines.sort((a,b)=>a.id.localeCompare(b.id));if(typeof saveCache==='function') saveCache("machines",appState.machines);renderIndexPage();renderDepartmentPage();}
  });
};


function emptyProductionPatch(){
  return {
    productionItems: [],
    targetQty: 0,
    actualQty: 0,
    okQty: 0,
    ngQty: 0,
    performance: 0,
    productionCodeCount: 0,
    productionShift: "Hôm nay",
    productionNote: "",
    productionUpdatedAt: serverTimestamp(),
    productionUpdatedByEmail: appState.auth.currentUser?.email || "",
    productionUpdatedByName: appState.currentProfile?.displayName || appState.auth.currentUser?.email || "Không rõ"
  };
}
window.clearMachineProduction=async function(){
  const id=getMachineIdFromLocation();
  if(!id) return;
  const machine=getMachineById(id)||null;
  if(machine && !canEditMachine(machine)) return alert("Bạn không có quyền xóa sản lượng máy này.");
  if(!confirm("Xóa sản lượng hiện tại của máy này để nhập sản lượng hôm nay?")) return;
  const patch=emptyProductionPatch();
  await updateDoc(doc(appState.db,"machines",id),patch);
  await addDoc(collection(appState.db,"machines",id,"productionLogs"),{
    shift:"Hôm nay",
    items:[],
    targetQty:0,
    actualQty:0,
    performance:0,
    codeCount:0,
    note:"Xóa sản lượng để nhập ngày mới",
    changedByUid:appState.auth.currentUser?.uid||"",
    changedByEmail:appState.auth.currentUser?.email||"",
    changedByName:appState.currentProfile?.displayName||appState.auth.currentUser?.email||"Không rõ",
    changedAt:serverTimestamp()
  });
  await addHistory(id,"Xóa sản lượng để nhập ngày mới");
  if(typeof updateLocalMachine==='function') updateLocalMachine(id,{...patch,productionUpdatedAt:new Date()});
  renderMachineProduction?.({...machine,...patch});
  alert("Đã xóa sản lượng máy này.");
};
window.clearAllProduction=async function(){
  if(appState.currentProfile?.role!=="admin") return alert("Chỉ admin được xóa sản lượng tất cả máy.");
  const machines=(appState.machines||[]).filter(m=>calcProduction(m).count>0 || num(m.targetQty)>0 || num(m.actualQty)>0 || Array.isArray(m.productionItems));
  if(!machines.length) return alert("Không có dữ liệu sản lượng để xóa.");
  if(!confirm(`Xóa sản lượng hiện tại của ${machines.length} máy để nhập dữ liệu hôm nay?`)) return;
  const patch=emptyProductionPatch();
  let ok=0, fail=0;
  for(const m of machines){
    try{
      await updateDoc(doc(appState.db,"machines",m.id),patch);
      await addHistory(m.id,"Admin xóa sản lượng để nhập ngày mới");
      if(typeof updateLocalMachine==='function') updateLocalMachine(m.id,{...patch,productionUpdatedAt:new Date()});
      ok++;
    }catch(err){
      console.error("clear production failed",m.id,err);
      fail++;
    }
  }
  renderIndexPage();
  alert(`Đã xóa sản lượng ${ok} máy${fail?`, lỗi ${fail} máy`:""}.`);
};

async function bootAfterLogin(user){
  setAuthButtonsVisible(!!user);

  if(isPage("login.html")){
    if(!user){
      setBootStatus("Chưa đăng nhập. Nhập email và mật khẩu để vào hệ thống.");
      return;
    }

    appState.currentUser=user;
    setBootStatus(`Đã đăng nhập Auth. Đang đọc quyền Firestore UID: ${user.uid}...`);
    try{
      appState.currentProfile=await loadCurrentProfile(user.uid);
    }catch(err){
      console.error(err);
      setBootStatus("Đã đăng nhập Auth nhưng Firestore Rules đang chặn đọc users/{UID}. Hãy cập nhật Rules và Publish.", "err");
      return;
    }

    const role=appState.currentProfile?.role;
    if(appState.currentProfile && VALID_ROLES.includes(role)){
      setBootStatus(`Đã xác nhận quyền ${role}. Đang chuyển vào tổng quan...`);
      location.replace("index.html");
      return;
    }

    setBootStatus(`Tài khoản chưa có quyền hợp lệ. UID: ${user.uid}. Role hiện tại: ${role||"chưa có"}.`, "err");
    setAuthButtonsVisible(true);
    return;
  }

  if(!user){
    setBootStatus("Chưa đăng nhập. Đang chuyển đến trang đăng nhập...");
    location.replace("login.html");
    return;
  }

  appState.currentUser=user;
  setBootStatus(`Đã đăng nhập Auth. Đang đọc quyền Firestore UID: ${user.uid}...`);
  try{
    appState.currentProfile=await loadCurrentProfile(user.uid);
  }catch(err){
    console.error(err);
    setBootStatus("Đã đăng nhập Auth nhưng Firestore Rules đang chặn đọc users/{UID}. Hãy cập nhật Rules và Publish.", "err");
    setAuthButtonsVisible(true);
    return;
  }

  const role=appState.currentProfile?.role;
  if(!appState.currentProfile || !VALID_ROLES.includes(role)){
    setBootStatus(`Tài khoản chưa có quyền hợp lệ. UID: ${user.uid}. Role hiện tại: ${role||"chưa có"}. Vào Firestore > users > document UID này và đặt role: admin/operator/department/viewer.`, "err");
    setAuthButtonsVisible(true);
    return;
  }

  setBootStatus(`Đã xác nhận quyền ${role}. Đang tải dữ liệu...`);
  await loadRootDataOnce(()=>{fillDepartmentSelects(); renderIndexPage(); renderDepartmentPage(); renderMachinePage();});
  if(typeof startSmartRealtime==="function") startSmartRealtime();
  fillDepartmentSelects();
  renderIndexPage();
  renderDepartmentPage();
  renderMachinePage();
  setBootStatus(`Đang đồng bộ realtime thông minh. Vai trò hiện tại: ${role}.`);
}

function bindLoginButtons(){
  const loginButton=document.getElementById("loginSubmitBtn");
  const registerButton=document.getElementById("registerSubmitBtn");
  if(loginButton && !loginButton.dataset.bound){
    loginButton.dataset.bound="1";
    loginButton.addEventListener("click",(e)=>{e.preventDefault(); window.login();});
  }
  if(registerButton && !registerButton.dataset.bound){
    registerButton.dataset.bound="1";
    registerButton.addEventListener("click",(e)=>{e.preventDefault(); window.registerAccount();});
  }
}

(async function boot(){
  try{
    bindLoginButtons();
    setBootStatus("Đang khởi động Firebase...");
    if(isPage("setup.html")){
      setAuthButtonsVisible(false);
      return;
    }
    const ok=await initFirebase();
    if(!ok){
      setBootStatus("Không khởi tạo được Firebase. Kiểm tra file cấu hình.", "err");
      return;
    }
    setBootStatus("Firebase đã sẵn sàng. Đang kiểm tra đăng nhập...");
    onAuthStateChanged(appState.auth,user=>{bootAfterLogin(user)});
  }catch(err){
    console.error(err);
    setBootStatus("Lỗi JavaScript khi khởi động. Mở F12 > Console để xem lỗi đỏ.", "err");
  }
})();

window.addEventListener("resize", ()=>{ syncLayoutOverlay(); setTimeout(syncLayoutOverlay,80); });
