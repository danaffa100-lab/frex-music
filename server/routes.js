const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { query, bool, toBoolInt } = require('./db');
const {
  signToken,
  requireAuth,
  requireAdmin,
  getUserById,
  canPlayFull,
  setAuthCookie,
  PREVIEW_SECONDS,
} = require('./auth');
const { uploadTrack } = require('./upload');

const router = express.Router();

router.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Логин от 3 символов, пароль от 6' });
    }
    const hash = await bcrypt.hash(password, 10);
    await query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
      [username.trim(), hash]
    );
    const user = (await query('SELECT * FROM users WHERE username = $1', [username.trim()])).rows[0];
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: bool(user.is_admin),
        hasSubscription: bool(user.has_subscription),
      },
    });
  } catch (e) {
    if (e.message?.includes('UNIQUE') || e.code === '23505' || e.message?.includes('unique')) {
      return res.status(409).json({ error: 'Имя пользователя занято' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await query('SELECT * FROM users WHERE username = $1', [username?.trim()]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (bool(user.is_blocked)) return res.status(403).json({ error: 'Аккаунт заблокирован' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: bool(user.is_admin),
        hasSubscription: bool(user.has_subscription),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/auth/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = await getUserById(req.user.id);
  if (!u || bool(u.is_blocked)) return res.json({ user: null });
  res.json({
    user: {
      id: u.id,
      username: u.username,
      isAdmin: bool(u.is_admin),
      hasSubscription: bool(u.has_subscription),
    },
  });
});

router.get('/tracks', async (req, res) => {
  const r = await query(
    `SELECT id, title, artist, audio_path, cover_path, created_at
     FROM tracks WHERE is_blocked = $1 ORDER BY created_at DESC`,
    [toBoolInt(false)]
  );
  res.json({
    tracks: r.rows.map(mapTrack),
    previewSeconds: PREVIEW_SECONDS,
  });
});

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

router.get('/my-wave', async (req, res) => {
  const full = req.user ? await canPlayFull(req.user.id) : false;
  const all = await query(
    `SELECT id, title, artist, audio_path, cover_path, created_at
     FROM tracks WHERE is_blocked = $1`,
    [toBoolInt(false)]
  );
  let pool = all.rows.map(mapTrack);

  if (req.user) {
    const u = await getUserById(req.user.id);
    if (u && (bool(u.has_subscription) || bool(u.is_admin))) {
      const my = await query(
        `SELECT t.id, t.title, t.artist, t.audio_path, t.cover_path, t.created_at
         FROM tracks t
         JOIN user_playlist up ON up.track_id = t.id
         WHERE up.user_id = $1 AND t.is_blocked = $2`,
        [req.user.id, toBoolInt(false)]
      );
      const myTracks = my.rows.map(mapTrack);
      const myIds = new Set(myTracks.map((t) => t.id));
      const rest = pool.filter((t) => !myIds.has(t.id));
      pool = [...shuffleArray(myTracks), ...shuffleArray(myTracks), ...shuffleArray(rest)];
    }
  }

  if (!pool.length) {
    return res.json({
      tracks: [],
      canPlayFull: full,
      previewSeconds: PREVIEW_SECONDS,
      message: 'Загрузите треки в админке — волна ожидает музыку',
    });
  }

  res.json({
    tracks: shuffleArray(pool),
    canPlayFull: full,
    previewSeconds: PREVIEW_SECONDS,
  });
});

router.get('/tracks/:id', async (req, res) => {
  const r = await query('SELECT * FROM tracks WHERE id = $1', [req.params.id]);
  const t = r.rows[0];
  if (!t || bool(t.is_blocked)) return res.status(404).json({ error: 'Трек не найден' });
  const full = req.user ? await canPlayFull(req.user.id) : false;
  res.json({
    track: mapTrack(t),
    canPlayFull: full,
    previewSeconds: PREVIEW_SECONDS,
  });
});

router.get('/playlists', async (req, res) => {
  const r = await query(
    `SELECT p.*, COUNT(pt.track_id) as track_count
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     WHERE p.is_public = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [toBoolInt(true)]
  );
  res.json({ playlists: r.rows.map(mapPlaylist) });
});

router.get('/playlists/:id', async (req, res) => {
  const p = (await query('SELECT * FROM playlists WHERE id = $1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Плейлист не найден' });
  const tracks = await query(
    `SELECT t.* FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE pt.playlist_id = $1 AND t.is_blocked = $2
     ORDER BY pt.position, pt.track_id`,
    [req.params.id, toBoolInt(false)]
  );
  const full = req.user ? await canPlayFull(req.user.id) : false;
  res.json({
    playlist: mapPlaylist(p),
    tracks: tracks.rows.map(mapTrack),
    canPlayFull: full,
    previewSeconds: PREVIEW_SECONDS,
  });
});

router.get('/my-playlist', requireAuth, async (req, res) => {
  const u = await getUserById(req.user.id);
  if (!bool(u.has_subscription) && !bool(u.is_admin)) {
    return res.status(403).json({
      error: 'Мой плейлист доступен только с подпиской',
      needsSubscription: true,
    });
  }
  const r = await query(
    `SELECT t.* FROM tracks t
     JOIN user_playlist up ON up.track_id = t.id
     WHERE up.user_id = $1 AND t.is_blocked = $2
     ORDER BY up.added_at DESC`,
    [req.user.id, toBoolInt(false)]
  );
  res.json({ tracks: r.rows.map(mapTrack) });
});

router.post('/my-playlist/:trackId', requireAuth, async (req, res) => {
  const u = await getUserById(req.user.id);
  if (!bool(u.has_subscription) && !bool(u.is_admin)) {
    return res.status(403).json({ error: 'Нужна подписка', needsSubscription: true });
  }
  const trackId = req.params.trackId;
  const t = (await query('SELECT id FROM tracks WHERE id = $1 AND is_blocked = $2', [
    trackId,
    toBoolInt(false),
  ])).rows[0];
  if (!t) return res.status(404).json({ error: 'Трек не найден' });
  try {
    await query('INSERT INTO user_playlist (user_id, track_id) VALUES ($1, $2)', [
      req.user.id,
      trackId,
    ]);
  } catch {
    /* already in playlist */
  }
  res.json({ ok: true });
});

router.delete('/my-playlist/:trackId', requireAuth, async (req, res) => {
  await query('DELETE FROM user_playlist WHERE user_id = $1 AND track_id = $2', [
    req.user.id,
    req.params.trackId,
  ]);
  res.json({ ok: true });
});

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function luhnCheck(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

router.post('/subscription/checkout', requireAuth, async (req, res) => {
  try {
    const { fullName, email, cardNumber, expiry, cvc, agreeTerms } = req.body;
    const u = await getUserById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Войдите в аккаунт' });
    if (bool(u.has_subscription)) {
      return res.status(400).json({ error: 'Подписка уже оформлена' });
    }

    if (!agreeTerms) {
      return res.status(400).json({ error: 'Подтвердите условия подписки' });
    }
    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Укажите имя и фамилию' });
    }
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Укажите корректный email' });
    }

    const card = digitsOnly(cardNumber);
    if (card.length !== 16 || !luhnCheck(card)) {
      return res.status(400).json({ error: 'Номер карты неверный (16 цифр)' });
    }

    const exp = String(expiry || '').trim();
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) {
      return res.status(400).json({ error: 'Срок: формат MM/YY' });
    }
    const [mm, yy] = exp.split('/').map(Number);
    const now = new Date();
    const expDate = new Date(2000 + yy, mm, 0);
    if (expDate < now) {
      return res.status(400).json({ error: 'Срок действия карты истёк' });
    }

    const cvcDigits = digitsOnly(cvc);
    if (cvcDigits.length !== 3) {
      return res.status(400).json({ error: 'CVC: 3 цифры' });
    }

    const planName = 'Frex Plus — 1 месяц';
    const amount = 299;

    await query(
      `INSERT INTO subscription_orders (user_id, plan_name, amount, payer_name, payer_email, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, planName, amount, fullName.trim(), emailNorm, 'completed']
    );
    await query('UPDATE users SET has_subscription = $1 WHERE id = $2', [
      toBoolInt(true),
      req.user.id,
    ]);

    res.json({ ok: true, message: 'Подписка Frex Plus оформлена' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/subscription/buy', requireAuth, async (req, res) => {
  res.status(403).json({
    error: 'Оформите подписку через форму оплаты',
    needsCheckout: true,
  });
});

// ——— Admin ———

router.get('/admin/stats', requireAdmin, async (req, res) => {
  const users = (await query('SELECT COUNT(*) as c FROM users')).rows[0];
  const tracks = (await query('SELECT COUNT(*) as c FROM tracks')).rows[0];
  const subs = (await query('SELECT COUNT(*) as c FROM users WHERE has_subscription = $1', [
    toBoolInt(true),
  ])).rows[0];
  res.json({
    users: Number(users.c || users.count || 0),
    tracks: Number(tracks.c || tracks.count || 0),
    subscriptions: Number(subs.c || subs.count || 0),
  });
});

router.get('/admin/users', requireAdmin, async (req, res) => {
  const r = await query(
    'SELECT id, username, is_admin, is_blocked, has_subscription, created_at FROM users ORDER BY id'
  );
  res.json({
    users: r.rows.map((u) => ({
      id: u.id,
      username: u.username,
      isAdmin: bool(u.is_admin),
      isBlocked: bool(u.is_blocked),
      hasSubscription: bool(u.has_subscription),
      createdAt: u.created_at,
    })),
  });
});

router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
  const { isBlocked, hasSubscription } = req.body;
  const id = req.params.id;
  const u = (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
  if (bool(u.is_admin) && isBlocked) {
    return res.status(400).json({ error: 'Нельзя заблокировать администратора' });
  }
  if (isBlocked !== undefined) {
    await query('UPDATE users SET is_blocked = $1 WHERE id = $2', [toBoolInt(isBlocked), id]);
  }
  if (hasSubscription !== undefined) {
    await query('UPDATE users SET has_subscription = $1 WHERE id = $2', [
      toBoolInt(hasSubscription),
      id,
    ]);
  }
  res.json({ ok: true });
});

router.get('/admin/tracks', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM tracks ORDER BY created_at DESC');
  res.json({ tracks: r.rows.map((t) => ({ ...mapTrack(t), isBlocked: bool(t.is_blocked) })) });
});

router.post('/admin/tracks', requireAdmin, (req, res) => {
  uploadTrack(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { title, artist, playlistId } = req.body;
      if (!title) return res.status(400).json({ error: 'Укажите название' });
      if (!req.files?.audio?.[0]) return res.status(400).json({ error: 'Загрузите аудиофайл' });
      const audioPath = `/uploads/audio/${req.files.audio[0].filename}`;
      const coverPath = req.files.cover?.[0]
        ? `/uploads/covers/${req.files.cover[0].filename}`
        : null;
      const ins = await query(
        `INSERT INTO tracks (title, artist, audio_path, cover_path) VALUES ($1, $2, $3, $4) RETURNING id`,
        [title, artist || 'Frex Artist', audioPath, coverPath]
      );
      const trackId = ins.lastInsertRowid || ins.rows[0]?.id;
      if (playlistId) {
        const pos = (
          await query('SELECT COUNT(*) as c FROM playlist_tracks WHERE playlist_id = $1', [
            playlistId,
          ])
        ).rows[0];
        const position = Number(pos.c || pos.count || 0);
        await query(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)',
          [playlistId, trackId, position]
        );
      }
      res.json({ ok: true, trackId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

router.patch('/admin/tracks/:id', requireAdmin, async (req, res) => {
  const { isBlocked, title, artist } = req.body;
  const id = req.params.id;
  if (isBlocked !== undefined) {
    await query('UPDATE tracks SET is_blocked = $1 WHERE id = $2', [toBoolInt(isBlocked), id]);
  }
  if (title) await query('UPDATE tracks SET title = $1 WHERE id = $2', [title, id]);
  if (artist) await query('UPDATE tracks SET artist = $1 WHERE id = $2', [artist, id]);
  res.json({ ok: true });
});

router.delete('/admin/tracks/:id', requireAdmin, async (req, res) => {
  const t = (await query('SELECT * FROM tracks WHERE id = $1', [req.params.id])).rows[0];
  if (t) {
    tryDeleteFile(t.audio_path);
    tryDeleteFile(t.cover_path);
  }
  await query('DELETE FROM tracks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/admin/playlists', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM playlists ORDER BY id');
  res.json({ playlists: r.rows.map(mapPlaylist) });
});

router.post('/admin/playlists/:playlistId/tracks/:trackId', requireAdmin, async (req, res) => {
  const { playlistId, trackId } = req.params;
  const pos = (
    await query('SELECT COUNT(*) as c FROM playlist_tracks WHERE playlist_id = $1', [playlistId])
  ).rows[0];
  await query(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)',
    [playlistId, trackId, Number(pos.c || pos.count || 0)]
  );
  res.json({ ok: true });
});

function mapTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    audioUrl: t.audio_path,
    coverUrl: t.cover_path || '/assets/default-cover.svg',
    createdAt: t.created_at,
  };
}

function mapPlaylist(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    coverUrl: p.cover_path || '/assets/default-playlist.svg',
    trackCount: Number(p.track_count || 0),
  };
}

function tryDeleteFile(urlPath) {
  if (!urlPath) return;
  const full = path.join(__dirname, '..', urlPath.replace(/^\//, ''));
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

module.exports = router;
