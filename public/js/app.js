const API = '/api';
const PREVIEW_DEFAULT = 20;

const state = {
  user: null,
  tracks: [],
  playlists: [],
  queue: [],
  queueIndex: -1,
  canPlayFull: false,
  previewSeconds: PREVIEW_DEFAULT,
  currentTrack: null,
  waveMode: false,
  waveQueue: [],
};

const audio = document.getElementById('audio');
const toastEl = document.getElementById('toast');

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ——— Auth ———

let authTab = 'login';

document.querySelectorAll('.modal .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    authTab = tab.dataset.tab;
  });
});

document.getElementById('btn-auth').addEventListener('click', () => {
  document.getElementById('auth-modal').classList.add('open');
});

document.getElementById('auth-modal').addEventListener('click', (e) => {
  if (e.target.id === 'auth-modal') document.getElementById('auth-modal').classList.remove('open');
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = fd.get('username');
  const password = fd.get('password');
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  try {
    const path = authTab === 'login' ? '/auth/login' : '/auth/register';
    const { user } = await api(path, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.user = user;
    document.getElementById('auth-modal').classList.remove('open');
    updateUserUI();
    showToast(`Добро пожаловать, ${user.username}!`);
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  state.canPlayFull = false;
  updateUserUI();
  showToast('Вы вышли из аккаунта');
  await loadAll();
});

document.getElementById('btn-buy-sub').addEventListener('click', async () => {
  if (!state.user) {
    document.getElementById('auth-modal').classList.add('open');
    return;
  }
  try {
    await api('/subscription/buy', { method: 'POST' });
    const me = await api('/auth/me');
    state.user = me.user;
    updateUserUI();
    showToast('Подписка активирована!');
  } catch (e) {
    showToast(e.message);
  }
});

function updateUserUI() {
  const badge = document.getElementById('user-badge');
  const btnAuth = document.getElementById('btn-auth');
  const btnLogout = document.getElementById('btn-logout');
  const subBanner = document.getElementById('sub-banner');
  const navAdmin = document.getElementById('nav-admin');

  if (state.user) {
    badge.textContent = state.user.username;
    badge.classList.toggle('subscribed', state.user.hasSubscription || state.user.isAdmin);
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    navAdmin.classList.toggle('hidden', !state.user.isAdmin);
    subBanner.classList.toggle(
      'hidden',
      state.user.hasSubscription || state.user.isAdmin
    );
  } else {
    badge.textContent = 'Гость — превью 20 сек';
    badge.classList.remove('subscribed');
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    navAdmin.classList.add('hidden');
    subBanner.classList.remove('hidden');
  }
}

// ——— Navigation ———

document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    if (page === 'my-playlist' && state.user && !state.user.hasSubscription && !state.user.isAdmin) {
      showToast('Мой плейлист доступен с подпиской');
      document.getElementById('sub-banner')?.scrollIntoView?.({ behavior: 'smooth' });
      return;
    }
    showPage(page);
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    btn.classList.add('active');
    if (page === 'my-playlist') loadMyPlaylist();
    if (page === 'my-wave') loadMyWave(false);
    if (page === 'admin') loadAdmin();
  });
});

document.getElementById('btn-home-wave')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openMyWavePage(true);
});

document.getElementById('home-wave-banner')?.addEventListener('click', () => {
  openMyWavePage(true);
});

function openMyWavePage(autoplay) {
  const btn = document.querySelector('.nav-item[data-page="my-wave"]');
  showPage('my-wave');
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  btn?.classList.add('active');
  loadMyWave(autoplay);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.remove('active');
    p.style.display = '';
  });
  const detail = document.getElementById('page-playlist-detail');
  detail.style.display = 'none';

  const el = document.getElementById(`page-${name}`);
  if (el) {
    el.classList.add('active');
    el.style.display = 'block';
  }
}

// ——— Render ———

function renderPlaylists(containerId, playlists, onClick) {
  const el = document.getElementById(containerId);
  if (!playlists.length) {
    el.innerHTML = '<div class="empty-state"><p>Плейлисты появятся после загрузки треков</p></div>';
    return;
  }
  el.innerHTML = playlists
    .map(
      (p, i) => `
    <div class="card" style="animation-delay:${i * 0.05}s" data-id="${p.id}">
      <img class="card-cover" src="${p.coverUrl}" alt="">
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description || '')} · ${p.trackCount || 0} треков</p>
    </div>`
    )
    .join('');
  el.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => onClick(Number(card.dataset.id)));
  });
}

