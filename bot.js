require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

if (!process.env.TOKEN_BOT) {
  console.error('❌ No se encontró TOKEN_BOT en el archivo .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.TOKEN_BOT, {
  telegram: {
    apiRoot: 'https://api.telegram.org',
    agent: undefined, // Puedes configurar proxy aquí
    timeout: 20000
  }
});

// Manejo global de errores
bot.catch((err, ctx) => {
  console.error(`⚠️ Error para update ${ctx?.update?.update_id}:`, err.message);
});

// Comando /start
bot.command('start', (ctx) => {
  const msg = `Bienvenido, ${ctx.from.first_name}! Soy tu asistente. ¿Qué haremos hoy?`;
  bot.telegram.sendMessage(ctx.chat.id, msg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Actividad USDT hoy", callback_data: 'usdts' }],
        [{ text: "Visita nuestra web", url: "https://qrfassid.website" }],
        [{ text: "Créditos", callback_data: 'credits' }]
      ]
    }
  });
});

bot.action('credits', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Fassid Soluciones y Servicios');
});

bot.action('usdts', (ctx) => {
  ctx.answerCbQuery();
  const msg = "Dime qué quieres saber sobre USDT:";
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

async function fetchUsdtPrice() {
  try {
    const res = await axios.get(process.env.API_USDT);
    const { success, buy, sell } = res.data;
    return { success, buy, sell };
  } catch (error) {
    console.error("Error al obtener precios USDT:", error.message);
    return { success: false, buy: null, sell: null };
  }
}

async function fetchUsdtMedia(type) {
  try {
    const res = await axios.get(`${process.env.API_USDT_MEDIA}${type.toLowerCase()}`);
    const { tipo, media } = res.data;
    return { success: true, tipo, media };
  } catch (error) {
    console.error("Error al obtener media USDT:", error.message);
    return { success: false, tipo: null, media: null };
  }
}

bot.hears('Comprar Usdt', async (ctx) => {
  const data = await fetchUsdtPrice();
  if (data.success) ctx.reply(`El precio actual de compra es: BOB ${data.buy}`);
  else ctx.reply(`No se pudo conectar al servidor.`);
});

bot.hears('Vender Usdt', async (ctx) => {
  const data = await fetchUsdtPrice();
  if (data.success) ctx.reply(`El precio actual de venta es: BOB ${data.sell}`);
  else ctx.reply(`No se pudo conectar al servidor.`);
});

bot.hears('Media de compra', async (ctx) => {
    try {
        const data = await fetchUsdtMedia('buy'); // espera la respuesta
        if (data.success) {
            ctx.reply(`Estimado ${ctx.from.first_name}, el precio de compra es: BOB ${data.media}`);
        } else {
            ctx.reply('No se pudo obtener la media de compra.');
        }
    } catch (error) {
        ctx.reply('Error al conectarse con el servidor.');
    }
});

bot.hears('Media de venta', async (ctx) => {
    try {
        const data = await fetchUsdtMedia('sell'); // espera la respuesta
        if (data.success) {
            ctx.reply(`Estimado ${ctx.from.first_name}, el precio de venta es: BOB ${data.media}`);
        } else {
            ctx.reply('No se pudo obtener la media de compra.');
        }
    } catch (error) {
        ctx.reply('Error al conectarse con el servidor.');
    }
});

bot.hears('Brecha', (ctx) => ctx.reply('Brecha de compra y venta USDT'));
bot.hears('Salir', (ctx) => ctx.reply('¡Hasta luego!', { reply_markup: { remove_keyboard: true } }));

// Auto-reconexión
async function launchBot() {
  try {
    await bot.launch({ polling: true });
    console.log('✅ Bot iniciado correctamente');
  } catch (err) {
    console.error('❌ Error al iniciar el bot:', err.message);
    console.log('⏳ Reintentando en 10 segundos...');
    setTimeout(launchBot, 10000);
  }
}

launchBot();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
