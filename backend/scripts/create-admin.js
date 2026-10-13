/**
 * Creates the first (or another) admin account. There are no default credentials.
 *   ADMIN_PASSWORD='…' npm run admin:create -- --email ops@way2cars.in --name "Ops Lead" --role super_admin
 */
import { parseArgs } from 'node:util';
import { connectDb, disconnectDb } from '../src/core/db.js';
import { hashPassword } from '../src/core/crypto.js';
import { AdminUser, ADMIN_ROLES } from '../src/modules/admin/admin.model.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'super_admin' } } });
const password = process.env.ADMIN_PASSWORD;
if (!values.email || !values.name || !password) {
  console.error('Usage: ADMIN_PASSWORD=… npm run admin:create -- --email <email> --name <name> [--role super_admin]');
  process.exit(1);
}
if (!ADMIN_ROLES.includes(values.role)) {
  console.error(`role must be one of ${ADMIN_ROLES.join(', ')}`);
  process.exit(1);
}
if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
  console.error('Password needs 12+ characters with upper, lower case and a digit.');
  process.exit(1);
}
await connectDb();
const email = values.email.toLowerCase().trim();
if (await AdminUser.exists({ email })) {
  console.error('An admin with this email already exists.');
  process.exit(1);
}
await AdminUser.create({ email, name: values.name, role: values.role, passwordHash: await hashPassword(password), passwordChangedAt: new Date() });
console.log(`Admin ${email} (${values.role}) created. Enable MFA after first sign-in.`);
await disconnectDb();
