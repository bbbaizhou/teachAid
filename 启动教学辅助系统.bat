@echo off
chcp 65001 >nul
title 高数教学辅助系统
echo ==========================================
echo   🎓 高数教学辅助系统 正在启动...
echo ==========================================
cd /d "%~dp0server"
if not exist node_modules (
  echo [首次运行] 正在安装后端依赖，请稍候...
  call npm install --no-audit --no-fund
)
echo [启动] 后端服务: http://localhost:3001
start "" http://localhost:3001
node src/index.js
pause
