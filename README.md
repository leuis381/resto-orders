# Resto Orders (HTML + Python) — Deploy listo en Vercel

**Solo HTML/CSS/JS** + **Python (Flask)** en `/api`, listo para:
1) descomprimir
2) subir a GitHub
3) desplegar en Vercel

## Credenciales demo
- admin / admin
- kitchen / kitchen
- cashier / cashier

## Persistencia
Funciona sin romper en Vercel, pero si quieres que menú/stock/pedidos/usuarios **no se reinicien**, activa **Vercel KV** (Storage → KV).
Sin KV, Vercel (serverless) puede reiniciar memoria.

## Páginas
- /index.html (cliente)
- /kitchen.html (cocina, requiere login)
- /admin.html (admin/caja, requiere login)
- /ticket.html (ticket + imprimir)
- /login.html (login)
