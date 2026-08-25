import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const baseUrl = process.env.GAME_URL || 'http://127.0.0.1:8123';
const require = createRequire(import.meta.url);
let playwright;

try {
  playwright = require('playwright');
} catch {
  console.error('Playwright is not installed. Start a local server and install Playwright to run this optional smoke test.');
  process.exit(2);
}

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: playwright.chromium.executablePath(),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(baseUrl + '/index.html', { waitUntil: 'networkidle' });
await page.evaluate(() => window.__game.start());
await page.evaluate(() => window.__game.advance(0.5));

const snapshot = await page.evaluate(() => ({
  state: window.__game.state,
  stage: window.__game.stage,
  prey: window.__game.preyList.length,
}));

assert.equal(snapshot.state, 'playing');
assert.equal(snapshot.stage, 0);
assert.equal(snapshot.prey, 24);
assert.deepEqual(errors, []);

await browser.close();
console.log('smoke: ok', snapshot);
