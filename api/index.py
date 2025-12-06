import os, json, time, base64, hashlib, hmac
import os, sys
sys.path.append(os.path.dirname(__file__))

from flask import Flask, request, Response
try:
  from api.store import (
    seed_defaults_if_needed, storage_mode,
    get_menu, get_promos, set_promos,
    list_orders, create_order, get_order, update_status,
    upsert_product, upsert_user, public_users_view,
    find_user, daily_report
  )
except Exception:
  from store import (
    seed_defaults_if_needed, storage_mode,
    get_menu, get_promos, set_promos,
    list_orders, create_order, get_order, update_status,
    upsert_product, upsert_user, public_users_view,
    find_user, daily_report
  )

app = Flask(__name__)
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me").encode("utf-8")
SESSION_COOKIE = "RO_SESSION"

def _json(data, status=200):
  return Response(
    json.dumps(data, ensure_ascii=False),
    status=status,
    mimetype="application/json",
    headers={
      "Access-Control-Allow-Origin": request.headers.get("Origin","*") if request.headers.get("Origin") else "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
  )

def _options(): return _json({"ok": True}, 200)

def _pbkdf2_hash(password: str, salt: bytes=None, iters: int=120_000):
  if salt is None: salt = os.urandom(16)
  dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters, dklen=32)
  return f"pbkdf2_sha256${iters}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"

def _pbkdf2_verify(password: str, hashed: str) -> bool:
  try:
    algo, iters_s, salt_b64, dk_b64 = hashed.split("$", 3)
    if algo != "pbkdf2_sha256": return False
    iters = int(iters_s)
    salt = base64.b64decode(salt_b64.encode())
    expected = base64.b64decode(dk_b64.encode())
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters, dklen=len(expected))
    return hmac.compare_digest(dk, expected)
  except Exception:
    return False

def _sign(payload: bytes) -> str:
  sig = hmac.new(SECRET_KEY, payload, hashlib.sha256).digest()
  return base64.urlsafe_b64encode(sig).decode().rstrip("=")

def _b64(data: bytes) -> str:
  return base64.urlsafe_b64encode(data).decode().rstrip("=")

def _b64d(s: str) -> bytes:
  pad = "=" * (-len(s) % 4)
  return base64.urlsafe_b64decode((s + pad).encode())

def _make_session(username: str, role: str, ttl_seconds: int=8*60*60) -> str:
  exp = int(time.time()) + ttl_seconds
  payload = json.dumps({"u": username, "r": role, "exp": exp}, separators=(",",":")).encode("utf-8")
  return _b64(payload) + "." + _sign(payload)

def _read_session():
  token = request.cookies.get(SESSION_COOKIE, "")
  if not token or "." not in token: return None
  try:
    payload_b64, sig = token.split(".", 1)
    payload = _b64d(payload_b64)
    if not hmac.compare_digest(_sign(payload), sig): return None
    data = json.loads(payload.decode("utf-8"))
    if int(data.get("exp", 0)) < int(time.time()): return None
    return {"username": data.get("u"), "role": data.get("r")}
  except Exception:
    return None

def _require_roles(*roles):
  ses = _read_session()
  if not ses or ses.get("role") not in roles: return None
  return ses

@app.before_request
def _seed():
  seed_defaults_if_needed(_pbkdf2_hash)

@app.route("/api/health", methods=["GET"])
def health():
  return _json({"ok": True, "storage": storage_mode()})

@app.route("/api/auth/login", methods=["POST","OPTIONS"])
def login():
  if request.method == "OPTIONS": return _options()
  data = request.get_json(force=True, silent=True) or {}
  username = str(data.get("username","")).strip()
  password = str(data.get("password",""))
  if not username or not password:
    return _json({"error":"Usuario y contraseña requeridos"}, 400)
  u = find_user(username)
  if not u or not u.get("active", True):
    return _json({"error":"Credenciales inválidas"}, 401)
  if not _pbkdf2_verify(password, u.get("pwd","")):
    return _json({"error":"Credenciales inválidas"}, 401)

  token = _make_session(username, u.get("role","cashier"))
  resp = _json({"ok": True, "user": {"username": username, "role": u.get("role","cashier")}})
  resp.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="Lax", secure=False, max_age=8*60*60, path="/")
  return resp

