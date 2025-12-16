/**
 * index.js - Bot Telegram de notificaciones reactivas USDT P2P Binance
 */

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import sqlite3 from 'sqlite3';
import util from 'util';
import axios from 'axios';

// =================== CONFIG ===================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

if (!TELEGRAM_TOKEN) {
    console.error('Falta TELEGRAM_TOKEN en .env. Cancelo ejecución.');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const DB_FILE = './botdata.sqlite';
let rawDb = null;

// =================== DB ===================
async function openDatabase(filename) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filename, (err) => {
            if (err) return reject(err);
            db.getAsync = util.promisify(db.get).bind(db);
            db.allAsync = util.promisify(db.all).bind(db);
            db.runAsync = function (sql, params = []) {
                return new Promise((res, rej) => {
                    db.run(sql, params, function (err) {
                        if (err) return rej(err);
                        res({ lastID: this.lastID, changes: this.changes });
                    });
                });
            };
            resolve(db);
        });
    });
}

async function initDb() {
    rawDb = await openDatabase(DB_FILE);

    await rawDb.runAsync(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            created_at TEXT
        );
    `);

    await rawDb.runAsync(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            notify_type TEXT,
            limit_value REAL,
            status TEXT,
            created_at TEXT,
            updated_at TEXT
        );
    `);

    console.log('DB inicializada:', DB_FILE);
}

// =================== GLOBAL VARIABLES ===================
let lastPriceData = null;

// =================== FETCH BINANCE ===================
async function fetchUsdtPriceSafe() {
    try {
        const url = process.env.BINANCE_API_URL || "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
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

// =================== HELPERS ===================
async function ensureUser(telegramUser) {
    const u = await rawDb.getAsync("SELECT * FROM users WHERE telegram_id = ?", [telegramUser.id]);
    if (u) return u;
    const now = new Date().toISOString();
    const r = await rawDb.runAsync(
        "INSERT INTO users (telegram_id, username, first_name, last_name, created_at) VALUES (?,?,?,?,?)",
        [telegramUser.id, telegramUser.username || null, telegramUser.first_name || null, telegramUser.last_name || null, now]
    );
    return await rawDb.getAsync("SELECT * FROM users WHERE id = ?", [r.lastID]);
}

async function createNotification(chatId, notifyType, limitValue=null) {
    const now = new Date().toISOString();
    const r = await rawDb.runAsync(
        "INSERT INTO notifications (chat_id, notify_type, limit_value, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        [chatId, notifyType, limitValue, "active", now, now]
    );
    return await rawDb.getAsync("SELECT * FROM notifications WHERE id=?", [r.lastID]);
}

async function deactivateNotification(id) {
    const now = new Date().toISOString();
    await rawDb.runAsync("UPDATE notifications SET status='sent', updated_at=? WHERE id=?", [now, id]);
}

async function getActiveNotifications() {
    return await rawDb.allAsync("SELECT * FROM notifications WHERE status='active'");
}

async function deactivateAllNotifications(chatId) {
    const now = new Date().toISOString();
    await rawDb.runAsync("UPDATE notifications SET status='sent', updated_at=? WHERE chat_id=?", [now, chatId]);
}

// =================== MENÚ ===================
function menu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Consultar precios", callback_data: "menu_prices" }],
                [{ text: "Activar notificación", callback_data: "menu_activate" }],
                [{ text: "Mis notificaciones", callback_data: "menu_mydata" }],
                [{ text: "Desactivar todas", callback_data: "menu_deactivate_all" }]
            ]
        }
    };
}

// =================== COMANDO /start ===================
bot.onText(/\/start/, async (msg) => {
    try {
        await ensureUser(msg.from);
        await bot.sendMessage(msg.chat.id, `Hola ${msg.from.first_name || ""}!`, menu());
    } catch (err) {
        console.error("/start err", err.message);
    }
});

