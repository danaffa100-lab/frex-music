require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, initSchema, toBoolInt } = require('./db');

async function main() {
  await initSchema();

  const adminUser = 'pax';
  const adminPass = 'Danil.228';
  const hash = await bcrypt.hash(adminPass, 10);

  const existing = await query('SELECT id FROM users WHERE username = $1', [adminUser]);
  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO users (username, password_hash, is_admin, has_subscription)
       VALUES ($1, $2, $3, $4)`,
      [adminUser, hash, toBoolInt(true), toBoolInt(true)]
    );
    console.log('Админ создан: pax / Danil.228');
  } else {
    await query(
      'UPDATE users SET password_hash = $1, is_admin = $2, is_blocked = $3 WHERE username = $4',
      [hash, toBoolInt(true), toBoolInt(false), adminUser]
    );
    console.log('Админ обновлён: pax / Danil.228');
  }

  const playlists = await query('SELECT id FROM playlists LIMIT 1');
  if (playlists.rows.length === 0) {
    const names = [
      ['Волна хитов', 'Топ треков Frex'],
      ['Река звуков', 'Плавные мелодии'],
      ['Жёлтое настроение', 'Энергия и ритм'],
      ['Ночной поток', 'Для вечернего прослушивания'],
    ];
    for (const [name, desc] of names) {
      await query(
        'INSERT INTO playlists (name, description, is_public) VALUES ($1, $2, $3)',
        [name, desc, toBoolInt(true)]
      );
    }
    console.log('Созданы плейлисты по умолчанию');
  }

  console.log('База данных готова.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
