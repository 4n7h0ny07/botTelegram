// === db.js ===
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Detectar entorno Railway
const isRailway = !!process.env.RAILWAY_STATIC_URL; // true si está en Railway

const dbPath = path.resolve(__dirname, 'bot_data.db');

// Reiniciar DB en Railway para evitar conflictos
if (isRailway && fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("🗑️ Base de datos SQLite reiniciada en Railway");
}

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
    objetivo_buy REAL DEFAULT NULL,
    notify_sell INTEGER DEFAULT 0,
    objetivo_sell REAL DEFAULT NULL,
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

// ---- Notificaciones ----
function setNotification(userId, field, valorObjetivo = null) {
  // field: notify_buy, notify_sell, notify_brecha, notify_media_brecha
  const objetivoField = field === "notify_buy" ? "objetivo_buy" : field === "notify_sell" ? "objetivo_sell" : null;

  if (objetivoField) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO notificaciones (user_id, ${field}, ${objetivoField}) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET ${field} = ?, ${objetivoField} = ?`,
        [userId, 1, valorObjetivo, 1, valorObjetivo],
        function (err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  } else {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO notificaciones (user_id, ${field}) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET ${field} = 1`,
        [userId],
        function (err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }
}

function clearNotifications(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notificaciones
       SET notify_buy = 0, objetivo_buy = NULL,
           notify_sell = 0, objetivo_sell = NULL,
           notify_brecha = 0, notify_media_brecha = 0
       WHERE user_id = ?`,
      [userId],
      function (err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

// Obtener usuarios con notificación activa y su objetivo (si aplica)
function obtenerUsuariosConObjetivo(field) {
  const objetivoField = field === "notify_buy" ? "objetivo_buy" : field === "notify_sell" ? "objetivo_sell" : null;
  if (!objetivoField) return obtenerUsuariosCon(field); // solo devuelve user_id
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, ${objetivoField} as objetivo FROM notificaciones WHERE ${field} = 1`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Solo user_id
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

function obtenerNotificacionesActivas() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, notify_buy AS tipo_buy, notify_sell AS tipo_sell, notify_brecha, notify_media_brecha 
       FROM notificaciones 
       WHERE notify_buy > 0 OR notify_sell > 0 OR notify_brecha > 0 OR notify_media_brecha > 0`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(
          rows.map(r => ({
            user_id: r.user_id,
            buy: r.tipo_buy,
            sell: r.tipo_sell,
            brecha: r.notify_brecha,
            media_brecha: r.notify_media_brecha
          }))
        );
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
  obtenerUsuariosCon,
  obtenerUsuariosConObjetivo,
  obtenerNotificacionesActivas
};
