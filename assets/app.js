const state = {
  menu: [],
  promos: null,
  cart: loadCart(),
  lastOrderId: localStorage.getItem("lastOrderId") || ""
};

function setNet(){
  const b=$("netBadge");
  if(!b) return;
  b.textContent = navigator.onLine ? "Online" : "Offline (cola activa)";
}
window.addEventListener("online", ()=>{ setNet(); flushOfflineQueue(); });
window.addEventListener("offline", setNet);

function loadCart(){ try{ return JSON.parse(localStorage.getItem("cart")||"{}"); }catch{ return {}; } }
function saveCart(){ localStorage.setItem("cart", JSON.stringify(state.cart)); }

function offlineQueue(){ try{ return JSON.parse(localStorage.getItem("offlineQueue")||"[]"); }catch{ return []; } }
function saveOfflineQueue(q){ localStorage.setItem("offlineQueue", JSON.stringify(q)); }

function cartItems(){
  const ids=Object.keys(state.cart);
  const map=Object.fromEntries(state.menu.map(x=>[x.id,x]));
  const items=[];
  for(const id of ids){
    const qty=state.cart[id]||0;
    if(qty<=0) continue;
    const p=map[id];
    if(!p) continue;
    items.push({id, name:p.name, qty, price:p.price, line:+(p.price*qty).toFixed(2)});
  }
  return items;
}
function calcTotals(){
  const items=cartItems();
  const subtotal=items.reduce((a,b)=>a+b.line,0);
  return {items, subtotal};
}

function renderCats(){
  const cat=$("cat");
  const cats=Array.from(new Set(state.menu.map(m=>m.category))).sort();
  cat.innerHTML = `<option value="">Todas</option>` + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function renderMenu(){
  const q=$("q").value.trim().toLowerCase();
  const cat=$("cat").value;
  const el=$("menu");
  const filtered = state.menu.filter(p=>{
    if(!p.available) return false;
    if(typeof p.stock === "number" && p.stock <= 0) return false;
    if(cat && p.category!==cat) return false;
    if(q && !(p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))) return false;
    return true;
  });

  el.innerHTML = filtered.map(p=>{
    const inCart = state.cart[p.id] || 0;
    const stock = (typeof p.stock==="number") ? p.stock : null;
    return `
      <div class="item">
        <div class="itemTop">
          <div>
            <div class="itemName">${escapeHtml(p.name)}</div>
            <div class="itemCat">${escapeHtml(p.category)} • <span class="muted">${escapeHtml(p.id)}</span>${stock!==null?` • <span class="badge">Stock: ${stock}</span>`:""}</div>
          </div>
          <div class="itemPrice">${money(p.price)}</div>
        </div>
        <div class="itemActions">
          <button class="btn secondary" onclick="dec('${p.id}')">-</button>
          <input class="input qty" value="${inCart}" inputmode="numeric" onchange="setQty('${p.id}', this.value)">
          <button class="btn" onclick="inc('${p.id}')">+</button>
        </div>
      </div>
    `;
  }).join("");

  if(!filtered.length) el.innerHTML = `<div class="muted">No hay resultados o no hay stock.</div>`;
}

function renderCart(){
  const el=$("cart");
  const {items, subtotal} = calcTotals();

  el.innerHTML = items.map(it=>`
    <div class="cartLine">
      <div>
        <strong>${escapeHtml(it.name)}</strong>
        <div><small>${escapeHtml(it.id)} • ${it.qty} x ${money(it.price)}</small></div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:900">${money(it.line)}</div>
        <button class="btn secondary" style="padding:6px 10px; margin-top:6px" onclick="removeItem('${it.id}')">Quitar</button>
      </div>
    </div>
  `).join("");

  if(!items.length) el.innerHTML = `<div class="muted">Tu carrito está vacío.</div>`;

  $("subInfo").textContent = `Subtotal: ${money(subtotal)}`;
  $("discInfo").textContent = "";
  $("total").textContent = money(subtotal);
}

function inc(id){ state.cart[id]=(state.cart[id]||0)+1; saveCart(); renderCart(); renderMenu(); }
function dec(id){ state.cart[id]=Math.max(0,(state.cart[id]||0)-1); saveCart(); renderCart(); renderMenu(); }
function setQty(id,v){ const n=Math.max(0,parseInt(v||"0",10)||0); state.cart[id]=n; saveCart(); renderCart(); renderMenu(); }
function removeItem(id){ delete state.cart[id]; saveCart(); renderCart(); renderMenu(); }

async function flushOfflineQueue(){
  if(!navigator.onLine) return;
  const q=offlineQueue();
  if(!q.length) return;
  const remaining=[];
  for(const payload of q){
    try{
      const j=await apiPost("/order", payload);
      state.lastOrderId=j.order.id;
      localStorage.setItem("lastOrderId", state.lastOrderId);
      toast(`Pedido enviado: ${state.lastOrderId}`,"ok");
    }catch{ remaining.push(payload); }
  }
  saveOfflineQueue(remaining);
}