function renderTrackList(containerId, tracks, queueRef) {
  const el = document.getElementById(containerId);
  if (!tracks.length) {
    el.innerHTML = '<div class="empty-state"><p>Треков пока нет. Админ может загрузить музыку.</p></div>';
    return;
  }
  el.innerHTML = tracks
    .map(
      (t, i) => `
    <div class="track-row" data-id="${t.id}" style="animation-delay:${i * 0.03}s">
      <span class="track-num">${i + 1}</span>
      <img class="track-cover-sm" src="${t.coverUrl}" alt="">
      <div>
        <div class="track-title">${escapeHtml(t.title)}</div>
        <div class="track-artist">${escapeHtml(t.artist)}</div>
      </div>
      <div class="track-artist">${escapeHtml(t.artist)}</div>
      <button class="play-btn-icon" data-play="${t.id}">▶</button>
      ${state.user && (state.user.hasSubscription || state.user.isAdmin) ? `<button class="btn btn-sm btn-outline" data-add="${t.id}">+</button>` : '<span></span>'}
    </div>`
    )
    .join('');

  const q = queueRef || tracks;
  el.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.play);
      playFromQueue(q, q.findIndex((x) => x.id === id));
    });
  });
  el.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      playFromQueue(q, q.findIndex((x) => x.id === id));
    });
  });
  el.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api(`/my-playlist/${btn.dataset.add}`, { method: 'POST' });
        showToast('Добавлено в мой плейлист');
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

async function openPlaylist(id) {
  const data = await api(`/playlists/${id}`);
  state.canPlayFull = data.canPlayFull;
  state.previewSeconds = data.previewSeconds || PREVIEW_DEFAULT;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const detail = document.getElementById('page-playlist-detail');
  detail.style.display = 'block';
  detail.classList.add('active');
  document.getElementById('playlist-detail-header').innerHTML = `
    <h1>${escapeHtml(data.playlist.name)}</h1>
    <p>${escapeHtml(data.playlist.description || '')}</p>`;
  renderTrackList('playlist-tracks', data.tracks, data.tracks);
}

// ——— Player ———

function getMaxPlayTime() {
  if (state.canPlayFull || state.user?.isAdmin || state.user?.hasSubscription) {
    return audio.duration || Infinity;
  }
  return state.previewSeconds || PREVIEW_DEFAULT;
}

async function playTrack(track, canPlayFull) {
  state.currentTrack = track;
  state.canPlayFull = canPlayFull ?? state.canPlayFull;
  updateWaveDisc();
  audio.src = track.audioUrl;
  document.getElementById('player-cover').src = track.coverUrl;
  document.getElementById('player-title').textContent = track.title;
  document.getElementById('player-artist').textContent = track.artist;
  document.getElementById('preview-badge').classList.toggle(
    'hidden',
    state.canPlayFull || state.user?.hasSubscription || state.user?.isAdmin
  );
  document.querySelectorAll('.track-row').forEach((r) => {
    r.classList.toggle('playing', Number(r.dataset.id) === track.id);
  });
  try {
    await audio.play();
    document.getElementById('btn-play').textContent = '⏸';
  } catch {
    showToast('Нажмите play для воспроизведения');
  }
}

function playFromQueue(queue, index) {
  if (index < 0 || !queue.length) return;
  state.queue = queue;
  state.queueIndex = index;
  if (queue === state.waveQueue) state.waveMode = true;
  playTrack(queue[index], state.canPlayFull);
}

document.getElementById('btn-play').addEventListener('click', () => {
  if (audio.paused) {
    if (state.currentTrack) audio.play();
    else showToast('Выберите трек');
    document.getElementById('btn-play').textContent = '⏸';
  } else {
    audio.pause();
    document.getElementById('btn-play').textContent = '▶';
  }
});

document.getElementById('btn-prev').addEventListener('click', () => {
  if (state.queueIndex > 0) playFromQueue(state.queue, state.queueIndex - 1);
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (state.queueIndex < state.queue.length - 1) playFromQueue(state.queue, state.queueIndex + 1);
});

audio.addEventListener('ended', () => {
  if (state.waveMode && state.waveQueue.length) {
    playNextWave();
  }
});

