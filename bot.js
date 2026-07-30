/**
 * Bot Telegram para consultar precios USDT P2P Binance y crear alertas.
 */

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import sqlite3 from 'sqlite3';
import util from 'util';
import axios from 'axios';

// =================== CONFIG ===================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN_BOT;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DB_FILE = process.env.DB_FILE || './botdata.sqlite';
const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const AVG_ROWS = process.env.AVG_ROWS ? parseInt(process.env.AVG_ROWS, 10) : 5;
const GAP_DEFAULT_LIMIT = process.env.GAP_DEFAULT_LIMIT ? parseFloat(process.env.GAP_DEFAULT_LIMIT) : 15;
const CHECK_INTERVAL_MS = process.env.CHECK_INTERVAL_MS ? parseInt(process.env.CHECK_INTERVAL_MS, 10) : 30000;
const BCB_EXCHANGE_URL = process.env.BCB_EXCHANGE_URL || 'https://www.bcb.gob.bo/librerias/indicadores/dolar/bolsin.php';
const BCB_CHECK_INTERVAL_MS = process.env.BCB_CHECK_INTERVAL_MS
    ? parseInt(process.env.BCB_CHECK_INTERVAL_MS, 10)
    : 5 * 60 * 1000;
const BCB_CHECK_START_HOUR = process.env.BCB_CHECK_START_HOUR
    ? parseInt(process.env.BCB_CHECK_START_HOUR, 10)
    : 20;
const BOLIVIA_TIME_ZONE = 'America/La_Paz';

if (!TELEGRAM_TOKEN) {
    console.error('Falta TELEGRAM_TOKEN o TOKEN_BOT en .env. Cancelo ejecucion.');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
let rawDb = null;
let lastPriceData = null;

const ALERT_TYPES = {
    price_buy: { label: 'Precio compra', field: 'currentBuy' },
    price_sell: { label: 'Precio venta', field: 'currentSell' },
    avg_buy: { label: 'Media compra', field: 'avgBuy' },
    avg_sell: { label: 'Media venta', field: 'avgSell' },
    gap_price: { label: 'Brecha compra/venta', field: 'gapPrice' },
    gap_avg: { label: 'Brecha media compra/venta', field: 'gapAvg' }
};

const DIRECTIONS = {
    up: { label: 'sube', operator: '>=' },
    down: { label: 'baja', operator: '<=' }
};

const awaitingLimitForUser = {};

// =================== DB ===================
async function openDatabase(filename) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filename, (err) => {
            if (err) return reject(err);
            db.getAsync = util.promisify(db.get).bind(db);
            db.allAsync = util.promisify(db.all).bind(db);
            db.runAsync = function (sql, params = []) {
                return new Promise((res, rej) => {
                    db.run(sql, params, function (runErr) {
                        if (runErr) return rej(runErr);
                        res({ lastID: this.lastID, changes: this.changes });
                    });
                });
            };
            resolve(db);
        });
    });
}

async function columnExists(tableName, columnName) {
    const columns = await rawDb.allAsync(`PRAGMA table_info(${tableName})`);
    return columns.some((column) => column.name === columnName);
}

