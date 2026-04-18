import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qurbani';

async function main() {
  await mongoose.connect(MONGO_URI);
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  const name = process.argv[4] || 'Administrator';

  const exists = await User.findOne({ username });
  if (exists) {
    console.log(`User "${username}" already exists.`);
  } else {
    const passwordHash = await User.hashPassword(password);
    await User.create({ name, username, passwordHash, role: 'admin' });
    console.log(`Admin created — username: ${username}, password: ${password}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
