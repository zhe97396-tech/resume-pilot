@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Resume Editor
echo ============================================
where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found in PATH. Please install Python 3 or add it to PATH.
  pause
  exit /b 1
)
python scripts\start_editor.py
echo.
echo Editor stopped. Press any key to close.
pause >nul
