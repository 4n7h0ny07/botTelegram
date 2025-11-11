require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const {
  db,
  guardarMedia,
  obtenerUltimaMedia,
  guardarBrecha,
  obtenerUltimaBrecha,
  setNotification,
  clearNotifications,
  obtenerUsuariosCon,
  obtenerNotificacionesActivas
} = require('./db');

// Verificación de variables
if (!process.env.TOKEN_BOT) {
  console.error('No se encontró TOKEN_BOT en el archivo .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.TOKEN_BOT);

// Manejo global de errores
bot.catch((err, ctx) => {
  console.error(`Error para update ${ctx?.update?.update_id}:`, err.message);
});

// === MENÚ PRINCIPAL ===
// === START o SALUDO ===
bot.hears(/^(hola|hi|hello|hey|buenas|inicio|start|comenzar|empezar|usdt)$/i, (ctx) => {
  const nombre = ctx.from.first_name || "usuario";
  const msg = `¡Hola ${nombre}! Bienvenido a tu asistente USDT.\n\nPuedo ayudarte a consultar precios, calcular brechas o crear notificaciones automáticas.`;

  bot.telegram.sendMessage(ctx.chat.id, msg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Actividad USDT hoy", callback_data: 'usdts' }],
        [{ text: "Crear Notificaciones", callback_data: 'notifications' }],
        [{ text: "Visita nuestra web", url: "https://fassid.com" }],
        [{ text: "Créditos", callback_data: 'credits' }]
      ]
    }
  });
});

bot.action('credits', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Bot creado por *Fassid Soluciones y Servicios*', { parse_mode: 'Markdown' });
});

