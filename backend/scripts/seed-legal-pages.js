/**
 * Writes the client-approved legal/company pages (scripts/legal-content.js) into the CMS,
 * OVERWRITING the current text of those slugs and bumping their version. Other CMS pages are untouched.
 * After this, admins keep editing the pages under Content → Pages.
 *
 *   npm run db:seed-legal            # write
 *   npm run db:seed-legal -- --dry   # show what would change, write nothing
 */
import { connectDb, disconnectDb } from '../src/core/db.js';
import { CmsPage } from '../src/modules/cms/cms.model.js';
import { LEGAL_PAGES } from './legal-content.js';

const dry = process.argv.includes('--dry');
await connectDb();
for (const [slug, { title, blocks }] of Object.entries(LEGAL_PAGES)) {
  const cur = await CmsPage.findOne({ slug }).lean();
  const same = cur && cur.title === title && JSON.stringify(cur.blocks) === JSON.stringify(blocks);
  console.log(`${slug.padEnd(22)} current v${cur?.version ?? 0} (${cur?.blocks?.length ?? 0} blocks) → ${same ? 'unchanged' : `${blocks.length} blocks`}`);
  if (dry || same) continue;
  await CmsPage.updateOne({ slug }, { $set: { title, blocks, isPublished: true }, $inc: { version: 1 } }, { upsert: true });
}
console.log(dry ? 'Dry run — nothing written.' : 'Legal pages updated.');
await disconnectDb();