async function initDb() {
    rawDb = await openDatabase(DB_FILE);

    await rawDb.runAsync(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            chat_id INTEGER,
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
            direction TEXT,
            limit_value REAL,
            status TEXT,
            created_at TEXT,
            updated_at TEXT
        );
    `);

    if (!(await columnExists('notifications', 'direction'))) {
        await rawDb.runAsync("ALTER TABLE notifications ADD COLUMN direction TEXT");
    }

    if (!(await columnExists('users', 'chat_id'))) {
        await rawDb.runAsync("ALTER TABLE users ADD COLUMN chat_id INTEGER");
    }

    await rawDb.runAsync(`
        CREATE TABLE IF NOT EXISTS bcb_exchange_rate_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            value REAL NOT NULL,
            effective_date TEXT,
            fingerprint TEXT NOT NULL,
            observed_at TEXT NOT NULL
        );
    `);

    console.log('DB inicializada:', DB_FILE);
}

// =================== BINANCE ===================
function averagePrice(rows) {
    const validRows = rows
        .slice(0, AVG_ROWS)
        .map((item) => parseFloat(item?.adv?.price))
        .filter((price) => Number.isFinite(price));

    if (!validRows.length) return null;
    return validRows.reduce((sum, price) => sum + price, 0) / validRows.length;
}

async function fetchUsdtPriceSafe() {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; BinanceP2PNotifier/1.0)'
        };

        const basePayload = {
            asset: 'USDT',
            fiat: 'BOB',
            page: 1,
            rows: Math.max(AVG_ROWS, 1),
            payTypes: [],
            publisherType: 'merchant',
            transAmount: '0'
        };

        const [buyResp, sellResp] = await Promise.all([
            axios.post(BINANCE_API_URL, { ...basePayload, tradeType: 'BUY' }, { headers }),
            axios.post(BINANCE_API_URL, { ...basePayload, tradeType: 'SELL' }, { headers })
        ]);

        const buyData = buyResp.data?.data || [];
        const sellData = sellResp.data?.data || [];

        if (!buyData.length || !sellData.length) {
            return { error: 'No hay datos de Binance' };
        }

        const currentBuy = parseFloat(buyData[0]?.adv?.price);
        const currentSell = parseFloat(sellData[0]?.adv?.price);
        const avgBuy = averagePrice(buyData);
        const avgSell = averagePrice(sellData);

        if (![currentBuy, currentSell, avgBuy, avgSell].every(Number.isFinite)) {
            return { error: 'Binance devolvio precios invalidos' };
        }

        const gapPrice = currentBuy - currentSell;
        const gapAvg = avgBuy - avgSell;
        const gapAvgPercent = avgBuy === 0 ? 0 : (gapAvg / avgBuy) * 100;

        lastPriceData = { currentBuy, currentSell, avgBuy, avgSell, gapPrice, gapAvg, gapAvgPercent };
        return lastPriceData;
    } catch (err) {
        console.error('Error fetchUsdtPriceSafe:', err.message);
        return { error: err.message };
    }
}

// =================== BCB ===================
function htmlToText(html) {
    return String(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&oacute;|&#243;/gi, 'ó')
        .replace(/&aacute;|&#225;/gi, 'á')
        .replace(/&eacute;|&#233;/gi, 'é')
        .replace(/&iacute;|&#237;/gi, 'í')
        .replace(/&uacute;|&#250;/gi, 'ú')
        .replace(/&ntilde;|&#241;/gi, 'ñ')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseBcbExchangeRate(html) {
    const text = htmlToText(html);
    const patterns = [
        /vigente\s+desde\s+el\s+([^:]{3,80}?)\s*:\s*Bs\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*por\s*1\s*US\$?/i,
        /tipo\s+de\s+cambio\s+oficial[\s\S]{0,200}?USD[\s\S]{0,80}?([0-9]+(?:[.,][0-9]+)?)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;

        const hasEffectiveDate = match.length === 3;
        const rawValue = hasEffectiveDate ? match[2] : match[1];
        const value = Number(rawValue.replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) continue;

        return {
            value,
            effectiveDate: hasEffectiveDate ? match[1].trim() : null
        };
    }

    throw new Error('No se pudo encontrar la cotizacion USD en la pagina del BCB');
}

async function fetchBcbExchangeRate() {
    const response = await axios.get(BCB_EXCHANGE_URL, {
        timeout: 15000,
        responseType: 'text',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TelegramBCBNotifier/1.0)',
            Accept: 'text/html,application/xhtml+xml'
        }
    });
    return parseBcbExchangeRate(response.data);
}

function getBoliviaHour(date = new Date()) {
    const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: BOLIVIA_TIME_ZONE,
        hour: '2-digit',
        hourCycle: 'h23'
    }).format(date);
    return Number(hour);
}

function formatBcbMessage(rate) {
    return [
        '📢 Precio oficial del USD actualizado',
        '',
        `1 USD = Bs ${rate.value.toFixed(2)}`,
        rate.effectiveDate ? `Vigente desde: ${rate.effectiveDate}` : null,
        '',
        'Fuente: Banco Central de Bolivia (BCB)',
        BCB_EXCHANGE_URL
    ].filter((line) => line !== null).join('\n');
}

async function broadcastBcbRate(rate) {
    const recipients = await rawDb.allAsync(`
        SELECT DISTINCT COALESCE(chat_id, telegram_id) AS chat_id
        FROM users
        WHERE COALESCE(chat_id, telegram_id) IS NOT NULL
    `);
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
        try {
            await bot.sendMessage(recipient.chat_id, formatBcbMessage(rate), {
                disable_web_page_preview: true
            });
            sent += 1;
        } catch (err) {
            failed += 1;
            console.error(`No se pudo notificar BCB al chat ${recipient.chat_id}:`, err.message);
        }
        // Mantiene el envio por debajo del limite general de Telegram.
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(`Notificacion BCB finalizada. Enviados: ${sent}, fallidos: ${failed}`);
}

// =================== HELPERS ===================
async function ensureUser(telegramUser, chatId = telegramUser.id) {
    const existingUser = await rawDb.getAsync('SELECT * FROM users WHERE telegram_id = ?', [telegramUser.id]);
    if (existingUser) {
        await rawDb.runAsync(
            `UPDATE users
             SET chat_id = ?, username = ?, first_name = ?, last_name = ?
             WHERE telegram_id = ?`,
            [
                chatId,
                telegramUser.username || null,
                telegramUser.first_name || null,
                telegramUser.last_name || null,
                telegramUser.id
            ]
        );
        return rawDb.getAsync('SELECT * FROM users WHERE telegram_id = ?', [telegramUser.id]);
    }

    const now = new Date().toISOString();
    const result = await rawDb.runAsync(
        'INSERT INTO users (telegram_id, chat_id, username, first_name, last_name, created_at) VALUES (?,?,?,?,?,?)',
        [
            telegramUser.id,
            chatId,
            telegramUser.username || null,
            telegramUser.first_name || null,
            telegramUser.last_name || null,
            now
        ]
    );
    return rawDb.getAsync('SELECT * FROM users WHERE id = ?', [result.lastID]);
}

async function createNotification(chatId, notifyType, direction, limitValue) {
    const now = new Date().toISOString();
    const result = await rawDb.runAsync(
        `INSERT INTO notifications
            (chat_id, notify_type, direction, limit_value, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [chatId, notifyType, direction, limitValue, 'active', now, now]
    );
    return rawDb.getAsync('SELECT * FROM notifications WHERE id = ?', [result.lastID]);
}

