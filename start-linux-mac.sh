#!/usr/bin/env bash
echo "===================================================="
echo "  Iniciando SLA Sentinel (Modo Plug-and-Play)..."
echo "===================================================="
(sleep 1 && xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null) &
node backend/src/app.js
