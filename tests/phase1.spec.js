// Phase 1 : attente contournable, erreur douce, récompense proportionnée, série, accueil épuré, réglages.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(process.env.APP_FILE || path.join(__dirname, '..', 'index.html'));
const KEY = 'mouad-cap-ol-v1';

// Voix factice qui ne finit jamais de parler : prouve qu'on ne dépend plus de la fin de la voix.
async function seed(page, extra = {}, fakeVoice = true) {
  await page.addInitScript(([k, ex, fv]) => {
    if (fv) Object.defineProperty(window, 'speechSynthesis', {
      value: { speak() {}, cancel() {}, getVoices() { return []; }, onvoiceschanged: null }, configurable: true });
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem(k, JSON.stringify(Object.assign({ stars: {}, fx: false }, ex)));
    }
  }, [KEY, extra, fakeVoice]);
}
test.beforeEach(async ({ page }) => { page.errors = []; page.on('pageerror', e => page.errors.push(e.message)); });
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

const pickGood = page => page.evaluate(() => pick(cur.qs[cur.i].ok));
const pickBad = page => page.evaluate(() => pick(cur.qs[cur.i].opts.findIndex((_, i) => i !== cur.qs[cur.i].ok)));

test('accueil : un seul tap sur « Ma mission du jour » lance un jeu', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await page.locator('#mission').click();
  await expect(page.locator('.opts')).toBeVisible();
  await expect(page.locator('.pbar')).toBeVisible();
});

test('accueil épuré : plus de bouton Effacer ni de puces visibles, zone Pause repliée', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await expect(page.locator('.reset')).toHaveCount(0);
  await expect(page.getByText('Effacer mes étoiles')).toHaveCount(0);
  expect(await page.locator('#pausez').evaluate(d => d.open)).toBe(false);
  await expect(page.locator('#c-joke')).toBeHidden();
  await page.locator('#pausez summary').click();
  await expect(page.locator('#c-joke')).toBeVisible();
});

test('rythme par défaut « à mon rythme » : question et bouton Suivant libres en 1,5 s, voix muette ou non', async ({ page }) => {
  await seed(page, { auto: true });   // calm par défaut, voix qui ne finit jamais
  await page.goto(URL);
  await page.locator('#mission').click();
  await expect(page.locator('.opts.wait')).toHaveCount(1);              // bloqué au départ
  await expect(page.locator('.opts.wait')).toHaveCount(0, { timeout: 2500 });
  await pickGood(page);
  const next = page.locator('#nxt');
  await expect(next).toBeDisabled();
  await expect(next).toBeEnabled({ timeout: 2500 });
});

test('rythme « on m’attend » : le blocage reste tant que la voix parle', async ({ page }) => {
  await seed(page, { auto: true, pace: 'wait' });
  await page.goto(URL);
  await page.locator('#mission').click();
  await page.waitForTimeout(2200);
  await expect(page.locator('.opts.wait')).toHaveCount(1);
});

test('mode facile : par défaut on m’attend, sauf choix contraire', async ({ page }) => {
  await seed(page, { easy: true });
  await page.goto(URL);
  expect(await page.evaluate(() => pace())).toBe('wait');
});

test('un tap sur une réponse coupe la voix', async ({ page }) => {
  await seed(page, { auto: true });
  await page.addInitScript(() => { window.__cancels = 0; speechSynthesis.cancel = () => { window.__cancels++; }; });
  await page.goto(URL);
  await page.locator('#mission').click();
  await expect(page.locator('.opts.wait')).toHaveCount(0, { timeout: 2500 });
  const before = await page.evaluate(() => window.__cancels);
  await pickGood(page);
  expect(await page.evaluate(() => window.__cancels)).toBeGreaterThan(before);
});

