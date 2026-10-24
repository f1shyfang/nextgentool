import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = process.cwd();
const out = path.join(root, 'out');
const routes = JSON.parse(fs.readFileSync(path.join(root, 'content/routes.json')));
const errors = [];
let links = 0;
let assets = 0;
for (const record of routes) {
  const file = path.join(out, record.route, 'index.html');
  if (!fs.existsSync(file)) { errors.push(`Missing route ${record.route}`); continue; }
  const $ = load(fs.readFileSync(file, 'utf8'));
  if (!$('h1').length) errors.push(`Missing heading ${record.route}`);
  if ($('[data-replica-header] button').length !== 1) errors.push(`Missing navigation ${record.route}`);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href.startsWith('.')) errors.push(`Relative route ${href} from ${record.route}`);
    if (href.startsWith('/') && !href.startsWith('//')) {
      links++;
      const target = href.split('#')[0].replace(/\/$/, '') || '/';
      if (!routes.some(record => record.route === target)) errors.push(`Broken route ${href} from ${record.route}`);
    }
  });
  $('img[src],script[src],link[href]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('href');
    if (src.startsWith('/') && !src.startsWith('//')) {
      assets++;
      if (!fs.existsSync(path.join(out, src))) errors.push(`Missing asset ${src}`);
    }
  });
  if ($('script[src]').toArray().some(el => /framer|google|analytics/.test($(el).attr('src')))) errors.push(`Remote runtime on ${record.route}`);
}
if (errors.length) { console.error([...new Set(errors)].join('\n')); process.exit(1); }
console.log(`Verified ${routes.length} routes, ${links} internal links, and ${assets} local asset references. No remote application or analytics scripts.`);