async function deactivateNotification(id, chatId = null) {
    const now = new Date().toISOString();
    if (chatId) {
        await rawDb.runAsync(
            "UPDATE notifications SET status = 'sent', updated_at = ? WHERE id = ? AND chat_id = ?",
            [now, id, chatId]
        );
        return;
    }
    await rawDb.runAsync("UPDATE notifications SET status = 'sent', updated_at = ? WHERE id = ?", [now, id]);
}

async function getActiveNotifications() {
    return rawDb.allAsync("SELECT * FROM notifications WHERE status = 'active'");
}

async function deactivateAllNotifications(chatId) {
    const now = new Date().toISOString();
    await rawDb.runAsync(
        "UPDATE notifications SET status = 'sent', updated_at = ? WHERE chat_id = ? AND status = 'active'",
        [now, chatId]
    );
}

function inferDirection(notification) {
    if (notification.direction && DIRECTIONS[notification.direction]) return notification.direction;
    if (['price_sell', 'avg_sell'].includes(notification.notify_type)) return 'down';
    return 'up';
}

function getAlertLabel(type) {
    return ALERT_TYPES[type]?.label || type;
}

function formatPriceMessage(prices) {
    return [
        '---USDT P2P---',
        `Compra: ${prices.currentBuy.toFixed(2)}`,
        `Venta: ${prices.currentSell.toFixed(2)}`,
        '---MEDIA---',
        `Compra: ${prices.avgBuy.toFixed(2)}`,
        `Venta: ${prices.avgSell.toFixed(2)}`,
        `Brecha precio: ${prices.gapPrice.toFixed(2)} pts`,
        `Brecha media: ${prices.gapAvg.toFixed(2)} pts (${prices.gapAvgPercent.toFixed(2)}%)`
    ].join('\n');
}

function notificationSummary(notification) {
    const direction = DIRECTIONS[inferDirection(notification)]?.label || 'sube';
    return `${getAlertLabel(notification.notify_type)} ${direction} a ${Number(notification.limit_value).toFixed(2)}`;
}

// =================== MENUS ===================
function mainMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Consultar precios', callback_data: 'menu_prices' }],
                [{ text: 'Activar notificacion', callback_data: 'menu_activate' }],
                [{ text: 'Mis notificaciones', callback_data: 'menu_mydata' }],
                [{ text: 'Desactivar todas', callback_data: 'menu_deactivate_all' }]
            ]
        }
    };
}

function alertTypeMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Precio compra', callback_data: 'notify_price_buy' }],
                [{ text: 'Precio venta', callback_data: 'notify_price_sell' }],
                [{ text: 'Media compra', callback_data: 'notify_avg_buy' }],
                [{ text: 'Media venta', callback_data: 'notify_avg_sell' }],
                [{ text: 'Brecha compra/venta', callback_data: 'notify_gap_price' }],
                [{ text: 'Brecha media compra/venta', callback_data: 'notify_gap_avg' }],
                [{ text: 'Volver al menu', callback_data: 'menu_main' }]
            ]
        }
    };
}

