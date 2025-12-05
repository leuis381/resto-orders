import os, json, time, uuid
from urllib.request import Request, urlopen
from urllib.parse import quote

KV_URL = os.getenv("KV_REST_API_URL", "").strip()
KV_TOKEN = os.getenv("KV_REST_API_TOKEN", "").strip()

_mem = {"menu": None, "promos": None, "orders": [], "users": None}

def _now_ms(): return int(time.time() * 1000)
def _kv_available(): return bool(KV_URL and KV_TOKEN)

def _kv_cmd(*parts, timeout=6):
    url = KV_URL.rstrip("/") + "/" + "/".join(quote(str(p), safe="") for p in parts)
    req = Request(url, headers={"Authorization": f"Bearer {KV_TOKEN}"}, method="GET")
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)

def _kv_get(key):
    try:
        data = _kv_cmd("get", key)
        return data.get("result", None)
    except Exception:
        return None

def _kv_set(key, value_str):
    try:
        _kv_cmd("set", key, value_str)
        return True
    except Exception:
        return False

def storage_mode(): return "vercel_kv" if _kv_available() else "memory_ephemeral"

def get_menu():
    if _kv_available():
        raw = _kv_get("menu")
        if raw:
            try: return json.loads(raw)
            except Exception: return []
        return []
    return _mem["menu"] or []

def set_menu(menu):
    if _kv_available(): _kv_set("menu", json.dumps(menu, ensure_ascii=False))
    else: _mem["menu"] = menu

def get_promos():
    if _kv_available():
        raw = _kv_get("promos")
        if raw is None: return None
        try: return json.loads(raw)
        except Exception: return None
    return _mem["promos"]

def set_promos(promos):
    if _kv_available(): _kv_set("promos", json.dumps(promos, ensure_ascii=False))
    else: _mem["promos"] = promos

def list_orders():
    if _kv_available():
        raw = _kv_get("orders")
        if not raw: return []
        try: return json.loads(raw)
        except Exception: return []
    return list(_mem["orders"])

def _save_orders(orders):
    orders = orders[-500:]
    if _kv_available(): _kv_set("orders", json.dumps(orders, ensure_ascii=False))
    else: _mem["orders"] = orders

def get_users():
    if _kv_available():
        raw = _kv_get("users")
        if raw:
            try: return json.loads(raw)
            except Exception: return []
        return []
    return _mem["users"] or []

def set_users(users):
    if _kv_available(): _kv_set("users", json.dumps(users, ensure_ascii=False))
    else: _mem["users"] = users

def seed_defaults_if_needed(pw_hash_fn):
    if not get_menu():
        menu = [
            {"id":"W01","name":"Alitas BBQ (6u)","price":18.0,"category":"Alitas","available":True,"stock":50},
            {"id":"W02","name":"Alitas Picantes (6u)","price":18.0,"category":"Alitas","available":True,"stock":50},
            {"id":"B01","name":"Hamburguesa Clásica","price":16.0,"category":"Burgers","available":True,"stock":30},
            {"id":"P01","name":"Papas Fritas","price":8.0,"category":"Sides","available":True,"stock":80},
            {"id":"D01","name":"Inka Kola","price":5.0,"category":"Bebidas","available":True,"stock":120}
        ]
        set_menu(menu)

    if get_promos() is None:
        promos = {"enabled": True, "rules": [
            {"type":"percent_over_total","min_total":50.0,"percent":10,"label":"10% en compras >= S/50"},
            {"type":"combo","needs":["W01","P01"],"discount":3.0,"label":"S/3 off: Alitas BBQ + Papas"}
        ]}
        set_promos(promos)

    if not get_users():
        users = [
            {"username":"admin","role":"admin","active":True, "pwd": pw_hash_fn("admin")},
            {"username":"kitchen","role":"kitchen","active":True, "pwd": pw_hash_fn("kitchen")},
            {"username":"cashier","role":"cashier","active":True, "pwd": pw_hash_fn("cashier")},
        ]
        set_users(users)

