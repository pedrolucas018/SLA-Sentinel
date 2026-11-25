const fs = require('fs');
const path = require('path');

const sqlitePath = path.resolve(__dirname, '../../database.sqlite');
const jsonFallbackPath = path.resolve(__dirname, '../../database.json');

/**
 * Adaptador Plug-and-Play de Banco de Dados:
 * 1. Tenta usar 'better-sqlite3' (se npm install foi rodado)
 * 2. Tenta usar 'node:sqlite' nativo do Node.js 22.5+ (zero dependências)
 * 3. Caso contrário, usa persistência JSON transacional compatível com a mesma interface SQL
 */
function createDatabaseAdapter() {
  // Tentativa 1: better-sqlite3
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(sqlitePath);
    db.pragma('journal_mode = WAL');
    console.log('[Database] Driver ativo: better-sqlite3 (SQLite)');
    return db;
  } catch (_) {}

  // Tentativa 2: node:sqlite nativo (Node 22.5+)
  try {
    const { DatabaseSync } = require('node:sqlite');
    const rawDb = new DatabaseSync(sqlitePath);
    console.log('[Database] Driver ativo: node:sqlite nativo (Zero Dependências)');
    return {
      exec: (sql) => rawDb.exec(sql),
      prepare: (sql) => {
        // Converte parâmetros nomeados @param para :param caso necessário
        const normalizedSql = sql.replace(/@([a-zA-Z0-9_]+)/g, ':$1');
        const stmt = rawDb.prepare(normalizedSql);
        return {
          get: (...args) => stmt.get(...args),
          all: (...args) => stmt.all(...args),
          run: (...args) => stmt.run(...args)
        };
      },
      transaction: (fn) => (items) => {
        rawDb.exec('BEGIN');
        try {
          fn(items);
          rawDb.exec('COMMIT');
        } catch (err) {
          rawDb.exec('ROLLBACK');
          throw err;
        }
      }
    };
  } catch (_) {}

  // Tentativa 3: Persistência JSON local zero-dependência (para Node < 22 sem npm install)
  console.log('[Database] Driver ativo: Persistência JSON Local (Zero Dependências)');
  let state = {
    ordens_servico: [],
    logs_telemetria: [],
    seq_os: 0,
    seq_tel: 0
  };

  if (fs.existsSync(jsonFallbackPath)) {
    try {
      state = JSON.parse(fs.readFileSync(jsonFallbackPath, 'utf-8'));
    } catch (_) {}
  }

  const persist = () => {
    fs.writeFileSync(jsonFallbackPath, JSON.stringify(state, null, 2), 'utf-8');
  };

  return {
    exec: () => {},
    transaction: (fn) => (items) => {
      fn(items);
      persist();
    },
    prepare: (sql) => {
      const clean = sql.replace(/\s+/g, ' ').trim();
      return {
        get: (...args) => {
          if (clean.startsWith('SELECT COUNT(*) AS total FROM ordens_servico')) {
            return { total: state.ordens_servico.length };
          }
          if (clean.startsWith('SELECT MAX(id) AS maxId FROM ordens_servico')) {
            const maxId = state.ordens_servico.reduce((m, o) => Math.max(m, o.id), 0);
            return { maxId };
          }
          if (clean.startsWith('SELECT * FROM ordens_servico WHERE id = ?')) {
            return state.ordens_servico.find((o) => o.id === Number(args[0]));
          }
          if (clean.includes('FROM logs_telemetria')) {
            const [ativo, limiteIso] = args;
            const totalEventos = state.logs_telemetria.filter(
              (l) => l.ativo_codigo === ativo && l.recebido_em >= limiteIso
            ).length;
            return { totalEventos };
          }
          if (clean.includes("status IN ('ABERTA', 'EM_ANDAMENTO')")) {
            const [ativo] = args;
            return state.ordens_servico.find(
              (o) => o.ativo_codigo === ativo && ['ABERTA', 'EM_ANDAMENTO'].includes(o.status)
            );
          }
          return null;
        },
        all: () => {
          if (clean.startsWith('SELECT * FROM ordens_servico')) {
            return [...state.ordens_servico];
          }
          return [];
        },
        run: (...args) => {
          if (clean.startsWith('INSERT INTO ordens_servico')) {
            state.seq_os += 1;
            let row;
            if (typeof args[0] === 'object' && args[0] !== null) {
              row = { id: state.seq_os, ...args[0] };
            } else {
              row = {
                id: state.seq_os,
                protocolo: args[0],
                ativo_codigo: args[1],
                bairro: args[2],
                tipo_falha: args[3],
                criticidade: args[4],
                status: 'ABERTA',
                prazo_sla_minutos: args[5],
                criado_em: args[6],
                concluido_em: null
              };
            }
            state.ordens_servico.push(row);
            persist();
            return { lastInsertRowid: row.id };
          }
          if (clean.startsWith('UPDATE ordens_servico')) {
            const [status, concluido_em, id] = args;
            const target = state.ordens_servico.find((o) => o.id === Number(id));
            if (target) {
              target.status = status;
              target.concluido_em = concluido_em;
              persist();
            }
            return { changes: target ? 1 : 0 };
          }
          if (clean.startsWith('INSERT INTO logs_telemetria')) {
            state.seq_tel += 1;
            state.logs_telemetria.push({
              id: state.seq_tel,
              ativo_codigo: args[0],
              tipo_evento: args[1],
              recebido_em: args[2]
            });
            persist();
            return { lastInsertRowid: state.seq_tel };
          }
          return { changes: 0 };
        }
      };
    }
  };
}

