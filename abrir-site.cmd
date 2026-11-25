@echo off
REM Liga o site da triagem (Convex + Vite). Deixe esta janela aberta. Para desligar: Ctrl + C.
cd /d "%~dp0"
set "PATH=C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation;C:\Users\isabe\AppData\Roaming\npm;%PATH%"
set COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if not exist "C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation\pnpm.CMD" (
  echo ERRO: nao encontrei o pnpm em C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation
  pause
  exit /b 1
)
echo Instalando dependencias...
call "C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation\pnpm.CMD" install
echo.
echo Ligando o site... quando aparecer "VITE ready", abra http://localhost:5173
call "C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation\pnpm.CMD" run dev:all
pause