function directionMenu(notifyType) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Avisar si sube', callback_data: `direction_${notifyType}_up` }],
                [{ text: 'Avisar si baja', callback_data: `direction_${notifyType}_down` }],
                [{ text: 'Volver', callback_data: 'menu_activate' }]
            ]
        }
    };
}

// =================== TELEGRAM ===================
bot.onText(/\/start/, async (msg) => {
    try {
        await ensureUser(msg.from, msg.chat.id);
        await bot.sendMessage(msg.chat.id, `Hola ${msg.from.first_name || ''}.`, mainMenu());
    } catch (err) {
        console.error('/start err', err.message);
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        const user = await ensureUser(query.from, chatId);

        if (data === 'menu_prices') {
            const prices = await fetchUsdtPriceSafe();
            if (prices.error) {
                await bot.sendMessage(chatId, `Error al obtener precios: ${prices.error}`);
                return;
            }
            await bot.sendMessage(chatId, formatPriceMessage(prices));
            return;
        }

        if (data === 'menu_activate') {
            await bot.sendMessage(chatId, 'Seleccione que precio desea vigilar:', alertTypeMenu());
            return;
        }

        if (data === 'menu_deactivate_all') {
            await deactivateAllNotifications(chatId);
            await bot.sendMessage(chatId, 'Todas las notificaciones activas fueron desactivadas.');
            return;
        }

        if (data === 'menu_mydata') {
            const notifications = await rawDb.allAsync(
                "SELECT * FROM notifications WHERE chat_id = ? AND status = 'active' ORDER BY id DESC",
                [chatId]
            );

            if (!notifications.length) {
                await bot.sendMessage(chatId, 'No tienes notificaciones activas.');
                return;
            }

            const text = [
                'Tus notificaciones activas:',
                ...notifications.map((notification, index) => `${index + 1}. ${notificationSummary(notification)} [ID: ${notification.id}]`)
            ].join('\n');
            const keyboard = notifications.map((notification) => [
                { text: `Desactivar ${getAlertLabel(notification.notify_type)}`, callback_data: `deactivate_${notification.id}` }
            ]);
            keyboard.push([{ text: 'Volver al menu', callback_data: 'menu_main' }]);

            await bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
            return;
        }

        if (data.startsWith('notify_')) {
            const notifyType = data.replace('notify_', '');
            if (!ALERT_TYPES[notifyType]) {
                await bot.sendMessage(chatId, 'Tipo de notificacion no valido.');
                return;
            }
            delete awaitingLimitForUser[user.telegram_id];
            await bot.sendMessage(chatId, `Seleccione condicion para ${getAlertLabel(notifyType)}:`, directionMenu(notifyType));
            return;
        }

        if (data.startsWith('direction_')) {
            const parts = data.split('_');
            const direction = parts.pop();
            const notifyType = parts.slice(1).join('_');

            if (!ALERT_TYPES[notifyType] || !DIRECTIONS[direction]) {
                await bot.sendMessage(chatId, 'Condicion de notificacion no valida.');
                return;
            }

            awaitingLimitForUser[user.telegram_id] = { notifyType, direction, chatId };
            const defaultHint = notifyType.startsWith('gap_') ? ` Ejemplo: ${GAP_DEFAULT_LIMIT}` : '';
            await bot.sendMessage(
                chatId,
                `Ingrese el limite para ${getAlertLabel(notifyType)} cuando ${DIRECTIONS[direction].label}.${defaultHint}`
            );
            return;
        }

        if (data.startsWith('deactivate_')) {
            const id = parseInt(data.replace('deactivate_', ''), 10);
            if (!Number.isInteger(id)) {
                await bot.sendMessage(chatId, 'ID de notificacion no valido.');
                return;
            }
            await deactivateNotification(id, chatId);
            await bot.sendMessage(chatId, `Notificacion ID ${id} desactivada.`);
            return;
        }

        if (data === 'menu_main') {
            await bot.sendMessage(chatId, 'Menu principal:', mainMenu());
        }
    } catch (err) {
        console.error('Callback err:', err.message);
        await bot.sendMessage(chatId, 'Ocurrio un error procesando la accion.');
    } finally {
        try {
            await bot.answerCallbackQuery(query.id);
        } catch (err) {
            console.error('answerCallbackQuery error:', err.message);
        }
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const state = awaitingLimitForUser[msg.from.id];
    if (!state) return;

    const limit = parseFloat(msg.text.replace(',', '.'));
    if (!Number.isFinite(limit)) {
        await bot.sendMessage(msg.chat.id, 'Valor invalido. Ingrese un numero, por ejemplo 10.45.');
        return;
    }

    await createNotification(state.chatId, state.notifyType, state.direction, limit);
    await bot.sendMessage(
        msg.chat.id,
        `Notificacion activada: ${getAlertLabel(state.notifyType)} ${DIRECTIONS[state.direction].label} a ${limit.toFixed(2)}.`
    );
    delete awaitingLimitForUser[msg.from.id];
});

// =================== SCHEDULER ===================
async function checkNotifications() {
    try {
        const prices = await fetchUsdtPriceSafe();
        if (prices.error) return;

        const notifications = await getActiveNotifications();
        for (const notification of notifications) {
            const alertType = ALERT_TYPES[notification.notify_type];
            if (!alertType) continue;

            const direction = inferDirection(notification);
            const currentValue = prices[alertType.field];
            const limitValue = Number(notification.limit_value);
            if (!Number.isFinite(currentValue) || !Number.isFinite(limitValue)) continue;

            const triggered = direction === 'up'
                ? currentValue >= limitValue
                : currentValue <= limitValue;

            if (!triggered) continue;

            await bot.sendMessage(
                notification.chat_id,
                [
                    'Notificacion:',
                    `${alertType.label} ${DIRECTIONS[direction].label}.`,
                    `Actual: ${currentValue.toFixed(2)}`,
                    `Limite: ${limitValue.toFixed(2)}`
                ].join('\n')
            );
            await deactivateNotification(notification.id);
        }
    } catch (err) {
        console.error('Scheduler error:', err.message);
    }
}

async function checkBcbExchangeRate() {
    if (getBoliviaHour() < BCB_CHECK_START_HOUR) return;

    try {
        const rate = await fetchBcbExchangeRate();
        const fingerprint = rate.value.toFixed(6);
        const previous = await rawDb.getAsync(
            'SELECT * FROM bcb_exchange_rate_state WHERE id = 1'
        );

        if (!previous) {
            await rawDb.runAsync(
                `INSERT INTO bcb_exchange_rate_state
                    (id, value, effective_date, fingerprint, observed_at)
                 VALUES (1, ?, ?, ?, ?)`,
                [rate.value, rate.effectiveDate, fingerprint, new Date().toISOString()]
            );
            console.log(`Linea base BCB guardada: Bs ${rate.value.toFixed(2)}`);
            return;
        }

        if (Number(previous.value) === rate.value) {
            if (previous.effective_date !== rate.effectiveDate || previous.fingerprint !== fingerprint) {
                await rawDb.runAsync(
                    `UPDATE bcb_exchange_rate_state
                     SET effective_date = ?, fingerprint = ?, observed_at = ?
                     WHERE id = 1`,
                    [rate.effectiveDate, fingerprint, new Date().toISOString()]
                );
            }
            return;
        }

        await rawDb.runAsync(
            `UPDATE bcb_exchange_rate_state
             SET value = ?, effective_date = ?, fingerprint = ?, observed_at = ?
             WHERE id = 1`,
            [rate.value, rate.effectiveDate, fingerprint, new Date().toISOString()]
        );
        await broadcastBcbRate(rate);
    } catch (err) {
        console.error('Error revisando cotizacion BCB:', err.message);
    }
}

// =================== EXPRESS ===================
app.get('/status', async (req, res) => {
    try {
        const row = await rawDb.getAsync("SELECT COUNT(*) as c FROM notifications WHERE status = 'active'");
        const bcbState = await rawDb.getAsync('SELECT * FROM bcb_exchange_rate_state WHERE id = 1');
        res.json({
            status: 'ok',
            active_notifications: row.c,
            last_price_data: lastPriceData,
            avg_rows: AVG_ROWS,
            check_interval_ms: CHECK_INTERVAL_MS,
            bcb_exchange_rate: bcbState
                ? {
                    value: bcbState.value,
                    effective_date: bcbState.effective_date,
                    observed_at: bcbState.observed_at
                }
                : null,
            bcb_check_start_hour: BCB_CHECK_START_HOUR,
            bcb_check_interval_ms: BCB_CHECK_INTERVAL_MS,
            server_time: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// =================== INIT ===================
(async () => {
    await initDb();
    setInterval(checkNotifications, CHECK_INTERVAL_MS);
    setInterval(checkBcbExchangeRate, BCB_CHECK_INTERVAL_MS);
    checkNotifications();
    checkBcbExchangeRate();
    app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
})();
