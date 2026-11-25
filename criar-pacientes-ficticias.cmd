@echo off
REM Apaga e recria as pacientes ficticias (Maria + 8).
cd /d "%~dp0"
set "PATH=C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation;C:\Users\isabe\AppData\Roaming\npm;%PATH%"
call "C:\Users\isabe\AppData\Roaming\fnm\node-versions\v22.22.3\installation\pnpm.CMD" run seed:triagem
echo.
echo Pronto. Abra http://localhost:5173 e entre com dev@example.com
pause