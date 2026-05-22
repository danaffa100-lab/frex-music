# Как выложить Frex Music на бесплатный хостинг с базой данных

Пошаговая инструкция для Windows. Всё ниже — **бесплатные** тарифы.

---

## Схема (что куда)

```
Ваш компьютер  →  GitHub (код)  →  Render (сайт)
                         ↓
                    Neon (база PostgreSQL)
```

- **Neon** — хранит пользователей, треки, плейлисты (бесплатно).
- **Render** — запускает сайт в интернете (бесплатно, засыпает без посетителей).
- **GitHub** — хранит файлы проекта.

> Загруженные mp3 на бесплатном Render могут **пропасть после перезапуска**. Для постоянного хранения музыки позже подключите [Supabase Storage](https://supabase.com) (тоже бесплатно). Для тестов обычно хватает Render.

---

## Часть 1. Подготовка на компьютере

### 1.1. Установите Git (если нет)

Скачайте: https://git-scm.com/download/win  
При установке оставьте настройки по умолчанию.

### 1.2. Проверьте, что сайт работает локально

```powershell
cd "C:\Users\danaf\Desktop\FrexМузыка"
npm install
npm run init-db
npm start
```

Откройте в браузере адрес из консоли (например `http://localhost:3000`).  
Войдите: **pax** / **Danil.228** → загрузите хотя бы один трек в **Админ**.

---

## Часть 2. GitHub (загрузить код)

### 2.1. Создайте репозиторий

1. Зайдите на https://github.com → войдите в аккаунт.
2. **+** → **New repository**.
3. Имя, например: `frex-music`.
4. **Create repository** (без галочки README, если проект уже есть локально).

### 2.2. Отправьте код

**Важно:** сначала перейдите в папку проекта командой `cd` (путь в кавычках сам по себе не работает):

```cmd
cd /d "C:\Users\danaf\Desktop\FrexМузыка"
```

Проверьте, что в строке cmd написано `FrexМузыка`, а не просто `C:\Users\danaf`.

Дальше — или запустите **`setup-git.bat`** в папке проекта, или вручную:

```cmd
cd /d "C:\Users\danaf\Desktop\FrexМузыка"
git init
git add .
git status
```

В `git status` должны быть только файлы сайта (без AppData). Затем:

```cmd
git commit -m "Frex Music — первый деплой"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/frex-music.git
git push -u origin main
```

Подробнее и если ошиблись с папкой: **[GIT-SETUP.md](./GIT-SETUP.md)**

При `git push` введите логин и **Personal Access Token** (не пароль от GitHub):  
**Settings → Developer settings → Personal access tokens → Generate**.

---

## Часть 3. База данных Neon (бесплатно)

1. Откройте https://neon.tech → **Sign Up** (можно через Google/GitHub).
2. **New Project** → имя `frex-music` → регион ближе к вам → **Create**.
3. На главной проекта найдите **Connection string** → вкладка **URI**.
4. Скопируйте строку целиком, например:

   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```

5. Сохраните в блокнот — это переменная **`DATABASE_URL`**.

Neon бесплатно даёт ~0.5 GB и не требует карты на старте.

---

## Часть 4. Render (запуск сайта)

> **Важно:** только **Web Service** (Node), **не Static Site**.  
> Static Site = белая страница без стилей и без музыки.

1. https://render.com → **Get Started** → войдите через GitHub.
2. **New +** → **Web Service**.
3. **Connect** ваш репозиторий `frex-music`.
4. Заполните поля:

   | Поле | Значение |
   |------|----------|
   | Name | `frex-music` |
   | Region | Frankfurt или ближайший |
   | Branch | `main` |
   | Runtime | **Node** |
   | Build Command | `npm install && npm run build && npm run init-db` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

5. Прокрутите до **Environment Variables** → **Add**:

   | Key | Value |
   |-----|--------|
   | `DATABASE_URL` | строка из Neon (шаг 3.4) |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | придумайте длинную случайную строку, например `frex_secret_2026_ваше_имя_случайные_цифры` |

6. **Create Web Service**.

7. Подождите 3–10 минут (статус **Live**).

8. Сверху будет ссылка вида:  
   `https://frex-music-xxxx.onrender.com` — это ваш сайт в интернете.

### Первый вход на хостинге

- Откройте URL сайта.
- **Войти** → `pax` / `Danil.228`
- **Админ** → снова загрузите треки (файлы с компьютера на сервер не переносятся автоматически).

---

## Часть 5. Обновление сайта после изменений

На компьютере:

```powershell
cd "C:\Users\danaf\Desktop\FrexМузыка"
git add .
git commit -m "Обновление"
git push
```

Render сам пересоберёт проект (2–5 минут).

---

## Альтернатива: Blueprint (render.yaml)

В проекте есть файл `render.yaml`:

1. Render → **New +** → **Blueprint**
2. Выберите репозиторий
3. Добавьте `DATABASE_URL` из Neon и `JWT_SECRET` вручную, если попросит

---

## «Бесконечный» бесплатный хостинг

**Вечного и полностью бесплатного** хостинга для Node + базы + mp3 **нет**. У всех есть лимиты.

| Вариант | Стоимость | Ограничения |
|---------|-----------|-------------|
| **Render + Neon** (эта инструкция) | 0 ₽ | Сайт «засыпает» без посетителей; музыка может слететь после перезапуска |
| **Oracle Cloud Always Free** | 0 ₽ навсегда | VPS 24/7, но сложная настройка Linux |
| **Свой ПК + Cloudflare Tunnel** | 0 ₽ | ПК должен быть включён |
| **GitHub Pages** | 0 ₽ | Только HTML — **не подходит** для Frex Music |

**Лучший баланс:** Render (сайт) + Neon (база). Позже для mp3 — Supabase Storage (бесплатный объём).

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Белая страница без дизайна | Создайте **Web Service**, не Static Site; Build: `npm install && npm run build && npm run init-db` |
| Сайт долго открывается | Бесплатный Render «просыпается» 30–60 сек после сна |
| Ошибка базы при сборке | Проверьте `DATABASE_URL`, в конце должно быть `?sslmode=require` |
| Музыка не играет | Загрузите треки через **Админ** уже на сайте в интернете |
| 502 Bad Gateway | Подождите окончания деплоя или смотрите **Logs** в Render |
| Порт занят локально | `npm run stop` затем `npm start` |

---

## Безопасность после публикации

1. Смените пароль админа (в `server/init-db.js` или через Neon SQL Editor).
2. Не публикуйте `JWT_SECRET` и `DATABASE_URL` в открытом доступе.
3. Файл `.env` не должен попадать в GitHub (он в `.gitignore`).

---

## Краткая шпаргалка

```text
1. GitHub  — код
2. Neon    — DATABASE_URL
3. Render  — Web Service + переменные + Deploy
4. Сайт    — https://ваш-сервис.onrender.com
5. Админ   — pax / Danil.228 → загрузка музыки
```