let trackTimer=null;
function statusBadge(st){
  const map={
    "PENDING":["pending","RECIBIDO"],"PREPARING":["preparing","EN PREPARACIÓN"],
    "READY":["ready","LISTO"],"DONE":["done","ENTREGADO"],"CANCELED":["canceled","CANCELADO"]
  };
  const [cls,label]=map[st]||["pending",st];
  return `<span class="kStatus ${cls}">${label}</span>`;
}
function renderTracking(o){
  const lines=(o.timeline||[]).slice().reverse().map(t=>{
    const d=new Date(t.at);
    const hh=d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    return `<div class="cartLine" style="border-bottom:1px solid rgba(255,255,255,.09)">
      <div><strong>${escapeHtml(t.action||"STATUS")}</strong><div><small>${escapeHtml(t.by||"")}</small></div></div>
      <div style="text-align:right">${statusBadge(t.status)}<div><small>${hh}</small></div></div>
    </div>`;
  }).join("");

  $("track").innerHTML = `
    <div class="cartLine">
      <div><strong>Pedido ${escapeHtml(o.id)}</strong><div><small>${escapeHtml(o.channel)} ${o.table?("• "+escapeHtml(o.table)):""}</small></div></div>
      <div style="text-align:right">${statusBadge(o.status)}</div>
    </div>
    <div class="cartLine"><div><small>Subtotal</small></div><div><strong>${money(o.subtotal)}</strong></div></div>
    <div class="cartLine">
      <div><small>Descuento</small><div><small class="muted">${(o.promo?.labels||[]).join(" • ")}</small></div></div>
      <div><strong>${money(o.promo?.discount||0)}</strong></div>
    </div>
    <div class="cartLine"><div><small>Total</small></div><div><strong style="color:var(--orange2)">${money(o.total)}</strong></div></div>
    <div style="height:10px"></div>
    <div class="card" style="border-radius:14px; border:1px solid var(--line); background:rgba(255,255,255,.02)">
      <div class="cardHeader" style="border-bottom:1px solid var(--line)"><h2 style="font-size:14px;margin:0">Timeline</h2></div>
      <div class="cardBody">${lines || `<div class="muted">Sin eventos.</div>`}</div>
    </div>
  `;
}

async function startTracking(orderId){
  if(trackTimer) clearInterval(trackTimer);
  async function tick(){
    try{ const j=await apiGet(`/order?id=${encodeURIComponent(orderId)}`); renderTracking(j.order); }
    catch{ $("track").innerHTML = `<div class="muted">No se encontró el pedido.</div>`; }
  }
  await tick();
  trackTimer=setInterval(tick, 2500);
}

function newClientRef(){
  const rnd = Math.random().toString(16).slice(2);
  return `CREF-${Date.now()}-${rnd}`.toUpperCase();
}

async function placeOrder(){
  const {items}=calcTotals();
  if(!items.length){ toast("Carrito vacío","bad"); return; }

  const payload={
    client_ref: newClientRef(),
    name:$("name").value.trim(),
    table:$("table").value.trim(),
    channel:$("channel").value,
    notes:$("notes").value.trim(),
    items: items.map(x=>({id:x.id, qty:x.qty}))
  };

  if(!navigator.onLine){
    const q=offlineQueue(); q.push(payload); saveOfflineQueue(q);
    toast("Sin internet: pedido guardado en cola","ok");
    return;
  }

  $("place").disabled=true;
  try{
    const j=await apiPost("/order", payload);
    const o=j.order;
    state.lastOrderId=o.id;
    localStorage.setItem("lastOrderId", state.lastOrderId);
    $("trackId").textContent = state.lastOrderId;
    await startTracking(state.lastOrderId);

    state.cart={}; saveCart(); renderCart(); renderMenu();

    toast(`Pedido creado: ${o.id}`,"ok");
    $("discInfo").textContent = (o.promo?.discount||0) ? `Descuento: -${money(o.promo.discount)}` : "";
    $("total").textContent = money(o.total);
  }catch(e){ toast(e.message||"Error creando pedido","bad"); }
  finally{ $("place").disabled=false; }
}

async function loadAll(){
  setNet();
  const h=await apiGet("/health");
  $("promoBadge").textContent = `Storage: ${h.storage}`;

  const m=await apiGet("/menu");
  state.menu=m.menu||[];
  renderCats(); renderMenu(); renderCart();

  const p=await apiGet("/promos");
  state.promos=p.promos;
  if(state.promos?.enabled){
    const labels=(state.promos.rules||[]).map(x=>x.label).filter(Boolean).slice(0,2);
    $("promoBadge").textContent = labels.length ? `Promos: ${labels.join(" • ")}` : "Promos activas";
  } else $("promoBadge").textContent = "Promos: OFF";

  if(state.lastOrderId){ $("trackId").textContent = state.lastOrderId; startTracking(state.lastOrderId); }
  flushOfflineQueue();
}

$("q").addEventListener("input", renderMenu);
$("cat").addEventListener("change", renderMenu);
$("refresh").addEventListener("click", loadAll);
$("place").addEventListener("click", placeOrder);
$("clear").addEventListener("click", ()=>{ state.cart={}; saveCart(); renderCart(); renderMenu(); toast("Carrito vacío","ok"); });
$("openTicket").addEventListener("click", ()=>{
  const id = $("trackId").textContent.trim();
  if(!id || id==="—"){ toast("No hay pedido para ticket","bad"); return; }
  location.href = `/ticket.html?order=${encodeURIComponent(id)}`;
});

loadAll();

window.inc=inc; window.dec=dec; window.setQty=setQty; window.removeItem=removeItem;