test('erreur non punitive : pas de secousse, son doux, message « Pas encore. Regarde. »', async ({ page }) => {
  await seed(page, { auto: false, calm: false, fx: true });
  await page.addInitScript(() => { window.__tones = []; });
  await page.goto(URL);
  await page.evaluate(() => { const t = window.tone; window.tone = (f, w, d, ty, v) => { __tones.push([f, ty, v]); }; });
  await page.locator('#mission').click();
  await pickBad(page);
  const anim = await page.locator('.opt.bad').first().evaluate(e => getComputedStyle(e).animationName);
  expect(anim).toBe('none');
  const tones = await page.evaluate(() => __tones);
  expect(tones.some(([f, ty]) => f === 330 && ty === 'sine')).toBe(true);
  expect(tones.some(([f, ty]) => ty === 'square')).toBe(false);
  // 2e erreur (ou question à 2 choix) : on voit la bonne réponse
  if (!(await page.evaluate(() => cur.locked))) await pickBad(page);
  await expect(page.locator('#fb')).toContainText('Pas encore. Regarde.');
  await expect(page.locator('#fb')).not.toContainText('Pas tout à fait');
});

test('récompense proportionnée : aucun confetti à une bonne réponse', async ({ page }) => {
  await seed(page, { auto: false, calm: false });
  await page.goto(URL);
  await page.evaluate(() => { window.__conf = 0; const c = window.confetti; window.confetti = (...a) => { __conf++; return c(...a); }; });
  await page.locator('#mission').click();
  await pickGood(page);
  expect(await page.evaluate(() => __conf)).toBe(0);
});

test('fin de jeu : grosse fête seulement pour un record', async ({ page }) => {
  await seed(page, { auto: false, calm: false });
  await page.goto(URL);
  // la fanfare est la seule à jouer des notes « triangle »
  await page.evaluate(() => { window.__fan = 0; window.tone = (f, w, d, ty) => { if (ty === 'triangle') __fan++; }; });
  const finishGame = async () => {
    const n = await page.evaluate(() => cur.qs.length);
    for (let i = 0; i < n; i++) {
      await pickGood(page);
      await page.evaluate(() => nextQ());
      if (await page.locator('.endc h2', { hasText: 'Pause' }).count()) await page.evaluate(() => showQ());
    }
    await expect(page.locator('.bigstars')).toBeVisible();
  };
  await page.locator('#mission').click();
  await finishGame();
  expect(await page.evaluate(() => __fan)).toBeGreaterThan(0);          // 1er passage : record

  // 2e passage sur le même jeu : 3 étoiles déjà acquises, badges déjà obtenus → pas de fanfare
  await page.evaluate(() => { S.stars[cur.g.id] = 3; S.badges = badgeList().map(b => b.id); save(); __fan = 0; });
  await page.evaluate(() => play(cur.g.id));
  await finishGame();
  expect(await page.evaluate(() => __fan)).toBe(0);
});

test('série de réussites affichée, jamais de série perdue', async ({ page }) => {
  await seed(page, { auto: false, calm: false });
  await page.goto(URL);
  await page.locator('#mission').click();
  await pickGood(page); await page.evaluate(() => nextQ());
  await expect(page.locator('#stk')).toHaveText('');
  await pickGood(page);
  await expect(page.locator('#stk')).toHaveText('2 de suite ✔');
  await page.evaluate(() => nextQ());
  await pickBad(page);
  await expect(page.locator('#stk')).toHaveText('');   // rien de négatif affiché
  await expect(page.locator('body')).not.toContainText(/perdu|série perdue/i);
});

test('réglages : « Effacer mes étoiles » demande une double confirmation', async ({ page }) => {
  await seed(page, { stars: { quiz: 2 } });
  await page.goto(URL);
  await page.locator('#b-comf').click();
  await page.getByRole('button', { name: /Effacer mes étoiles/ }).click();
  await page.getByRole('button', { name: 'Non, je garde' }).click();
  expect((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).stars.quiz).toBe(2);
  await page.getByRole('button', { name: /Effacer mes étoiles/ }).click();
  await page.getByRole('button', { name: 'Oui' }).click();
  await expect(page.getByText('Vraiment tout effacer')).toBeVisible();
  expect((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).stars.quiz).toBe(2);
  await page.getByRole('button', { name: 'Oui' }).click();
  expect((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).stars).toEqual({});
});

test('réglages : bascule du rythme et mémorisation', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await page.locator('#b-comf').click();
  const btn = page.getByRole('button', { name: /Je vais à mon rythme/ });
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  expect(await page.evaluate(() => pace())).toBe('wait');
});
