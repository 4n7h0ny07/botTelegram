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
  obtenerUsuariosCon
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
bot.command('start', (ctx) => {
  const msg = `Bienvenido, ${ctx.from.first_name}! Soy tu asistente USDT.`;
  bot.telegram.sendMessage(ctx.chat.id, msg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Actividad USDT hoy", callback_data: 'usdts' }],
        [{ text: "Crear Notificaciones", callback_data: 'notifications' }],
        [{ text: "Visita nuestra web", url: "https://qrfassid.website" }],
        [{ text: "ℹCréditos", callback_data: 'credits' }]
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
bot.hears("Precio de compra", async (ctx) => {
  await setNotification(ctx.from.id, "notify_buy", 1);
  ctx.reply("Notificación de *precio de compra* activada.", { parse_mode: 'Markdown' });
});

bot.hears("Precio de venta", async (ctx) => {
  await setNotification(ctx.from.id, "notify_sell", 1);
  ctx.reply("Notificación de *precio de venta* activada.", { parse_mode: 'Markdown' });
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
setInterval(async () => {
  try {
    const { buy, sell } = await fetchUsdtMediaAll();
    const { diferencia, porcentaje } = calcularBrecha(buy, sell);

    await guardarBrecha(buy, sell, diferencia, porcentaje);

    if (porcentaje >= 0.8) {
      const usuarios = await obtenerUsuariosCon('notify_media_brecha');
      for (const u of usuarios) {
        bot.telegram.sendMessage(
          u,
          `*Alerta!* La brecha subió a ${porcentaje.toFixed(2)}% (${diferencia.toFixed(2)} Bs)\nCompra: ${buy} | Venta: ${sell}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (err) {
    console.error("Error en notificador automático:", err.message);
  }
}, 120000); // cada 2 minutos

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