// === SUBMENÚ DE NOTIFICACIONES ===
bot.action('notifications', (ctx) => {
  ctx.answerCbQuery();
  const msg = "¿Qué notificaciones deseas activar hoy?";
  bot.telegram.sendMessage(ctx.chat.id, msg, {
    reply_markup: {
      keyboard: [
        [{ text: "Precio de compra" }, { text: "Precio de venta" }],
        [{ text: "Bre. compra y venta" }, { text: "Bre. media Compra y venta" }],
        [{ text: "Cancelar notificaciones" }, { text: "Salir" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

bot.action('usdts', (ctx) => {
  ctx.answerCbQuery();
  const msg = "Selecciona qué deseas consultar:";
  bot.telegram.sendMessage(ctx.chat.id, msg, {
    reply_markup: {
      keyboard: [
        [{ text: "Comprar Usdt" }, { text: "Vender Usdt" }],
        [{ text: "Media de compra" }, { text: "Media de venta" }],
        [{ text: "Brecha" }, { text: "Salir" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

// === FUNCIONES API ===
async function fetchUsdtPrice() {
  try {
    const res = await axios.get(process.env.API_USDT);
    const { buy, sell } = res.data;
    return { success: true, buy, sell };
  } catch (error) {
    console.error("Error al obtener precios USDT:", error.message);
    return { success: false };
  }
}

async function fetchUsdtMedia(type) {
  try {
    const res = await axios.get(`${process.env.API_USDT_MEDIA}${type}`);
    const { tipo, media } = res.data;
    return { success: true, tipo, media };
  } catch (error) {
    console.error("Error al obtener media USDT:", error.message);
    return { success: false };
  }
}

async function fetchUsdtMediaAll() {
  const [buyRes, sellRes] = await Promise.all([
    axios.get(process.env.API_USDT_MEDIA + "/media/buy"),
    axios.get(process.env.API_USDT_MEDIA + "/media/sell")
  ]);
  const buy = parseFloat(buyRes.data.media);
  const sell = parseFloat(sellRes.data.media);
  return { buy, sell };
}

function calcularBrecha(buy, sell) {
  const diferencia = Math.abs(sell - buy);
  const porcentaje = (diferencia / buy) * 100;
  return { diferencia, porcentaje };
}

// === OPCIONES DE MENÚ ===
bot.hears('Comprar Usdt', async (ctx) => {
  const data = await fetchUsdtPrice();
  if (data.success) ctx.reply(`Precio actual de compra: *BOB ${data.buy}*`, { parse_mode: 'Markdown' });
  else ctx.reply(`No se pudo obtener el precio.`);
});

bot.hears('Vender Usdt', async (ctx) => {
  const data = await fetchUsdtPrice();
  if (data.success) ctx.reply(`Precio actual de venta: *BOB ${data.sell}*`, { parse_mode: 'Markdown' });
  else ctx.reply(`No se pudo obtener el precio.`);
});

bot.hears('Media de compra', async (ctx) => {
  const data = await fetchUsdtMedia("/media/buy");
  if (data.success) ctx.reply(`Media de compra: *BOB ${data.media}*`, { parse_mode: 'Markdown' });
  else ctx.reply('No se pudo obtener la media de compra.');
});

bot.hears('Media de venta', async (ctx) => {
  const data = await fetchUsdtMedia("/media/sell");
  if (data.success) ctx.reply(`Media de venta: *BOB ${data.media}*`, { parse_mode: 'Markdown' });
  else ctx.reply('No se pudo obtener la media de venta.');
});

bot.hears('Brecha', async (ctx) => {
  const { buy, sell } = await fetchUsdtMediaAll();
  const { diferencia, porcentaje } = calcularBrecha(buy, sell);
  ctx.reply(`Brecha actual: *${porcentaje.toFixed(2)}% (${diferencia.toFixed(2)} Bs)*`, { parse_mode: 'Markdown' });
});

// === NOTIFICACIONES ===
const esperando = {};

bot.hears("Precio de venta", async (ctx) => {
  esperando[ctx.from.id] = "venta";
  ctx.reply('Ingresa el precio de venta objetivo (ej: 10.20):');
});

bot.hears("Precio de compra", async (ctx) => {
  esperando[ctx.from.id] = "compra";
  ctx.reply('Ingresa el precio de compra objetivo (ej: 10.65 BOB):');
});

// Captura cualquier texto que no sea comando
bot.on("text", async (ctx) => {
  const estado = esperando[ctx.from.id];
  if (!estado) return; // No está esperando nada

  const objetivo = parseFloat(ctx.message.text);
  if (isNaN(objetivo)) {
    return ctx.reply('Por favor ingresa un número válido.');
  }

  if (estado === "venta") {
    await setNotification(ctx.from.id, "notify_sell", objetivo);
    ctx.reply(`✅ Notificación de *venta* activada a BOB ${objetivo}`, { parse_mode: 'Markdown' });
  }

  if (estado === "compra") {
    await setNotification(ctx.from.id, "notify_buy", objetivo);
    ctx.reply(`✅ Notificación de *compra* activada a BOB ${objetivo}`, { parse_mode: 'Markdown' });
  }

  delete esperando[ctx.from.id]; // Limpia el estado
});

bot.hears("Bre. compra y venta", async (ctx) => {
  await setNotification(ctx.from.id, "notify_brecha", 1);
  ctx.reply("Notificación de *brecha entre compra y venta* activada.", { parse_mode: 'Markdown' });
});

bot.hears("Bre. media Compra y venta", async (ctx) => {
  await setNotification(ctx.from.id, "notify_media_brecha", 1);
  ctx.reply("Notificación de *brecha media* activada.", { parse_mode: 'Markdown' });
});

bot.hears("Cancelar notificaciones", async (ctx) => {
  await clearNotifications(ctx.from.id);
  ctx.reply("Todas las notificaciones han sido desactivadas.");
});

bot.hears('Salir', (ctx) => ctx.reply('¡Hasta luego!', { reply_markup: { remove_keyboard: true } }));

// === NOTIFICADOR AUTOMÁTICO ===
// === NOTIFICADOR AUTOMÁTICO ===
let ultimaNotificacion = { porcentaje: null, diferencia: null };

setInterval(async () => {
  try {
    const { buy, sell } = await fetchUsdtMediaAll();
    const { diferencia, porcentaje } = calcularBrecha(buy, sell);

    await guardarBrecha(buy, sell, diferencia, porcentaje);

    // ✅ Enviar alerta solo si supera el umbral y cambió el valor
    if (
      porcentaje >= 0.8 &&
      (ultimaNotificacion.porcentaje === null ||
        porcentaje.toFixed(2) !== ultimaNotificacion.porcentaje.toFixed(2))
    ) {
      const usuarios = await obtenerUsuariosCon("notify_media_brecha");

      for (const u of usuarios) {
        await bot.telegram.sendMessage(
          u,
          `*Hola !* La brecha subió a ${porcentaje.toFixed(2)}% (${diferencia.toFixed(2)} Bs)\nCompra: ${buy} | Venta: ${sell}`,
          { parse_mode: "Markdown" }
        );
      }

      // ✅ Guardamos el último valor notificado
      ultimaNotificacion = { porcentaje, diferencia };
      console.log(`Notificación enviada: ${porcentaje.toFixed(2)}%`);
    }
  } catch (err) {
    console.error("Error en notificador automático:", err.message);
  }
}, 5000);

async function checkNotificaciones() {
  const precios = await fetchUsdtMediaAll(); // { buy: 10.52, sell: 10.47 }
  const notificaciones = await obtenerNotificacionesActivas(); // [{ user_id, tipo, objetivo }]

  notificaciones.forEach(async (n) => {
    if (n.tipo === 'buy' && precios.buy >= n.objetivo) {
      await bot.telegram.sendMessage(n.user_id, `¡Precio de compra alcanzado! BOB ${precios.buy} ≥ ${n.objetivo}`);
      await desactivarNotificacion(n.user_id, 'buy'); // opcional: desactiva después de avisar
    }
    if (n.tipo === 'sell' && precios.sell <= n.objetivo) {
      await bot.telegram.sendMessage(n.user_id, `¡Precio de venta alcanzado! BOB ${precios.sell} ≤ ${n.objetivo}`);
      await desactivarNotificacion(n.user_id, 'sell'); // opcional
    }
  });
}

// Ejecutar cada 60 segundos
setInterval(checkNotificaciones, 60000);

// === INICIO DEL BOT ===
async function launchBot() {
  try {
    await bot.launch({ polling: true });
    console.log('Bot iniciado correctamente');
  } catch (err) {
    console.error('Error al iniciar el bot:', err.message);
    setTimeout(launchBot, 10000);
  }
}

launchBot();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));