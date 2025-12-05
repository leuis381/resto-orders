async function requireRole(){
  try{
    const me = await apiGet("/auth/me");
    const role = me.user?.role || "";
    $("meBadge").textContent = `${me.user.username} (${role})`;
    if(role !== "admin" && role !== "cashier"){
      toast("No autorizado para admin/caja","bad");
      location.href="/login.html";
      return false;
    }
    return true;
  }catch{
    location.href="/login.html";
    return false;
  }
}

function row(p){
  const stock = (typeof p.stock==="number") ? p.stock : 0;
  return `
    <div class="item" style="margin-bottom:10px">
      <div class="itemTop">
        <div>
          <div class="itemName">${escapeHtml(p.name)}</div>
          <div class="itemCat">${escapeHtml(p.category)} • <span class="muted">${escapeHtml(p.id)}</span> • <span class="badge">Stock: ${stock}</span></div>
        </div>
        <div class="itemPrice">S/ <input class="input" style="width:90px" value="${Number(p.price).toFixed(2)}" id="pr_${p.id}"></div>
      </div>
      <div class="controls">
        <input class="input" style="flex:1" value="${escapeHtml(p.name)}" id="nm_${p.id}">
        <input class="input" style="width:140px" value="${escapeHtml(p.category)}" id="ct_${p.id}">
        <input class="input" style="width:110px" value="${stock}" id="st_${p.id}" inputmode="numeric">
        <select class="select" id="av_${p.id}">
          <option value="1" ${p.available?"selected":""}>Disponible</option>
          <option value="0" ${!p.available?"selected":""}>No disponible</option>
        </select>
        <button class="btn" onclick="saveProd('${p.id}')">Guardar</button>
      </div>
    </div>
  `;
}

async function loadMenu(){
  const j=await apiGet("/menu");
  const menu=j.menu||[];
  $("menu").innerHTML = menu.length ? menu.map(row).join("") : `<div class="muted">Sin productos.</div>`;
}

async function saveProd(id){
  try{
    const prod={
      id,
      name: document.getElementById(`nm_${id}`).value.trim(),
      category: document.getElementById(`ct_${id}`).value.trim(),
      price: parseFloat(document.getElementById(`pr_${id}`).value || "0"),
      stock: parseInt(document.getElementById(`st_${id}`).value || "0", 10) || 0,
      available: document.getElementById(`av_${id}`).value === "1"
    };
    await apiPost("/admin/product", prod);
    toast("Producto guardado","ok");
    await loadMenu();
  }catch(e){ toast(e.message,"bad"); }
}
window.saveProd=saveProd;

async function addProd(){
  const prod={
    id: $("newId").value.trim().toUpperCase(),
    name: $("newName").value.trim(),
    category: $("newCat").value.trim()||"General",
    price: parseFloat($("newPrice").value || "0"),
    stock: parseInt($("newStock").value || "0", 10) || 0,
    available: true
  };
  if(!prod.id || !prod.name){ toast("ID y Nombre requeridos","bad"); return; }
  try{
    await apiPost("/admin/product", prod);
    toast("Producto agregado","ok");
    $("newId").value=""; $("newName").value=""; $("newCat").value=""; $("newPrice").value=""; $("newStock").value="";
    await loadMenu();
  }catch(e){ toast(e.message,"bad"); }
}

async function loadPromos(){ const j=await apiGet("/promos"); $("promos").value = JSON.stringify(j.promos, null, 2); }
async function savePromos(){
  try{
    const obj = JSON.parse($("promos").value);
    await apiPost("/admin/promos", obj);
    toast("Promos guardadas","ok");
  }catch{ toast("JSON inválido o no autorizado","bad"); }
}

async function usersList(){
  try{
    const j=await apiGet("/admin/users");
    const u=j.users||[];
    $("users").innerHTML = u.length
      ? `<table class="tbl"><tr><th>Usuario</th><th>Rol</th><th>Activo</th></tr>` +
        u.map(x=>`<tr><td>${escapeHtml(x.username)}</td><td>${escapeHtml(x.role)}</td><td>${x.active?"Sí":"No"}</td></tr>`).join("") +
        `</table>`
      : `<div class="muted">Sin usuarios</div>`;
  }catch(e){ $("users").textContent = e.message || "Error"; }
}

async function saveUser(){
  const username=$("uUser").value.trim();
  const password=$("uPass").value;
  const role=$("uRole").value;
  if(!username || !password){ toast("Usuario y contraseña requeridos","bad"); return; }
  try{
    await apiPost("/admin/user", {username, password, role});
    toast("Usuario guardado","ok");
    $("uPass").value="";
    await usersList();
  }catch(e){ toast(e.message,"bad"); }
}

function defaultDate(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function loadReport(){
  const dt = $("repDate").value.trim() || defaultDate();
  $("repDate").value = dt;
  try{
    const tz = -new Date().getTimezoneOffset();
    const j=await apiGet(`/admin/report?date=${encodeURIComponent(dt)}&tz=${encodeURIComponent(tz)}`);
    const r=j.report;
    const top = (r.top_products||[]).map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.qty}</td><td>${money(x.sales)}</td></tr>`).join("");
    $("report").innerHTML = `
      <div class="controls">
        <span class="badge">Fecha: ${escapeHtml(dt)}</span>
        <span class="badge">Pedidos: ${r.orders}</span>
        <span class="badge">Ingresos: ${money(r.revenue)}</span>
      </div>
      <div style="height:10px"></div>
      <table class="tbl">
        <tr><th>Top producto</th><th>Cant.</th><th>Ventas</th></tr>
        ${top || `<tr><td colspan="3" class="muted">Sin datos</td></tr>`}
      </table>
    `;
    $("storageBadge").textContent = `Storage: ${j.storage}`;
  }catch(e){
    $("report").innerHTML = `<div class="muted">${escapeHtml(e.message)}</div>`;
  }
}

$("refresh").addEventListener("click", loadMenu);
$("addProd").addEventListener("click", addProd);
$("loadPromos").addEventListener("click", loadPromos);
$("savePromos").addEventListener("click", savePromos);
$("uSave").addEventListener("click", saveUser);
$("repLoad").addEventListener("click", loadReport);
$("repPrint").addEventListener("click", ()=>window.print());
$("logout").addEventListener("click", async ()=>{
  try{ await apiPost("/auth/logout", {}); }catch{}
  location.href="/login.html";
});

(async ()=>{
  setNetBadge();
  const ok = await requireRole();
  if(!ok) return;
  try{ const h=await apiGet("/health"); $("storageBadge").textContent = `Storage: ${h.storage}`; }catch{}
  $("repDate").value = defaultDate();
  await loadMenu();
  await loadPromos();
  await usersList();
  await loadReport();
})();