def _calc_promos(order, promos):
    if not promos or not promos.get("enabled"):
        return {"discount":0.0,"labels":[]}
    discount=0.0; labels=[]; total=order["subtotal"]
    for rule in promos.get("rules", []):
        if rule.get("type")=="percent_over_total":
            if total >= float(rule.get("min_total",0)):
                pct=float(rule.get("percent",0))
                d=round(total*(pct/100.0),2)
                if d>0: discount+=d; labels.append(rule.get("label", f"{pct}% descuento"))
        elif rule.get("type")=="combo":
            needs=set(rule.get("needs",[]))
            ids=set([it["id"] for it in order["items"]])
            if needs.issubset(ids):
                d=float(rule.get("discount",0))
                if d>0: discount+=d; labels.append(rule.get("label","Descuento combo"))
    return {"discount":round(discount,2),"labels":labels}

def _find_by_client_ref(orders, client_ref):
    if not client_ref: return None
    for o in reversed(orders):
        if o.get("client_ref")==client_ref:
            return o
    return None

def create_order(payload):
    menu_list=get_menu()
    menu={p["id"]:p for p in menu_list}
    promos=get_promos()

    items=payload.get("items",[])
    if not items: return None,"Pedido vacío."

    client_ref=str(payload.get("client_ref","")).strip().upper()
    orders=list_orders()
    existing=_find_by_client_ref(orders, client_ref)
    if existing: return existing, None

    norm_items=[]; subtotal=0.0; stock_deltas={}
    for it in items:
        pid=str(it.get("id","")).strip().upper()
        qty=int(it.get("qty",0))
        if pid not in menu: return None,f"Producto {pid} no existe."
        if not menu[pid].get("available",True): return None,f"Producto no disponible: {menu[pid]['name']}"
        if qty<=0: continue
        stock=menu[pid].get("stock",None)
        if isinstance(stock,(int,float)):
            stock=int(stock)
            if stock<qty: return None,f"Stock insuficiente para {menu[pid]['name']} (stock {stock})."
            stock_deltas[pid]=stock_deltas.get(pid,0)+qty
        price=float(menu[pid]["price"])
        line=round(price*qty,2)
        subtotal+=line
        norm_items.append({"id":pid,"name":menu[pid]["name"],"qty":qty,"price":price,"line":line})
    if not norm_items: return None,"Pedido sin cantidades válidas."

    if stock_deltas:
        menu_list2=get_menu()
        byid={p["id"]:p for p in menu_list2}
        for pid,dq in stock_deltas.items():
            if pid in byid and isinstance(byid[pid].get("stock",None),(int,float)):
                byid[pid]["stock"]=max(0,int(byid[pid]["stock"])-int(dq))
        set_menu(list(byid.values()))

    order={
        "id": uuid.uuid4().hex[:10].upper(),
        "client_ref": client_ref or "",
        "created_at": _now_ms(),
        "status":"PENDING",
        "channel": payload.get("channel","LOCAL"),
        "table": str(payload.get("table","")).strip(),
        "name": str(payload.get("name","")).strip(),
        "notes": str(payload.get("notes","")).strip(),
        "items": norm_items,
        "subtotal": round(subtotal,2),
        "promo": {"discount":0.0,"labels":[]},
        "total": 0.0,
        "timeline":[]
    }
    order["timeline"].append({"at": _now_ms(), "by":"system", "action":"CREATED", "status":order["status"]})
    promo_calc=_calc_promos(order, promos)
    order["promo"]=promo_calc
    order["total"]=round(max(0.0, order["subtotal"]-promo_calc["discount"]),2)

    orders.append(order)
    _save_orders(orders)
    return order,None

def get_order(order_id):
    oid=str(order_id).strip().upper()
    for o in reversed(list_orders()):
        if o.get("id")==oid: return o
    return None