@app.route("/api/auth/logout", methods=["POST","OPTIONS"])
def logout():
  if request.method == "OPTIONS": return _options()
  resp = _json({"ok": True})
  resp.set_cookie(SESSION_COOKIE, "", expires=0, path="/")
  return resp

@app.route("/api/auth/me", methods=["GET"])
def me():
  ses = _read_session()
  if not ses: return _json({"error":"No autenticado"}, 401)
  return _json({"ok": True, "user": ses})

@app.route("/api/menu", methods=["GET"])
def menu():
  return _json({"menu": get_menu()})

@app.route("/api/promos", methods=["GET"])
def promos():
  return _json({"promos": get_promos()})

@app.route("/api/orders", methods=["GET"])
def orders():
  ses = _require_roles("kitchen","admin","cashier")
  if not ses: return _json({"error":"No autorizado"}, 401)
  status = request.args.get("status","").strip().upper()
  all_orders = list_orders()
  if status: all_orders = [o for o in all_orders if o.get("status") == status]
  all_orders.sort(key=lambda x: x.get("created_at",0), reverse=True)
  return _json({"orders": all_orders[:200]})

@app.route("/api/order", methods=["GET"])
def order_get():
  oid = request.args.get("id","").strip().upper()
  if not oid: return _json({"error":"id requerido"}, 400)
  o = get_order(oid)
  if not o: return _json({"error":"no encontrado"}, 404)
  return _json({"order": o})

@app.route("/api/order", methods=["POST","OPTIONS"])
def order_create():
  if request.method == "OPTIONS": return _options()
  payload = request.get_json(force=True, silent=True) or {}
  order, err = create_order(payload)
  if err: return _json({"error": err}, 400)
  return _json({"order": order}, 201)

@app.route("/api/order/status", methods=["POST","OPTIONS"])
def order_status():
  if request.method == "OPTIONS": return _options()
  ses = _require_roles("kitchen","admin")
  if not ses: return _json({"error":"No autorizado"}, 401)
  data = request.get_json(force=True, silent=True) or {}
  oid = str(data.get("id","")).strip().upper()
  st = str(data.get("status","")).strip().upper()
  reason = str(data.get("reason","STATUS")).strip() or "STATUS"
  if not oid or not st: return _json({"error":"id y status requeridos"}, 400)
  updated, err = update_status(oid, st, by=ses["username"], reason=reason)
  if err: return _json({"error": err}, 400)
  return _json({"order": updated})

@app.route("/api/admin/product", methods=["POST","OPTIONS"])
def admin_product():
  if request.method == "OPTIONS": return _options()
  ses = _require_roles("admin","cashier")
  if not ses: return _json({"error":"No autorizado"}, 401)
  prod = request.get_json(force=True, silent=True) or {}
  menu, err = upsert_product(prod)
  if err: return _json({"error": err}, 400)
  return _json({"ok": True, "menu": menu})

@app.route("/api/admin/promos", methods=["POST","OPTIONS"])
def admin_promos():
  if request.method == "OPTIONS": return _options()
  ses = _require_roles("admin","cashier")
  if not ses: return _json({"error":"No autorizado"}, 401)
  promos = request.get_json(force=True, silent=True) or {}
  set_promos(promos)
  return _json({"ok": True, "promos": promos})

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
  ses = _require_roles("admin")
  if not ses: return _json({"error":"No autorizado"}, 401)
  return _json({"users": public_users_view()})

@app.route("/api/admin/user", methods=["POST","OPTIONS"])
def admin_user():
  if request.method == "OPTIONS": return _options()
  ses = _require_roles("admin")
  if not ses: return _json({"error":"No autorizado"}, 401)
  data = request.get_json(force=True, silent=True) or {}
  users, err = upsert_user(data, _pbkdf2_hash)
  if err: return _json({"error": err}, 400)
  return _json({"ok": True, "users": public_users_view()})

@app.route("/api/admin/report", methods=["GET"])
def admin_report():
  ses = _require_roles("admin","cashier")
  if not ses: return _json({"error":"No autorizado"}, 401)
  date = request.args.get("date","").strip()
  tz = request.args.get("tz","0").strip()
  try: tz_minutes = int(tz)
  except Exception: tz_minutes = 0
  rep = daily_report(date, tz_minutes=tz_minutes)
  return _json({"storage": storage_mode(), "report": rep})