audio.addEventListener('timeupdate', () => {
  const max = getMaxPlayTime();
  if (audio.currentTime >= max && isFinite(max)) {
    if (state.waveMode && state.waveQueue.length) {
      playNextWave();
      if (!state.canPlayFull && !state.user?.hasSubscription && !state.user?.isAdmin) {
        showToast(`Превью ${state.previewSeconds} сек — следующий трек`);
      }
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    document.getElementById('btn-play').textContent = '▶';
    showToast(`Превью ${state.previewSeconds} сек — оформите подписку для полного трека`);
  }
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('time-current').textContent = formatTime(audio.currentTime);
  document.getElementById('time-total').textContent = formatTime(
    state.canPlayFull || state.user?.hasSubscription ? audio.duration : Math.min(max, audio.duration || max)
  );
});

document.getElementById('progress-bar').addEventListener('click', (e) => {
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const max = getMaxPlayTime();
  audio.currentTime = Math.min(pct * audio.duration, isFinite(max) ? max : audio.duration);
});

document.getElementById('volume').addEventListener('input', (e) => {
  audio.volume = e.target.value / 100;
});

audio.volume = 0.8;

// ——— Data ———

async function loadAll() {
  try {
    const me = await api('/auth/me');
    state.user = me.user;
    updateUserUI();
  } catch {
    state.user = null;
  }

  const { tracks, previewSeconds } = await api('/tracks');
  state.tracks = tracks;
  state.previewSeconds = previewSeconds || PREVIEW_DEFAULT;
  state.canPlayFull = state.user?.hasSubscription || state.user?.isAdmin || false;

  const { playlists } = await api('/playlists');
  state.playlists = playlists;

  renderPlaylists('home-playlists', playlists.slice(0, 4), openPlaylist);
  renderPlaylists('all-playlists', playlists, openPlaylist);
  renderTrackList('home-tracks', tracks.slice(0, 8), tracks);
  renderTrackList('all-tracks', tracks, tracks);
}

function updateWaveDisc() {
  const disc = document.getElementById('wave-disc');
  const cover = document.getElementById('wave-disc-cover');
  const now = document.getElementById('wave-now');
  if (!disc || !cover) return;
  if (state.currentTrack && state.waveMode) {
    cover.src = state.currentTrack.coverUrl;
    disc.classList.add('playing');
    if (now) now.textContent = `${state.currentTrack.title} — ${state.currentTrack.artist}`;
  } else {
    disc.classList.remove('playing');
  }
}

function playNextWave() {
  if (!state.waveQueue.length) return;
  const next = state.queueIndex < 0 ? 0 : (state.queueIndex + 1) % state.waveQueue.length;
  state.waveMode = true;
  playFromQueue(state.waveQueue, next);
  document.getElementById('btn-start-wave').textContent = '⏸';
}

async function loadMyWave(autoplay) {
  state.waveMode = true;
  try {
    const data = await api('/my-wave');
    state.canPlayFull = data.canPlayFull;
    state.previewSeconds = data.previewSeconds || PREVIEW_DEFAULT;
    state.waveQueue = data.tracks || [];
    const status = document.getElementById('wave-status');
    if (!state.waveQueue.length) {
      status.textContent = data.message || 'Нет треков — админ должен загрузить музыку';
      document.getElementById('wave-queue').innerHTML =
        '<div class="empty-state"><p>Добавьте треки в админ-панели</p></div>';
      return;
    }
    if (state.user?.hasSubscription || state.user?.isAdmin) {
      status.textContent = 'Волна учитывает ваш «Мой плейлист» и все треки';
    } else if (state.user) {
      status.textContent = 'Слушайте поток — по 20 сек на трек без подписки';
    } else {
      status.textContent = 'Войдите для персональной волны · сейчас все треки подряд';
    }
    renderTrackList('wave-queue', state.waveQueue, state.waveQueue);
    if (autoplay) playNextWave();
  } catch (e) {
    showToast(e.message);
  }
}

document.getElementById('btn-start-wave')?.addEventListener('click', () => {
  if (!state.waveQueue.length) {
    loadMyWave(true);
    return;
  }
  if (audio.paused) {
    if (state.currentTrack) audio.play();
    else playNextWave();
    document.getElementById('btn-start-wave').textContent = '⏸';
  } else {
    audio.pause();
    state.waveMode = false;
    document.getElementById('btn-start-wave').textContent = '▶';
    document.getElementById('wave-disc')?.classList.remove('playing');
  }
});

document.getElementById('btn-wave-next')?.addEventListener('click', () => {
  if (!state.waveQueue.length) loadMyWave(true);
  else playNextWave();
});

document.getElementById('btn-wave-dislike')?.addEventListener('click', () => {
  if (!state.waveQueue.length) return;
  playNextWave();
  showToast('Пропущено');
});

async function loadMyPlaylist() {
  const el = document.getElementById('my-playlist-content');
  try {
    const { tracks } = await api('/my-playlist');
    renderTrackList('my-playlist-content', tracks, tracks);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${escapeHtml(e.message)}</p>
      <button class="btn btn-yellow" style="margin-top:16px" onclick="document.getElementById('btn-buy-sub').click()">Оформить подписку</button></div>`;
  }
}

// ——— Admin ———

async function loadAdmin() {
  if (!state.user?.isAdmin) return;
  const stats = await api('/admin/stats');
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="num">${stats.users}</div><div>Пользователей</div></div>
    <div class="stat-card"><div class="num">${stats.tracks}</div><div>Треков</div></div>
    <div class="stat-card"><div class="num">${stats.subscriptions}</div><div>Подписок</div></div>`;

  const { playlists } = await api('/admin/playlists');
  const sel = document.getElementById('upload-playlist-select');
  sel.innerHTML = '<option value="">— без плейлиста —</option>' +
    playlists.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  const { tracks } = await api('/admin/tracks');
  document.getElementById('admin-tracks-tbody').innerHTML = tracks
    .map(
      (t) => `
    <tr>
      <td>${t.id}</td>
      <td>${escapeHtml(t.title)} — ${escapeHtml(t.artist)}</td>
      <td>${t.isBlocked ? '<span class="tag tag-red">Заблокирован</span>' : '<span class="tag tag-green">Активен</span>'}</td>
      <td>
        <button class="btn btn-sm btn-outline" data-block-track="${t.id}" data-blocked="${t.isBlocked}">${t.isBlocked ? 'Разблок.' : 'Блок.'}</button>
        <button class="btn btn-sm btn-outline" data-del-track="${t.id}">Удалить</button>
      </td>
    </tr>`
    )
    .join('');

  const { users } = await api('/admin/users');
  document.getElementById('admin-users-tbody').innerHTML = users
    .map(
      (u) => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.username)} ${u.isAdmin ? '<span class="tag tag-yellow">admin</span>' : ''}</td>
      <td>${u.hasSubscription ? '<span class="tag tag-green">Да</span>' : 'Нет'}</td>
      <td>${u.isBlocked ? '<span class="tag tag-red">Блок</span>' : '<span class="tag tag-green">OK</span>'}</td>
      <td>
        ${!u.isAdmin ? `<button class="btn btn-sm btn-outline" data-sub-user="${u.id}" data-has="${u.hasSubscription}">${u.hasSubscription ? 'Снять подписку' : 'Выдать подписку'}</button>
        <button class="btn btn-sm btn-outline" data-block-user="${u.id}" data-blocked="${u.isBlocked}">${u.isBlocked ? 'Разблок.' : 'Блок.'}</button>` : '—'}
      </td>
    </tr>`
    )
    .join('');

  bindAdminActions();
}

function bindAdminActions() {
  document.querySelectorAll('[data-block-track]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.blockTrack;
      const blocked = btn.dataset.blocked === 'true';
      await api(`/admin/tracks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isBlocked: !blocked }),
      });
      loadAdmin();
      loadAll();
      showToast(blocked ? 'Трек разблокирован' : 'Трек заблокирован');
    };
  });
  document.querySelectorAll('[data-del-track]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Удалить трек?')) return;
      await api(`/admin/tracks/${btn.dataset.delTrack}`, { method: 'DELETE' });
      loadAdmin();
      loadAll();
      showToast('Трек удалён');
    };
  });
  document.querySelectorAll('[data-sub-user]').forEach((btn) => {
    btn.onclick = async () => {
      const has = btn.dataset.has === 'true';
      await api(`/admin/users/${btn.dataset.subUser}`, {
        method: 'PATCH',
        body: JSON.stringify({ hasSubscription: !has }),
      });
      loadAdmin();
      showToast(has ? 'Подписка снята' : 'Подписка выдана');
    };
  });
  document.querySelectorAll('[data-block-user]').forEach((btn) => {
    btn.onclick = async () => {
      const blocked = btn.dataset.blocked === 'true';
      await api(`/admin/users/${btn.dataset.blockUser}`, {
        method: 'PATCH',
        body: JSON.stringify({ isBlocked: !blocked }),
      });
      loadAdmin();
      showToast(blocked ? 'Пользователь разблокирован' : 'Пользователь заблокирован');
    };
  });
}

document.getElementById('audio-file').addEventListener('change', (e) => {
  document.getElementById('audio-label').textContent = e.target.files[0]?.name || 'Выберите файл';
});

document.getElementById('cover-file').addEventListener('change', (e) => {
  document.getElementById('cover-label').textContent = e.target.files[0]?.name || 'Выберите изображение';
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const audioFile = document.getElementById('audio-file').files[0];
  if (audioFile) fd.set('audio', audioFile);
  const coverFile = document.getElementById('cover-file').files[0];
  if (coverFile) fd.set('cover', coverFile);
  try {
    await fetch(API + '/admin/tracks', { method: 'POST', body: fd, credentials: 'include' }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    });
    showToast('Трек загружен!');
    form.reset();
    document.getElementById('audio-label').textContent = 'Выберите файл';
    document.getElementById('cover-label').textContent = 'Выберите изображение';
    loadAdmin();
    loadAll();
  } catch (err) {
    showToast(err.message);
  }
});

// Init
loadAll().catch(console.error);
