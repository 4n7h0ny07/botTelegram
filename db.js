// === db.js ===
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'bot_data.db');
const db = new sqlite3.Database(dbPath);

// Crear tablas si no existen
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS medias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    valor REAL NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS brechas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buy REAL NOT NULL,
    sell REAL NOT NULL,
    diferencia REAL NOT NULL,
    porcentaje REAL NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notificaciones (
    user_id INTEGER PRIMARY KEY,
    notify_buy INTEGER DEFAULT 0,
    notify_sell INTEGER DEFAULT 0,
    notify_brecha INTEGER DEFAULT 0,
    notify_media_brecha INTEGER DEFAULT 0
  )`);
});

// ==== FUNCIONES ====

function guardarMedia(tipo, valor) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO medias (tipo, valor) VALUES (?, ?)`, [tipo, valor], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function obtenerUltimaMedia(tipo) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM medias WHERE tipo = ? ORDER BY fecha DESC LIMIT 1`, [tipo], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function guardarBrecha(buy, sell, diferencia, porcentaje) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO brechas (buy, sell, diferencia, porcentaje) VALUES (?, ?, ?, ?)`,
      [buy, sell, diferencia, porcentaje],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function obtenerUltimaBrecha() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM brechas ORDER BY fecha DESC LIMIT 1`, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function setNotification(userId, field, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notificaciones (user_id, ${field}) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${field} = ?`,
      [userId, value, value],
      function (err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

function clearNotifications(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notificaciones
       SET notify_buy = 0, notify_sell = 0, notify_brecha = 0, notify_media_brecha = 0
       WHERE user_id = ?`,
      [userId],
      function (err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

function obtenerUsuariosCon(field) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id FROM notificaciones WHERE ${field} = 1`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.user_id));
      }
    );
  });
}

module.exports = {
  db,
  guardarMedia,
  obtenerUltimaMedia,
  guardarBrecha,
  obtenerUltimaBrecha,
  setNotification,
  clearNotifications,
  obtenerUsuariosCon
};
