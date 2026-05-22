# Как загрузить новые файлы на GitHub и Render

Каждый раз, когда в проекте что-то изменилось, сделайте эти шаги.

---

## Шаг 1. Откройте папку проекта

В **PowerShell** или **cmd**:

```cmd
cd /d "C:\Users\danaf\Desktop\FrexМузыка"
```

Должно быть: `C:\Users\danaf\Desktop\FrexМузыка>`

---

## Шаг 2. Отправьте изменения на GitHub

```cmd
git add .
git status
git commit -m "Описание изменений"
git push
```

Пример сообщения: `git commit -m "Оформление подписки через форму"`

Если `git commit` ругается на имя — один раз:

```cmd
git config --global user.name "Danil"
git config --global user.email "ваш@email.com"
```

---

## Шаг 3. Render пересоберёт сайт сам

1. Зайдите на https://dashboard.render.com  
2. Откройте сервис **frex-music**  
3. Вкладка **Events** или **Logs** — статус **Building** → **Live** (2–5 минут)  
4. Откройте ссылку сайта (кнопка вверху)

**Build Command** на Render должен быть:

```text
npm install && npm run build && npm run init-db
```

**Start Command:** `npm start`

---

## Шаг 4. Проверка

- Сайт с жёлтым дизайном (не белая простыня)  
- **Оформить подписку** открывает форму (имя, email, карта) — не активируется одной кнопкой  
- Админ: **pax** / **Danil.228**

---

## Если push не работает

```cmd
git remote -v
```

Должно быть: `https://github.com/danaffa100-lab/frex-music.git`

---

## Только локально (без интернета)

```cmd
npm install
npm run build
npm run init-db
npm start
```

Откройте адрес из консоли (например http://localhost:3000).
