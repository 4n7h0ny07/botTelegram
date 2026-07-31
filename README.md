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
- Desde las 20:00 (hora de Bolivia) revisa la cotizacion oficial USD del BCB.
- Si el BCB publica un valor nuevo, lo envia a todos los usuarios registrados.
- La ultima cotizacion observada se guarda en SQLite para no repetir mensajes.
- Compara automaticamente las paginas de anuncios de compra y venta usando solamente
  anunciantes verificados y excluyendo anuncios destacados.
- El boton `Diferencia paginas Compra/Venta` permite consultar el desfase manualmente
  sin consumir el limite de avisos automaticos.
- Una diferencia de 0 a 4 paginas es normal y no genera mensajes automaticos.
- De 5 a 15 paginas envia una notificacion informativa a todos los usuarios.
- Desde 16 paginas envia una notificacion importante a todos los usuarios.
- La alerta indica que lado tiene mas paginas, la diferencia y si es hora de
  comprar o vender.
- La revision de paginas ocurre en intervalos aleatorios de 5 a 10 minutos.
- Los recordatorios respetan una espera de 4 horas y un maximo de 4 envios
  automaticos por dia, usando la fecha de Bolivia.
- Los mensajes automaticos no incluyen URLs.

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
P2P_PAGE_SIZE=10
PAGE_GAP_MIN_INTERVAL_MS=300000
PAGE_GAP_MAX_INTERVAL_MS=600000
PAGE_GAP_DAILY_LIMIT=4
PAGE_GAP_NOTIFICATION_COOLDOWN_MS=14400000
GAP_DEFAULT_LIMIT=15
CHECK_INTERVAL_MS=30000
BCB_EXCHANGE_URL=
BCB_CHECK_INTERVAL_MS=300000
BCB_CHECK_START_HOUR=20
```

`AVG_ROWS` define cuantos anuncios se usan para calcular la media.
`P2P_PAGE_SIZE` define cuantos anuncios representan una pagina para comparar
compra y venta. Para esa comparacion se exige que Binance identifique al anunciante
como comerciante verificado (`merchant`, grado 3 o superior e identidad
comercial) y al anuncio como normal (`profession`); cualquier resultado
destacado (`mass`) queda excluido. `CHECK_INTERVAL_MS` define cada cuantos
milisegundos se revisan las alertas.

`PAGE_GAP_MIN_INTERVAL_MS` y `PAGE_GAP_MAX_INTERVAL_MS` controlan el intervalo
aleatorio de revision. `PAGE_GAP_DAILY_LIMIT` limita los avisos automaticos por
dia y `PAGE_GAP_NOTIFICATION_COOLDOWN_MS` evita recordatorios demasiado
frecuentes. Las consultas manuales no afectan estos limites.

`BCB_CHECK_START_HOUR` usa la hora de Bolivia (`America/La_Paz`). La primera
lectura del BCB se guarda como referencia y no genera un mensaje; los cambios
posteriores se notifican automaticamente.

## Ejecutar

```bash
npm install
npm start
```

Tambien puedes usar:

```bash
npm run devserver
```