// =================== CALLBACK QUERY ===================
const awaitingLimitForUser = {}; // Para pedir límites cuando aplica

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const user = await ensureUser(query.from);
    const data = query.data;

    try {
        if (data === "menu_prices") {
            const p = await fetchUsdtPriceSafe();
            if (p.error) return bot.sendMessage(chatId, `Error al obtener precios: ${p.error}`);

            const text = `
            ---USDT P2P---
            Compra: ${p.currentBuy.toFixed(2)}
            Venta: ${p.currentSell.toFixed(2)}
            ---MEDIA---
            Compra: ${p.avgBuy.toFixed(2)}
            Venta: ${p.avgSell.toFixed(2)}
            Brecha Precio: ${p.gapPrice.toFixed(2)} pts
            Brecha Media: ${p.gapAvg.toFixed(2)} pts (${p.gapAvgPercent.toFixed(2)}%)`;
            await bot.sendMessage(chatId, text);

        } else if (data === "menu_activate") {
            const keyboard = [
                [{ text: "Precio Compra ", callback_data: "notify_price_buy" }],
                [{ text: "Precio Venta ", callback_data: "notify_price_sell" }],
                [{ text: "Media Compra ", callback_data: "notify_avg_buy" }],
                [{ text: "Media Venta ", callback_data: "notify_avg_sell" }],
                [{ text: "Brecha Compra/Venta ", callback_data: "notify_gap_price" }],
                [{ text: "Brecha Media Compra/Venta ", callback_data: "notify_gap_avg" }]
            ];
            await bot.sendMessage(chatId, "Seleccione notificación a activar:", { reply_markup: { inline_keyboard: keyboard } });

        } else if (data === "menu_deactivate_all") {
            await deactivateAllNotifications(chatId);
            await bot.sendMessage(chatId, "Todas las notificaciones desactivadas.");

        } else if (data === "menu_mydata") {
            const notes = await rawDb.allAsync("SELECT * FROM notifications WHERE chat_id=? AND status='active'", [chatId]);
            if (!notes.length) return bot.sendMessage(chatId, "No tienes notificaciones activas.");

            let text = "Tus notificaciones activas:\n";
            notes.forEach((n, i) => {
                text += `\n${i+1}. ${n.notify_type}${n.limit_value !== null ? ` (límite: ${n.limit_value})` : ""} [ID: ${n.id}]`;
            });

            const keyboard = notes.map(n => [{ text: `Desactivar ${n.notify_type}`, callback_data: `deactivate_${n.id}` }]);
            keyboard.push([{ text: "Volver al menú", callback_data: "menu_main" }]);
            await bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });

        } else if (data.startsWith("notify_")) {
            const notifyType = data.replace("notify_", "");
            if (notifyType === "gap_price" || notifyType === "gap_avg") {
                await createNotification(chatId, notifyType);
                await bot.sendMessage(chatId, `Notificación activada.`);
            } else {
                awaitingLimitForUser[user.telegram_id] = { notifyType, chatId };
                await bot.sendMessage(chatId, `Ingrese límite para ${notifyType}:`);
            }

        } else if (data.startsWith("deactivate_")) {
            const id = parseInt(data.replace("deactivate_", ""));
            await deactivateNotification(id);
            await bot.sendMessage(chatId, `Notificación ID ${id} desactivada.`);

        } else if (data === "menu_main") {
            await bot.sendMessage(chatId, "Menú principal:", menu());
        }

    } catch (err) {
        console.error("Callback err:", err.message);
    } finally {
        try { 
            await bot.answerCallbackQuery(query.id); 
        } catch (err) {
            if (err?.name === "AggregateError") console.warn("Ignorado AggregateError en answerCallbackQuery");
            else console.error("answerCallbackQuery error:", err.message);
        }
    }
});

// =================== HANDLER PARA LÍMITES ===================
bot.on("message", async (msg) => {
    if (msg.text.startsWith("/")) return;

    const state = awaitingLimitForUser[msg.from.id];
    if (!state) return;

    const limit = parseFloat(msg.text.replace(',', '.'));
    if (isNaN(limit)) return bot.sendMessage(msg.chat.id, "Valor inválido. Ingrese un número.");

    await createNotification(state.chatId, state.notifyType, limit);
    await bot.sendMessage(msg.chat.id, `Notificación ${state.notifyType} activada con límite ${limit}`);
    delete awaitingLimitForUser[msg.from.id];
});

// =================== SCHEDULER ===================
setInterval(async () => {
    try {
        const prices = await fetchUsdtPriceSafe();
        if (prices.error) return;

        const notifications = await getActiveNotifications();
        for (const n of notifications) {
            let triggered = false;
            let text = "";

            switch (n.notify_type) {
                case "price_buy":
                    if (prices.currentBuy > n.limit_value) triggered = true;
                    text = `Precio Compra alcanzó ${prices.currentBuy.toFixed(2)} = límite ${n.limit_value}`;
                    break;
                case "price_sell":
                    if (prices.currentSell < n.limit_value) triggered = true;
                    text = `Precio Venta alcanzó ${prices.currentSell.toFixed(2)} = límite ${n.limit_value}`;
                    break;
                case "avg_buy":
                    if (prices.avgBuy > n.limit_value) triggered = true;
                    text = `Media Compra alcanzó ${prices.avgBuy.toFixed(2)} = límite ${n.limit_value}`;
                    break;
                case "avg_sell":
                    if (prices.avgSell < n.limit_value) triggered = true;
                    text = `Media Venta alcanzó ${prices.avgSell.toFixed(2)} = límite ${n.limit_value}`;
                    break;
                case "gap_price":
                    if ((prices.currentBuy - prices.currentSell) > 18) triggered = true;
                    text = `Brecha Compra/venta alcanzó ${(prices.currentBuy - prices.currentSell).toFixed(2)} pts = 18 pts`;
                    break;
                case "gap_avg":
                    if ((prices.avgBuy - prices.avgSell) > 18) triggered = true;
                    text = `Brecha Media Compra/Venta alcanzó ${(prices.avgBuy - prices.avgSell).toFixed(2)} pts = 18 pts`;
                    break;
            }

            if (triggered) {
                await bot.sendMessage(n.chat_id, `🔔 Notificación:\n ${text}`);
                await deactivateNotification(n.id);
            }
        }

    } catch (err) {
        console.error("Scheduler error:", err.message);
    }
}, 30000);

// =================== EXPRESS /status ===================
const app = express();
app.get("/status", async (req, res) => {
    try {
        const row = await rawDb.getAsync("SELECT COUNT(*) as c FROM notifications WHERE status='active'");
        res.json({ status: "ok", active_notifications: row.c, last_price_data: lastPriceData, server_time: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: "error", error: err.message });
    }
});

// =================== INIT ===================
(async () => {
    await initDb();
    app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
})();
