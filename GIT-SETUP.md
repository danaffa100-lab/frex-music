# Git — правильные команды (Windows)

## Что пошло не так

1. `"C:\Users\danaf\Desktop\FrexМузыка"` — **это не команда**. Нужно **`cd`**:
   ```cmd
   cd /d "C:\Users\danaf\Desktop\FrexМузыка"
   ```

2. Вы запустили `git init` в папке **`C:\Users\danaf`** (домашняя), а не в проекте.  
   Поэтому `git add .` пытался добавить весь компьютер (AppData, Python, Android…).

---

## Срочно: если ещё НЕ делали `git commit` в `C:\Users\danaf`

Откройте cmd и выполните **только если вы в домашней папке**:

```cmd
cd /d C:\Users\danaf
git reset
```

Это снимет файлы с подготовки к коммиту. **Не делайте** `git commit` в домашней папке.

---

## Правильно: Git только для Frex Music

Скопируйте и выполните **по одной строке**:

```cmd
cd /d "C:\Users\danaf\Desktop\FrexМузыка"
git init
git add .
git status
```

В `git status` должны быть только файлы проекта (`index.html`, `server`, `public`, `package.json`…), **без** AppData и `.android`.

Если всё верно:

```cmd
git commit -m "Frex Music"
```

Подключение к GitHub (замените `ВАШ_ЛОГИН`):

```cmd
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/frex-music.git
git push -u origin main
```

---

## Быстрый способ

Дважды щёлкните файл **`setup-git.bat`** в папке проекта — он сам перейдёт в нужную папку и инициализирует Git.

---

## Проверка

Вы в нужной папке, если в cmd видно:

```text
C:\Users\danaf\Desktop\FrexМузыка>
```

Перед каждой командой `git` должна быть именно эта строка.
