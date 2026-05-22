@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Frex Music: настройка Git ===
echo Папка: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ОШИБКА: Git не установлен. Скачайте: https://git-scm.com/download/win
  pause
  exit /b 1
)

git config user.name >nul 2>&1
if errorlevel 1 (
  echo.
  echo Сначала укажите имя и email для Git ^(один раз^):
  echo   git config --global user.name "Ваше Имя"
  echo   git config --global user.email "ваш@email.com"
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  git init
  echo Создан репозиторий в папке проекта.
) else (
  echo Репозиторий .git уже есть в проекте.
)

git add .
echo.
echo --- Список файлов для коммита ---
git status
echo.
set /p OK="Всё верно? Только файлы Frex Music? (y/n): "
if /i not "%OK%"=="y" (
  echo Отменено. Исправьте и запустите снова.
  pause
  exit /b 0
)

git commit -m "Frex Music"
echo.
echo Готово! Дальше на GitHub создайте репозиторий frex-music и выполните:
echo   git remote add origin https://github.com/ВАШ_ЛОГИН/frex-music.git
echo   git push -u origin main
echo.
pause
