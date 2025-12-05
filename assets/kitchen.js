async function requireRole(){
  try{
    const me = await apiGet("/auth/me");
    const role = me.user?.role || "";
    $("meBadge").textContent = `${me.user.username} (${role})`;
    if(role !== "kitchen" && role !== "admin"){
      toast("No autorizado para cocina","bad");
      location.href="/login.html";
      return false;
    }
    return true;
  }catch{
    location.href="/login.html";
    return false;
  }
}

function badge(st){
  const map={
    "PENDING":["pending","RECIBIDO"],"PREPARING":["preparing","EN PREPARACIÓN"],
    "READY":["ready","LISTO"],"DONE":["done","ENTREGADO"],"CANCELED":["canceled","CANCELADO"]
  };
  const [cls,label]=map[st]||["pending",st];
  return `<span class="kStatus ${cls}">${label}</span>`;
}

async function setStatus(id, status, reason="STATUS"){
  try{
    await apiPost("/order/status",{id,status,reason});
    toast(`OK: ${id} → ${status}`, "ok");
    await load();
  }catch(e){ toast(e.message, "bad"); }
}
window.setStatus=setStatus;

function orderCard(o){
  const created = new Date(o.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const items = (o.items||[]).map(it=>`<div><small>${it.qty}x</small> <strong>${escapeHtml(it.name)}</strong> <small class="muted">(${escapeHtml(it.id)})</small></div>`).join("");
  return `
    <div class="card" style="border-radius:18px; margin-bottom:12px">
      <div class="cardHeader">
        <div>
          <h2 style="margin:0;font-size:15px">Pedido ${escapeHtml(o.id)} ${badge(o.status)}</h2>
          <small class="muted">${created} • ${escapeHtml(o.channel)} ${o.table?("• Mesa "+escapeHtml(o.table)):""} ${o.name?("• "+escapeHtml(o.name)):""}</small>
        </div>
        <div class="controls">
          <a class="badge" href="/ticket.html?order=${encodeURIComponent(o.id)}">Ticket</a>
          <span class="badge">${money(o.total)}</span>
        </div>
      </div>
      <div class="cardBody">
        ${items}
        ${o.notes?`<div style="margin-top:10px" class="badge">Nota: ${escapeHtml(o.notes)}</div>`:""}
        <div style="height:12px"></div>
        <div class="controls">
          <button class="btn secondary" onclick="setStatus('${o.id}','PENDING','RESET')">Recibido</button>
          <button class="btn" onclick="setStatus('${o.id}','PREPARING','START')">Preparando</button>
          <button class="btn" onclick="setStatus('${o.id}','READY','READY')">Listo</button>
          <button class="btn secondary" onclick="setStatus('${o.id}','DONE','DONE')">Entregado</button>
          <button class="btn danger" onclick="setStatus('${o.id}','CANCELED','CANCEL')">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

let timer=null;
async function load(){
  setNetBadge();
  const f = $("filter").value;
  const q = f ? `?status=${encodeURIComponent(f)}` : "";
  const j = await apiGet(`/orders${q}`);
  const orders = j.orders || [];
  $("list").innerHTML = orders.length ? orders.map(orderCard).join("") : `<div class="muted">Sin pedidos.</div>`;
}

$("filter").addEventListener("change", load);
$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", async ()=>{
  try{ await apiPost("/auth/logout", {}); }catch{}
  location.href="/login.html";
});

(async ()=>{
  setNetBadge();
  const ok = await requireRole();
  if(!ok) return;
  await load();
  timer=setInterval(load, 2500);
})();
