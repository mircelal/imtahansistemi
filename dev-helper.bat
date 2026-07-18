@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title İmtahan sistemi — dev köməkçi

pushd "%~dp0"

set "COMPOSE=docker compose -f docker-compose.yml -f docker-compose.dev.yml"
set "FRONTEND_PORT=3002"

if exist ".env" (
  for /f "usebackq eol=# tokens=2 delims==" %%a in (`findstr /b /i "FRONTEND_HOST_PORT=" .env 2^>nul`) do (
    set "FRONTEND_PORT=%%a"
  )
)
for /f "tokens=1 delims= " %%p in ("%FRONTEND_PORT%") do set "FRONTEND_PORT=%%p"

where docker >nul 2>&1
if errorlevel 1 (
  echo [XETA] Docker tapilmadi. Docker Desktop aciq olmalidir.
  pause
  popd
  exit /b 1
)

:menu
cls
echo.
echo  ============================================
echo   Imtahan sistemi — dev komekci
echo  ============================================
echo   Qovluq: %CD%
echo   Frontend: http://127.0.0.1:%FRONTEND_PORT%  (localhost yox — Laragon)
echo   API:      http://127.0.0.1:8000/docs
echo   OMR:      http://127.0.0.1:8001/docs
echo  --------------------------------------------
echo   1. Sistemi baslat (dev, arxa planda)
echo   2. Sistemi yeniden baslat (rebuild)
echo   3. Sistemi dayandir
echo   4. Veziyyet (status)
echo   5. Loglar (frontend + backend, canli)
echo   6. Admin paneli ac (brauzer)
echo   0. Cixis
echo  ============================================
echo.
set "CHOICE="
set /p CHOICE=Seciminiz (0-6): 

if "%CHOICE%"=="1" goto start
if "%CHOICE%"=="2" goto restart
if "%CHOICE%"=="3" goto stop
if "%CHOICE%"=="4" goto status
if "%CHOICE%"=="5" goto logs
if "%CHOICE%"=="6" goto open_ui
if "%CHOICE%"=="0" goto end
goto menu

:start
echo.
echo [*] Konteynerler basladilir (dev)...
%COMPOSE% up --build -d
if errorlevel 1 (
  echo [XETA] Baslatma ugursuz oldu.
  pause
  goto menu
)
call :wait_ready
echo.
echo [OK] Sistem hazirdir.
echo      Admin: http://127.0.0.1:%FRONTEND_PORT%
pause
goto menu

:restart
echo.
echo [*] Sistem dayandirilir...
%COMPOSE% down
echo [*] Yeniden qurulur ve basladilir...
%COMPOSE% up --build -d
if errorlevel 1 (
  echo [XETA] Restart ugursuz oldu.
  pause
  goto menu
)
call :wait_ready
echo.
echo [OK] Restart tamamlandi.
pause
goto menu

:stop
echo.
echo [*] Sistem dayandirilir...
%COMPOSE% down
echo [OK] Dayandirildi.
pause
goto menu

:status
echo.
%COMPOSE% ps
echo.
curl.exe -s -o NUL -w "Frontend HTTP: %%{http_code}\n" "http://127.0.0.1:%FRONTEND_PORT%/" 2>nul
curl.exe -s -o NUL -w "Backend HTTP:  %%{http_code}\n" "http://127.0.0.1:8000/docs" 2>nul
curl.exe -s -o NUL -w "OMR HTTP:      %%{http_code}\n" "http://127.0.0.1:8001/docs" 2>nul
pause
goto menu

:logs
echo.
echo [*] Loglar (Ctrl+C ile cixis)...
%COMPOSE% logs -f --tail=80 frontend backend
goto menu

:open_ui
start "" "http://127.0.0.1:%FRONTEND_PORT%/"
goto menu

:wait_ready
echo [*] Servisler gozlenilir (max ~90 san)...
set /a N=0
:wait_loop
set /a N+=1
if %N% GTR 45 goto wait_done
curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:8000/docs" 2>nul | findstr /r "^200$" >nul
if not errorlevel 1 (
  curl.exe -s -o NUL -w "%%{http_code}" "http://127.0.0.1:%FRONTEND_PORT%/" 2>nul | findstr /r "^200$" >nul
  if not errorlevel 1 goto wait_done
)
timeout /t 2 /nobreak >nul
goto wait_loop
:wait_done
exit /b 0

:end
popd
endlocal
exit /b 0
