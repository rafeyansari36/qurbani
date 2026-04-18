import User from '../models/User.js';

/**
 * On first startup, create an admin user from env vars if there are NO users yet.
 * Safe to run on every boot — becomes a no-op once users exist.
 *
 * Env vars:
 *   SEED_ADMIN_USERNAME  (default: "admin")
 *   SEED_ADMIN_PASSWORD  (required; if missing and DB empty, seeding is skipped with a warning)
 *   SEED_ADMIN_NAME      (default: "Administrator")
 */
export async function seedAdminIfEmpty() {
  const count = await User.countDocuments();
  if (count > 0) return;

  const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Administrator';

  if (!password) {
    console.warn(
      '[seed] No users in DB and SEED_ADMIN_PASSWORD is not set. Skipping admin seed. ' +
        'Set SEED_ADMIN_PASSWORD env var and restart to create the first admin.'
    );
    return;
  }

  const passwordHash = await User.hashPassword(password);
  await User.create({ name, username, passwordHash, role: 'admin' });
  console.log(`[seed] First admin created: username="${username}"`);
}
