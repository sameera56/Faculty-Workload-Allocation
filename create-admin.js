require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

async function createAdmin() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 12) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) in .env.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.execute(
    `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    [name, email.toLowerCase(), passwordHash]
  );
  console.log(`Administrator account ready for ${email.toLowerCase()}.`);
}

createAdmin().catch((error) => {
  console.error('Could not create administrator:', error.message);
  process.exitCode = 1;
}).finally(() => db.end());