const db = createDatabaseAdapter();

// Criação das tabelas (DDL) e índices
db.exec(`
  CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo TEXT UNIQUE NOT NULL,
      ativo_codigo TEXT NOT NULL,
      bairro TEXT NOT NULL,
      tipo_falha TEXT NOT NULL,
      criticidade INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ABERTA',
      prazo_sla_minutos INTEGER NOT NULL,
      criado_em DATETIME NOT NULL,
      concluido_em DATETIME
  );

  CREATE TABLE IF NOT EXISTS logs_telemetria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ativo_codigo TEXT NOT NULL,
      tipo_evento TEXT NOT NULL,
      recebido_em DATETIME NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
  CREATE INDEX IF NOT EXISTS idx_telemetria_ativo_tempo ON logs_telemetria(ativo_codigo, recebido_em);
`);

/**
 * Popula o banco com 10 registros iniciais realistas (idempotente).
 */
function seedDatabase() {
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM ordens_servico').get();
  if (countRow && countRow.total > 0) return;

  const now = Date.now();
  const minsAgo = (m) => new Date(now - m * 60 * 1000).toISOString();

  const initialOrders = [
    {
      protocolo: 'OS-2026-0001',
      ativo_codigo: 'POSTE-CUR-1042',
      bairro: 'Centro',
      tipo_falha: 'FIO_PARTIDO',
      criticidade: 3,
      status: 'ABERTA',
      prazo_sla_minutos: 120,
      criado_em: minsAgo(135),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0002',
      ativo_codigo: 'POSTE-CUR-2018',
      bairro: 'Batel',
      tipo_falha: 'FIO_PARTIDO',
      criticidade: 3,
      status: 'EM_ANDAMENTO',
      prazo_sla_minutos: 120,
      criado_em: minsAgo(84),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0003',
      ativo_codigo: 'POSTE-CUR-3310',
      bairro: 'Água Verde',
      tipo_falha: 'TRANSFORMADOR_AQUECIDO',
      criticidade: 2,
      status: 'ABERTA',
      prazo_sla_minutos: 180,
      criado_em: minsAgo(160),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0004',
      ativo_codigo: 'POSTE-CUR-4105',
      bairro: 'Portão',
      tipo_falha: 'LUMINARIA_APAGADA',
      criticidade: 2,
      status: 'ABERTA',
      prazo_sla_minutos: 240,
      criado_em: minsAgo(170),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0005',
      ativo_codigo: 'POSTE-CUR-5092',
      bairro: 'Santa Felicidade',
      tipo_falha: 'OSCILACAO',
      criticidade: 1,
      status: 'EM_ANDAMENTO',
      prazo_sla_minutos: 360,
      criado_em: minsAgo(230),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0006',
      ativo_codigo: 'POSTE-CUR-6211',
      bairro: 'Rebouças',
      tipo_falha: 'LUMINARIA_APAGADA',
      criticidade: 1,
      status: 'ABERTA',
      prazo_sla_minutos: 480,
      criado_em: minsAgo(95),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0007',
      ativo_codigo: 'POSTE-CUR-7404',
      bairro: 'Bigorrilho',
      tipo_falha: 'SENSOR_OFFLINE',
      criticidade: 1,
      status: 'ABERTA',
      prazo_sla_minutos: 480,
      criado_em: minsAgo(40),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0008',
      ativo_codigo: 'POSTE-CUR-8120',
      bairro: 'Centro',
      tipo_falha: 'LUMINARIA_APAGADA',
      criticidade: 2,
      status: 'ABERTA',
      prazo_sla_minutos: 240,
      criado_em: minsAgo(20),
      concluido_em: null
    },
    {
      protocolo: 'OS-2026-0009',
      ativo_codigo: 'POSTE-CUR-9001',
      bairro: 'Batel',
      tipo_falha: 'LUMINARIA_APAGADA',
      criticidade: 2,
      status: 'CONCLUIDA',
      prazo_sla_minutos: 240,
      criado_em: minsAgo(300),
      concluido_em: minsAgo(150)
    },
    {
      protocolo: 'OS-2026-0010',
      ativo_codigo: 'POSTE-CUR-9055',
      bairro: 'Água Verde',
      tipo_falha: 'OSCILACAO',
      criticidade: 1,
      status: 'CONCLUIDA',
      prazo_sla_minutos: 360,
      criado_em: minsAgo(500),
      concluido_em: minsAgo(260)
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO ordens_servico (
      protocolo, ativo_codigo, bairro, tipo_falha,
      criticidade, status, prazo_sla_minutos, criado_em, concluido_em
    ) VALUES (
      @protocolo, @ativo_codigo, @bairro, @tipo_falha,
      @criticidade, @status, @prazo_sla_minutos, @criado_em, @concluido_em
    )
  `);

  const insertMany = db.transaction((orders) => {
    for (const order of orders) {
      insertStmt.run(order);
    }
  });

  insertMany(initialOrders);
  console.log('[Database] Seed inicial executado com 10 Ordens de Serviço.');
}

seedDatabase();

module.exports = db;
