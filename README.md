# Bot Telegram USDT P2P Binance

Bot de Telegram para consultar precios de compra y venta de USDT en Binance P2P y crear alertas guardadas en SQLite.

## Funciones

- `/start` muestra un menu con botones.
- `Consultar precios` consulta la API REST de Binance P2P.
- `Activar notificacion` permite elegir:
  - Precio compra
  - Precio venta
  - Media compra
  - Media venta
  - Brecha compra/venta
  - Brecha media compra/venta
- Cada alerta guarda:
  - tipo de precio
  - condicion: sube o baja
  - limite numerico
- El bot revisa las alertas periodicamente.
- Cuando una alerta se cumple, envia el mensaje y la desactiva automaticamente.
- `Mis notificaciones` lista las alertas activas y permite desactivarlas una por una.
- `Desactivar todas` desactiva todas las alertas activas del chat.

## Ejemplo de precios

```text
---USDT P2P---
Compra: 10.40
Venta: 10.37
---MEDIA---
Compra: 10.41
Venta: 10.36
Brecha precio: 0.03 pts
Brecha media: 0.05 pts (0.48%)
```

## Configuracion

Crea un archivo `.env` basado en `.example.env`:

```env
TELEGRAM_TOKEN=tu_token_aqui
PORT=3000
DB_FILE=./botdata.sqlite
BINANCE_API_URL=https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
AVG_ROWS=5
GAP_DEFAULT_LIMIT=15
CHECK_INTERVAL_MS=30000
```

`AVG_ROWS` define cuantos anuncios se usan para calcular la media. `CHECK_INTERVAL_MS` define cada cuantos milisegundos se revisan las alertas.

## Ejecutar

```bash
npm install
npm start
```

Tambien puedes usar:

```bash
npm run devserver
```
