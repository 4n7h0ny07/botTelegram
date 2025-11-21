#  🤖 bot telegram usd price and coste

### Bot para recibir notificaciones en segun las preferencioa el usuario del bot

#### ¿Que hace el bot?
- para iniciar el bot necesitas typear ***/start***
- el bot te desplega un menu con botones 

  <a href="#" style="display:inline-block; width:250px; padding:6px 0; margin-bottom:1px;    background:#041D42; color:white; border-radius:8px; text-decoration:none;font-size:14px; font-family:Arial, sans-serif; text-align:center;">Consultar precios
  </a>

  <a href="#" style=" display:inline-block; width:250px; padding:6px 0; margin-bottom:1px; background:#041D42; color:white; border-radius:8px; text-decoration:none; font-size:14px; font-family:Arial, sans-serif; text-align:center;"> Activar notificación
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#041D42;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Mis notificaciones
  </a>

  <a href="#" style=" display:inline-block; width:250px; padding:6px 0; margin-bottom:1px; background:#041D42; color:white; border-radius:8px; text-decoration:none; font-size:14px; font-family:Arial, sans-serif; text-align:center;"> Desactivar todas
  </a>


- si damos un clic en el boton **Consultar precios** del bot nos dara como resultado lo siguiente

``` js
    ---USDT P2P---
    Compra: 10.40
    Venta: 10.37
    ---MEDIA---
    Compra: 10.41
    Venta: 10.36
    Brecha Precio: 0.03 pts
    Brecha Media: 0.05 pts (-0.45%)
```
- si damos un clir en el primer boton **Activar Notificacion** del bot nos dara el siguiente menu de botones 

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Precio Compra
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Precio Venta
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Media Compra
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Media Venta
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Brecha Compra/Venta
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:0.01px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Brecha Media Compra/Venta
  </a>

  - como resulado si damos clic en los botones **Precio Compra, precio venta, media compra, media venta** nos pedira un valor relacionado 

  ``` js
        Ingrese límite para price_buy:
        //ingrese el limite para precio de compra segun su preferencia
        10.45
        //respuesta del bot
        Notificación price_buy activada con límite 10.45
  ```
  - ahora si pulsamos los botones de **Brecha Compra/Venta** o **brecha Media Compra/Venta** solo nos enviara un mensaje:

  
  ``` js
        //respuesta del bot
        Notificaion Activada:

  ```
- si damos un clic en el boton **Mis Notificaciones** del bot nos dara el siguiente mensaje y menu de botones

``` js

Tus notificaciones activas:

1. gap_avg //Notificaicon de la brecha media compra/venta
2. price_sell (límite: 10.35) //precio de compra
3. price_buy (límite: 10.45) //precio de venta
// y debajo de esto el siguiente menu
```
  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Desactivar gap_avg
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Desactivar price_sell
  </a>

  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:1px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Desactivar price_buy
  </a>
  
  <a href="#" style="display:inline-block;width:250px;padding:6px 0;margin-bottom:0.01px;background:#0C2D59;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-family:Arial, sans-serif;text-align:center;">Vaolver al Menu
  </a>

- si clicamos en el boton **Desactivar todas** se desactivaran todas las notificaciones activadas previamente

#### NOTA
* la brecha esta calulada en 15 puntos de diferencia entre precion de compra __(BUY)__ y precio de Venta __(SELL)__ para tomar en cuenta la misma diferencia es para la brecha de la media de ambos.
* la media esta calculado de los primeros 5 anuncios tanto en compra __(BUY)__ como de Venta __(SELL)__

- la ***api-rest*** utilizada en este bot es la de binance
``` js
TOKEN_BOT="tu_token_aqui"
PORT=3000
BINANCE_API_URL="https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
```
y la funcion principal para obtener los precio, y la media es 
``` js
async function fetchUsdtPriceSafe() {
    try {
        const url = process.env.BINANCE_API_URL;
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; DolarBlueBot/1.0)"
        };

        const basePayload = {
            asset: "USDT",
            fiat: "BOB",
            page: 1,
            rows: 10,
            payTypes: [],
            publisherType: "merchant",
            transAmount: "0"
        };

        const [buyResp, sellResp] = await Promise.all([
            axios.post(url, { ...basePayload, tradeType: "BUY" }, { headers }),
            axios.post(url, { ...basePayload, tradeType: "SELL" }, { headers })
        ]);

        const buyData = buyResp.data.data || [];
        const sellData = sellResp.data.data || [];

        if (!buyData.length || !sellData.length) return { error: "No hay datos de Binance" };

        const currentBuy = parseFloat(buyData[0].adv.price);
        const currentSell = parseFloat(sellData[0].adv.price);
        const avgBuy = buyData.slice(0, 10).reduce((s, i) => s + parseFloat(i.adv.price), 0) / 10;
        const avgSell = sellData.slice(0, 10).reduce((s, i) => s + parseFloat(i.adv.price), 0) / 10;

        const gapPrice = currentBuy - currentSell;
        const gapAvg = avgBuy - avgSell;
        const gapAvgPercent = ((avgSell - avgBuy) / avgBuy) * 100;

        lastPriceData = { currentBuy, currentSell, avgBuy, avgSell, gapPrice, gapAvg, gapAvgPercent };

        return { currentBuy, currentSell, avgBuy, avgSell, gapPrice, gapAvg, gapAvgPercent };
    } catch (err) {
        console.error("Error fetchUsdtPriceSafe:", err.message);
        return { error: err.message };
    }
}
```