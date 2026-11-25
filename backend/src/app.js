const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ordensController = require('./controllers/ordensController');
const telemetriaController = require('./controllers/telemetriaController');

const PORT = process.env.PORT || 3000;
const frontendPath = path.resolve(__dirname, '../../frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Inicializa o servidor HTTP usando Express (se instalado) ou fallback nativo node:http
 * para garantir execução 100% plug-and-play mesmo sem node_modules.
 */
function startServer() {
  try {
    const express = require('express');
    const cors = require('cors');
    const apiRoutes = require('./routes/apiRoutes');

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api', apiRoutes);
    app.use(express.static(frontendPath));

    app.get('/', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    app.use((err, req, res, next) => {
      console.error('[Erro Interno]:', err);
      res.status(500).json({ erro: 'Erro interno no servidor.', detalhes: err.message });
    });

    app.listen(PORT, () => logBanner('Express'));
  } catch (_) {
    // Fallback zero-dependência com node:http
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      const expressRes = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(payload));
        }
      };

      const next = (err) => {
        console.error('[Erro Interno]:', err);
        expressRes.status(500).json({ erro: 'Erro interno no servidor.', detalhes: err.message });
      };

      const parseJsonBody = () =>
        new Promise((resolve, reject) => {
          let raw = '';
          req.on('data', (chunk) => (raw += chunk));
          req.on('end', () => {
            if (!raw) return resolve({});
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });

      // Roteamento da API
      if (pathname === '/api/health' && req.method === 'GET') {
        return expressRes.status(200).json({ status: 'online', timestamp: new Date().toISOString() });
      }

      if (pathname === '/api/ordens' && req.method === 'GET') {
        const query = Object.fromEntries(parsedUrl.searchParams.entries());
        return ordensController.getOrdens({ query }, expressRes, next);
      }

      if (pathname === '/api/ordens' && req.method === 'POST') {
        return parseJsonBody()
          .then((body) => ordensController.postOrdem({ body }, expressRes, next))
          .catch(() => expressRes.status(400).json({ erro: 'JSON inválido.' }));
      }

      const patchMatch = pathname.match(/^\/api\/ordens\/(\d+)\/status$/);
      if (patchMatch && req.method === 'PATCH') {
        return parseJsonBody()
          .then((body) =>
            ordensController.patchStatusOrdem({ params: { id: patchMatch[1] }, body }, expressRes, next)
          )
          .catch(() => expressRes.status(400).json({ erro: 'JSON inválido.' }));
      }

      if (pathname === '/api/telemetria' && req.method === 'POST') {
        return parseJsonBody()
          .then((body) => telemetriaController.postTelemetria({ body }, expressRes, next))
          .catch(() => expressRes.status(400).json({ erro: 'JSON inválido.' }));
      }

      // Arquivos estáticos do Front-end
      let safePath = pathname === '/' ? '/index.html' : pathname;
      const filePath = path.join(frontendPath, path.normalize(safePath));
      if (filePath.startsWith(frontendPath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        return fs.createReadStream(filePath).pipe(res);
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: 'Rota não encontrada.' }));
    });

    server.listen(PORT, () => logBanner('Node HTTP Nativo (Zero Dependências)'));
  }
}

function logBanner(engine) {
  console.log(`====================================================`);
  console.log(`🚀 SLA Sentinel rodando em http://localhost:${PORT}`);
  console.log(`⚙️  Motor HTTP: ${engine}`);
  console.log(`📡 Endpoints API: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
}

startServer();