def update_status(order_id, new_status, by="kitchen", reason="STATUS"):
    allowed={"PENDING","PREPARING","READY","DONE","CANCELED"}
    st=str(new_status).strip().upper()
    if st not in allowed: return None,"Estado inválido."
    orders=list_orders()
    for i in range(len(orders)-1,-1,-1):
        if orders[i]["id"]==str(order_id).strip().upper():
            orders[i]["status"]=st
            orders[i]["timeline"].append({"at": _now_ms(), "by":by, "action":reason or "STATUS", "status":st})
            _save_orders(orders)
            return orders[i],None
    return None,"Pedido no encontrado."

def upsert_product(prod):
    menu=get_menu()
    pid=str(prod.get("id","")).strip().upper()
    if not pid: return None,"ID requerido."
    name=str(prod.get("name","")).strip()
    if not name: return None,"Nombre requerido."
    price=float(prod.get("price",0))
    cat=str(prod.get("category","General")).strip() or "General"
    available=bool(prod.get("available",True))
    stock=int(prod.get("stock",0) or 0)
    found=False
    for p in menu:
        if p["id"]==pid:
            p.update({"name":name,"price":price,"category":cat,"available":available,"stock":stock})
            found=True; break
    if not found:
        menu.append({"id":pid,"name":name,"price":price,"category":cat,"available":available,"stock":stock})
    set_menu(menu)
    return menu,None

def upsert_user(user, pw_hash_fn):
    users=get_users()
    username=str(user.get("username","")).strip()
    if not username: return None,"Usuario requerido."
    role=str(user.get("role","cashier")).strip()
    if role not in {"admin","kitchen","cashier"}: return None,"Rol inválido."
    password=str(user.get("password",""))
    if not password: return None,"Contraseña requerida."
    hashed=pw_hash_fn(password)
    found=False
    for u in users:
        if u["username"]==username:
            u.update({"role":role,"active":True,"pwd":hashed})
            found=True; break
    if not found:
        users.append({"username":username,"role":role,"active":True,"pwd":hashed})
    set_users(users)
    return users,None

def public_users_view():
    return [{"username":u["username"],"role":u.get("role","cashier"),"active":bool(u.get("active",True))} for u in get_users()]

def find_user(username):
    for u in get_users():
        if u.get("username")==username: return u
    return None

def daily_report(date_str, tz_minutes=0):
    import datetime
    try:
        y,m,d=[int(x) for x in date_str.split("-")]
        tz_ms=int(tz_minutes)*60*1000
        start_utc = datetime.datetime(y,m,d,0,0,0, tzinfo=datetime.timezone(datetime.timedelta(minutes=tz_minutes))).astimezone(datetime.timezone.utc)
        end_utc = start_utc + datetime.timedelta(days=1)
        utc_start_ms = int(start_utc.timestamp()*1000)
        utc_end_ms = int(end_utc.timestamp()*1000)
    except Exception:
        return {"orders":0,"revenue":0.0,"top_products":[]}

    orders=list_orders()
    day_orders=[o for o in orders if utc_start_ms <= int(o.get("created_at",0)) < utc_end_ms and o.get("status")!="CANCELED"]
    revenue=round(sum(float(o.get("total",0)) for o in day_orders),2)

    agg={}
    for o in day_orders:
        for it in o.get("items",[]):
            pid=it.get("id"); name=it.get("name",pid)
            qty=int(it.get("qty",0)); sales=float(it.get("line",0))
            if pid not in agg: agg[pid]={"id":pid,"name":name,"qty":0,"sales":0.0}
            agg[pid]["qty"] += qty
            agg[pid]["sales"] += sales
    top=sorted(agg.values(), key=lambda x:(x["sales"],x["qty"]), reverse=True)[:10]
    for t in top: t["sales"]=round(float(t["sales"]),2)
    return {"orders":len(day_orders),"revenue":revenue,"top_products":top}
