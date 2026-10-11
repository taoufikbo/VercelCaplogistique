// Tests de fumée : parcours accueil → matière → séquence → jeu, réponses juste/fausse, fin, persistance.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(process.env.APP_FILE || path.join(__dirname, '..', 'index.html'));
const KEY1 = 'mouad-cap-ol-v1', KEY = 'mouad-cap-ol-v2';

// Réglages de test : pas de voix, pas d'attente. Posés une seule fois pour que le rechargement garde l'état.
async function seed(page, extra = {}) {
  await page.addInitScript(([k, ex]) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem(k, JSON.stringify(Object.assign({ stars: {}, auto: false, calm: false, fx: false }, ex)));
    }
  }, [KEY1, extra]);
}
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const answer = (page, good) => page.evaluate(g => {
  const q = cur.qs[cur.i];
  const k = g ? q.ok : q.opts.findIndex((_, i) => i !== q.ok);
  pick(k);
}, good);

async function openFirstGame(page) {
  await page.locator('.nd').first().click();            // matière
  await page.locator('.nd').first().click();            // séquence
  await expect(page.locator('.path')).toBeVisible();
  await page.locator('.nd').first().click();            // jeu
  await expect(page.locator('.opts')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.errors = errors;
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('accueil : charge sans erreur et affiche les matières', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await expect(page.locator('h1')).toContainText('Mon CAP Logistique');
  expect(await page.locator('.nd').count()).toBeGreaterThanOrEqual(8);
});

test('parcours complet : bonne et mauvaise réponse, fin de jeu, étoiles enregistrées', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await openFirstGame(page);
  const gameId = await page.evaluate(() => cur.g.id);
  const total = await page.evaluate(() => cur.qs.length);

  // 1re question : mauvaise réponse (reste jouable), puis bonne
  await answer(page, false);
  await expect(page.locator('#fb .retry, #fb .ko')).toBeVisible();
  const done = await page.evaluate(() => cur.locked);
  if (!done) await answer(page, true);
  await expect(page.locator('#fb .why')).toBeVisible();

  // Le reste : tout juste
  for (let i = 0; i < total; i++) {
    if (await page.locator('.endc').count()) break;
    if (!(await page.evaluate(() => cur.locked))) await answer(page, true);
    await page.evaluate(() => nextQ());
    if (await page.locator('.endc h2', { hasText: 'Pause' }).count()) await page.evaluate(() => showQ());
  }
  await expect(page.locator('.bigstars')).toBeVisible();
  const s = await state(page);
  expect(s.stars[gameId]).toBeGreaterThanOrEqual(1);
});

test('persistance : les étoiles survivent au rechargement', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await openFirstGame(page);
  const gameId = await page.evaluate(() => cur.g.id);
  const total = await page.evaluate(() => cur.qs.length);
  for (let i = 0; i < total; i++) {
    await answer(page, true);
    await page.evaluate(() => nextQ());
    if (await page.locator('.endc h2', { hasText: 'Pause' }).count()) await page.evaluate(() => showQ());
  }
  await expect(page.locator('.bigstars')).toBeVisible();
  await page.reload();
  const s = await state(page);
  expect(s.stars[gameId]).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => total())).toBeGreaterThanOrEqual(1);
});

test('revoir mes erreurs : une erreur de session est proposée puis rejouable', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await openFirstGame(page);
  const total = await page.evaluate(() => cur.qs.length);
  await answer(page, false);
  if (!(await page.evaluate(() => cur.locked))) await answer(page, false);
  for (let i = 0; i < total; i++) {
    if (i > 0) await answer(page, true);
    await page.evaluate(() => nextQ());
    if (await page.locator('.endc h2', { hasText: 'Pause' }).count()) await page.evaluate(() => showQ());
    if (await page.locator('.bigstars').count()) break;
  }
  await expect(page.getByRole('button', { name: /Revoir mes erreurs/ })).toBeVisible();
});

test('migration : une sauvegarde v1 est reprise en v2, la v1 reste intacte', async ({ page }) => {
  await seed(page, { stars: { quiz: 2 }, badges: ['x'] });
  await page.goto(URL);
  const s = await state(page);
  expect(s.schema).toBe(2);
  expect(s.stars.quiz).toBe(2);
  expect(s.badges).toEqual(['x']);
  expect(s.qm).toEqual({});
  const v1 = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY1);
  expect(v1.stars.quiz).toBe(2);
  expect(v1.schema).toBeUndefined();
});
