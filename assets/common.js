const API="/api";
const $=(id)=>document.getElementById(id);
function money(n){ return `S/ ${Number(n||0).toFixed(2)}`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
function toast(msg, kind=""){
  const t=$("toast");
  if(!t) return alert(msg);
  t.textContent=msg;
  t.className=`toast show ${kind}`.trim();
  setTimeout(()=>t.className="toast", 2200);
}
function setNetBadge(id="netBadge"){
  const b=$(id);
  if(!b) return;
  b.textContent = navigator.onLine ? "Online" : "Offline";
}
window.addEventListener("online", ()=>setNetBadge());
window.addEventListener("offline", ()=>setNetBadge());

async function apiGet(path){
  const r=await fetch(`${API}${path}`, {cache:"no-store", credentials:"include"});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||"Error API");
  return j;
}
async function apiPost(path, body){
  const r=await fetch(`${API}${path}`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body||{}),
    credentials:"include"
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||"Error API");
  return j;
}
