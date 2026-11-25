# ⚡ SLA Sentinel — Monitor Preditivo de Infraestrutura Urbana & Telemetria IoT

Protótipo Full Stack inspirado nos desafios reais de operação de **Cidades Inteligentes (Smart Cities)** e **Parcerias Público-Privadas (PPPs)** de iluminação pública e zeladoria urbana.

---

## 🎯 Propósito e Regras de Negócio

1. **Prevenção de Multas Contratuais (Motor Preditivo de SLA):**
   Calcula dinamicamente o percentual de SLA consumido e cruza com a criticidade do ativo (`1` a `3`), classificando as Ordens de Serviço em **NORMAL**, **ALERTA**, **CRÍTICO** ou **ESTOURADO** antes que o prazo expire.
2. **Deduplicação Temporal de Telemetria IoT:**
   Evita o envio duplicado de equipes por falsos positivos. Um chamado automático só é aberto quando o mesmo sensor reporta **3 ou mais falhas dentro de uma janela de 10 minutos** e não possui Ordem de Serviço ativa.
3. **Resiliência Offline-First em Campo:**
   Permite que equipes técnicas concluam ou atualizem Ordens de Serviço sem conexão com a internet (`localStorage`), sincronizando a fila automaticamente assim que o servidor voltar a responder.

---

## 🏗️ Arquitetura do Sistema

```text
+---------------------------------------------------------------+
|                 PAINEL WEB & CAMPO (Frontend)                 |
|  HTML5 + Tailwind CSS + Vanilla JS (ES6+) + OfflineQueue      |
+-------------------------------+-------------------------------+
                                | REST / JSON (Auto-Sync 5s)
+-------------------------------v-------------------------------+
|                   API REST & MOTOR DE SLA                     |
|  Node.js (Express ou HTTP Nativo Plug-and-Play)               |
|  ├── slaService.js (Cálculo de Risco & Priorização)           |
|  └── iotService.js (Janela Temporal 10 min & Deduplicação)    |
+-------------------------------+-------------------------------+
                                | SQL / Persistência Local
+-------------------------------v-------------------------------+
|                     BANCO DE DADOS RELACIONAL                 |
|  SQLite (better-sqlite3 / node:sqlite / JSON Fallback)        |
|  ├── ordens_servico (Índices por status)                      |
|  └── logs_telemetria (Índices compostos ativo + timestamp)    |
+---------------------------------------------------------------+
```

---

## 🚀 Como Executar (Modo Plug-and-Play)

O projeto foi desenhado para rodar **imediatamente** apenas com o **Node.js (v18+)** instalado — sem necessidade obrigatória de Docker ou compilação externa, embora também suporte `npm install` padrão:

### Opção 1: Execução Direta (Zero Dependências)
```bash
node backend/src/app.js
```
Acesse no navegador: **http://localhost:3000**

*(No Windows, você também pode dar um duplo clique em `start-windows.bat`; no Linux/macOS, execute `./start-linux-mac.sh`.)*

### Opção 2: Instalação Padrão via NPM
```bash
cd backend
npm install
npm start
```

### Testando o Simulador IoT via Terminal
Com o servidor rodando, abra outro terminal e execute:
```bash
node backend/scripts/simulador-iot.js
```

---

## 📡 Exemplos de Uso da API (`curl`)

* **Healthcheck:**
  ```bash
  curl http://localhost:3000/api/health
  ```
* **Listar Ordens Priorizadas por Risco:**
  ```bash
  curl "http://localhost:3000/api/ordens?risco=CRITICO"
  ```
* **Registrar Pulso de Telemetria IoT:**
  ```bash
  curl -X POST http://localhost:3000/api/telemetria \
    -H "Content-Type: application/json" \
    -d '{"ativo_codigo": "POSTE-CUR-8810", "tipo_evento": "FALHA_TENSAO"}'
  ```
* **Concluir Ordem de Serviço (com timestamp offline):**
  ```bash
  curl -X PATCH http://localhost:3000/api/ordens/1/status \
    -H "Content-Type: application/json" \
    -d '{"status": "CONCLUIDA", "concluido_em": "2026-11-25T17:30:00.000Z"}'
  ```
