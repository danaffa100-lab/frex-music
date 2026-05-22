require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { initSchema } = require('./db');
const { authMiddleware } = require('./auth');
const routes = require('./routes');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

const rootDir = path.join(__dirname, '..');
const indexHtml = path.join(rootDir, 'index.html');

const publicDir = path.join(rootDir, 'public');

app.use('/api', routes);
app.use('/uploads', express.static(path.join(rootDir, 'uploads')));
function staticDir(sub) {
  const inPublic = path.join(publicDir, sub);
  const inRoot = path.join(rootDir, sub);
  return [inPublic, inRoot].filter((p) => fs.existsSync(p));
}

for (const dir of ['css', 'js', 'assets']) {
  for (const folder of staticDir(dir)) {
    app.use(`/${dir}`, express.static(folder, { maxAge: '1d', fallthrough: true }));
  }
}
app.use(express.static(publicDir));
app.use(express.static(rootDir, { index: false }));

function isAssetPath(urlPath) {
  return /\.(css|js|svg|png|jpg|jpeg|webp|gif|ico|mp3|wav|ogg|map)$/i.test(urlPath);
}

app.get('/', (req, res) => {
  res.sendFile(indexHtml);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (isAssetPath(req.path)) {
    return res.status(404).type('text/plain').send('File not found');
  }
  res.sendFile(indexHtml);
});

async function seedAdmin() {
  const bcrypt = require('bcryptjs');
  const { query, toBoolInt } = require('./db');
  const hash = await bcrypt.hash('Danil.228', 10);
  const existing = await query('SELECT id FROM users WHERE username = $1', ['pax']);
  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO users (username, password_hash, is_admin, has_subscription) VALUES ($1, $2, $3, $4)`,
      ['pax', hash, toBoolInt(true), toBoolInt(true)]
    );
    const playlists = await query('SELECT id FROM playlists LIMIT 1');
    if (playlists.rows.length === 0) {
      const defaults = [
        ['Волна хитов', 'Топ треков Frex'],
        ['Река звуков', 'Плавные мелодии'],
        ['Жёлтое настроение', 'Энергия и ритм'],
        ['Ночной поток', 'Для вечернего прослушивания'],
      ];
      for (const [name, desc] of defaults) {
        await query('INSERT INTO playlists (name, description, is_public) VALUES ($1, $2, $3)', [
          name,
          desc,
          toBoolInt(true),
        ]);
      }
    }
    console.log('Создан админ: pax / Danil.228');
  }
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve({ server, port }));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(null);
      else reject(err);
    });
  });
}

async function start() {
  await initSchema();
  await seedAdmin();

  const basePort = Number(PORT) || 3000;
  const portLocked = Boolean(process.env.PORT);
  const attempts = portLocked ? 1 : 10;

  for (let i = 0; i < attempts; i++) {
    const port = basePort + i;
    const result = await listenOnPort(port);
    if (result) {
      if (i > 0) {
        console.log(`Порт ${basePort} занят — сайт открыт на порту ${port}`);
      }
      console.log(`Frex Music: http://localhost:${port}`);
      console.log('Админ: pax / Danil.228');
      return;
    }
  }

  console.error(`Не удалось запустить: порт ${basePort} (и следующие) заняты.`);
  console.error('Закройте старый сервер (Ctrl+C) или выполните:');
  console.error('  npx kill-port 3000');
  process.exit(1);
}

start().catch((e) => {
  console.error('Ошибка запуска:', e);
  process.exit(1);
});
