// Récompenses : tickets, sorties réelles validées par un adulte, bonus bowling et cinéma.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(process.env.APP_FILE || path.join(__dirname, '..', 'index.html'));
const KEY1 = 'mouad-cap-ol-v1';

async function seed(page, extra = {}) {
  await page.addInitScript(([k, ex]) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem(k, JSON.stringify(Object.assign({ stars: {}, auto: false, calm: false, fx: false }, ex)));
    }
  }, [KEY1, extra]);
}
test.beforeEach(async ({ page }) => { page.errors = []; page.on('pageerror', e => page.errors.push(e.message)); });
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

const good = page => page.evaluate(() => pick(cur.qs[cur.i].ok));
const next = page => page.evaluate(() => nextQ());
async function doMission(page) {
  await page.evaluate(() => startMission());
  const n = await page.evaluate(() => cur.qs.length);
  for (let i = 0; i < n; i++) { await good(page); await next(page); }
  await expect(page.locator('h2')).toContainText('Mission terminée');
}
const rw = page => page.evaluate(() => JSON.parse(JSON.stringify(S.rw)));

test('catalogue par défaut : bowling, cinéma et glace, 0 ticket', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await rw(page);
  expect(r.cat.map(c => [c.id, c.cost])).toEqual([['bowling', 7], ['cinema', 10], ['glace', 3]]);
  expect(r.tk).toEqual({ e: 0, s: 0 });
  await expect(page.locator('.prog')).toContainText('Récompenses');
});

test('1 ticket par mission, une seule fois par jour ; « Continuer quand même » n’en donne pas', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { window.__day = 700; });
  await doMission(page);
  await expect(page.locator('.gain')).toContainText('+1 ticket');
  await expect(page.locator('.endc')).toContainText('Sortie bowling : 1 sur 7');
  expect((await rw(page)).tk.e).toBe(1);
  await doMission(page);                                   // « Continuer quand même » le même jour
  await expect(page.locator('.gain')).toHaveCount(0);
  expect((await rw(page)).tk.e).toBe(1);
  await page.evaluate(() => { window.__day = 701; });      // le lendemain
  await doMission(page);
  expect((await rw(page)).tk.e).toBe(2);
});

test('paliers de maîtrise : +2 tickets par palier franchi, jamais deux fois', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    const ids = [...QIDX.values()].map(e => e.q.id);
    const mk = n => { for (let i = 0; i < n; i++) S.qm[ids[i]] = { b: 3, last: 1, due: dayNum() + 9, n: 3, ok: 3 }; };
    mk(5); noteMastery(); const a = tkBal();
    noteMastery(); const b = tkBal();                       // même état : rien de plus
    mk(10); noteMastery(); const c = tkBal();               // palier 10
    mk(35); noteMastery(); const d = tkBal();               // paliers 20 et 35 d'un coup
    return { a, b, c, d };
  });
  expect(r).toEqual({ a: 2, b: 2, c: 4, d: 8 });
});

test('les tickets ne se perdent jamais : erreurs et longue absence', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { S.rw.tk.e = 5; save(); window.__day = 2000; [...QIDX.values()].slice(0, 6).forEach(e => recordQ(e.q, false)); home(); });
  expect(await page.evaluate(() => tkBal())).toBe(5);
  await expect(page.locator('#app')).not.toContainText(/perdu|perdue|expir|disparu/i);
});

test('élève : « Je demande » quand il y a assez de tickets, puis validation par un adulte', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { S.rw.tk.e = 7; save(); recompenses(); });
  await expect(page.getByText('Encore 3 tickets')).toBeVisible();          // cinéma : 7 sur 10
  await page.locator('.rwc.main').getByRole('button', { name: /Je demande à un adulte/ }).click();
  await expect(page.getByText('J’ai demandé. Un adulte va valider.')).toBeVisible();
  expect((await rw(page)).ask).toBe('bowling');

  // espace adulte : mauvaise réponse, puis bonne
  await page.getByRole('button', { name: /Espace adulte/ }).click();
  await page.locator('#gin').fill('1');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.locator('#gmsg')).toContainText('Ce n’est pas ça');
  const ans = await page.evaluate(() => gate.a * gate.b);
  await page.locator('#gin').fill(String(ans));
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByText('Demande de l’élève')).toBeVisible();
  await page.getByRole('button', { name: /C’est fait : valider/ }).click();
  const r = await rw(page);
  expect(r.tk).toEqual({ e: 7, s: 7 });
  expect(r.hist.length).toBe(1);
  expect(r.hist[0].id).toBe('bowling');
  expect(r.ask).toBeNull();

  // l'élève voit un souvenir, pas une perte
  await page.getByRole('button', { name: 'Retour à l’élève' }).click();
  await expect(page.getByText('Mes souvenirs')).toBeVisible();
  await expect(page.locator('.bilan')).toContainText('Sortie bowling');
  // le retour côté élève reverrouille l'espace adulte
  expect(await page.evaluate(() => adultOK)).toBe(false);
});

test('adulte : annuler une récompense rend les tickets', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { S.rw.tk.e = 7; save(); adultOK = true; adultValidate('bowling'); });
  expect(await page.evaluate(() => tkBal())).toBe(0);
  await page.evaluate(() => adultUndo(0));
  expect(await page.evaluate(() => tkBal())).toBe(7);
  expect((await rw(page)).hist).toEqual([]);
});

test('adulte : régler le prix, cacher, ajouter et supprimer une récompense', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { adultOK = true; adultView(); });
  await page.getByRole('button', { name: 'Plus cher' }).first().click();
  expect((await rw(page)).cat[0].cost).toBe(8);
  for (let i = 0; i < 12; i++) await page.evaluate(() => adultCost('bowling', -1));
  expect((await rw(page)).cat[0].cost).toBe(1);                           // jamais en dessous de 1
  await page.locator('#rn').fill('Pizza');
  await page.locator('#rc').fill('4');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  let r = await rw(page);
  expect(r.cat.at(-1)).toMatchObject({ name: 'Pizza', cost: 4, on: true });
  const id = r.cat.at(-1).id;
  await page.evaluate(id => adultToggle(id), id);
  await page.evaluate(() => { adultOK = false; recompenses(); });
  await expect(page.locator('#app')).not.toContainText('Pizza');          // cachée côté élève
  await page.evaluate(id => { adultOK = true; adultDel(id); }, id);
  r = await rw(page);
  expect(r.cat.some(c => c.id === id)).toBe(false);
  // bowling et cinéma ne se suppriment pas, seulement se cacher
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
});

test('objectif : on peut le changer, et il reste valable si on cache la récompense', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => recompenses());
  await page.locator('.rwc', { hasText: 'Sortie cinéma' }).getByRole('button', { name: /C’est mon objectif/ }).click();
  expect((await rw(page)).goal).toBe('cinema');
  await expect(page.locator('.rwc.main')).toContainText('Sortie cinéma');
  await page.evaluate(() => { adultOK = true; adultToggle('cinema'); recompenses(); });
  await expect(page.locator('.rwc.main')).toContainText('Sortie bowling');
});

test('bowling : calcul des quilles déterministe (viser le milieu = plus de quilles)', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => [bowlKnock(0, 10), bowlKnock(.05, 10), bowlKnock(.5, 10), bowlKnock(.8, 10), bowlKnock(.9, 10), bowlKnock(1, 10), bowlKnock(0, 3), bowlKnock(.5, 3)]);
  expect(r).toEqual([10, 10, 4, 1, 0, 0, 3, 1]);
});

test('bowling : 3 boules, score enregistré, un seul bonus par jour', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { window.__day = 800; });
  await doMission(page);
  await page.getByRole('button', { name: /Bonus bowling/ }).click();
  await expect(page.locator('.lane .pin')).toHaveCount(10);
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { clearInterval(bowlIv); B.x = 0; });         // boule pile au milieu : plein
    await page.locator('#bgo').click();
    if (k < 2) await expect(page.locator('#bgo')).toBeVisible();
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('.endc h2')).toContainText('Bravo ! 30 quilles');
  const r = await rw(page);
  expect(r.best).toBe(30);
  expect(r.bonus.bowl).toBe(true);
  await page.evaluate(() => recompenses());
  await expect(page.getByRole('button', { name: /Bonus bowling/ })).toHaveCount(0);
  await expect(page.locator('#app')).toContainText('Mon meilleur score au bowling : 30');
});

test('bowling : quitter l’écran arrête l’animation (rien ne tourne en permanence)', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => miniBowl());
  expect(await page.evaluate(() => bowlIv)).not.toBe(0);
  await page.evaluate(() => home());
  expect(await page.evaluate(() => bowlIv)).toBe(0);
});

test('cinéma : une nouvelle séance par jour de mission, visible dans la salle', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { window.__day = 900; });
  await doMission(page);
  expect((await rw(page)).films).toEqual(['f1']);
  await page.getByRole('button', { name: /Séance du jour/ }).click();
  await expect(page.locator('.scr')).toBeVisible();
  await expect(page.locator('.fc')).toContainText('Léo arrive à l’entrepôt.');
  for (let i = 0; i < 5; i++) await page.evaluate(() => filmStep(1));
  await expect(page.locator('.endc h2')).toContainText('Fin de la séance');
  expect((await rw(page)).bonus.film).toBe(true);
  await page.evaluate(() => { window.__day = 901; });
  await doMission(page);
  expect((await rw(page)).films).toEqual(['f1', 'f2']);
  await page.evaluate(() => recompenses());
  await expect(page.locator('.opts2 .ab')).toHaveCount(2);                // salle de cinéma : 2 séances rejouables
});

test('cinéma : rejouer une séance ne redonne rien, et le minuteur est coupé en quittant', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { S.rw.films = ['f1']; save(); filmPlay('f1'); });
  expect(await page.evaluate(() => filmT)).not.toBe(0);
  const before = JSON.stringify(await rw(page));
  for (let i = 0; i < 5; i++) await page.evaluate(() => filmStep(1));
  expect(JSON.stringify(await rw(page))).toBe(before);
  await page.evaluate(() => { filmPlay('f1'); home(); });
  expect(await page.evaluate(() => filmT)).toBe(0);
});

test('pas de hasard ni de pression : aucun mot de loterie, de série ou de rareté', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { S.rw.tk.e = 3; save(); recompenses(); });
  await expect(page.locator('#app')).not.toContainText(/loterie|mystère|aléatoire|coffre|rare|limité|vite|dépêche|plus que/i);
  const src = await page.evaluate(() => [awardSource = String(finishMission), String(noteMastery), String(addTk)].join('\n'));
  expect(src).not.toMatch(/Math\.random/);                                   // l'attribution des tickets n'a aucun hasard
});

test('migration : une sauvegarde v2 existante sans récompenses reçoit le catalogue par défaut', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('mouad-cap-ol-v2', JSON.stringify({ schema: 2, stars: { quiz: 3 }, qm: {}, auto: false, calm: false }));
    }
  });
  await page.goto(URL);
  const r = await page.evaluate(() => ({ stars: S.stars, rw: S.rw }));
  expect(r.stars.quiz).toBe(3);
  expect(r.rw.cat.length).toBe(3);
  expect(r.rw.tk).toEqual({ e: 0, s: 0 });
});

test('une sauvegarde avec bowling et cinéma reçoit la glace, sans toucher aux tickets ni aux prix réglés', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('mouad-cap-ol-v2', JSON.stringify({ schema: 2, stars: {}, qm: {}, auto: false, calm: false,
        rw: { tk: { e: 5, s: 1 }, goal: 'cinema', cat: [{ id: 'bowling', icon: '🎳', name: 'Sortie bowling', cost: 9, on: true }, { id: 'cinema', icon: '🎬', name: 'Sortie cinéma', cost: 10, on: false }], hist: [], films: [], best: 0, ask: null } }));
    }
  });
  await page.goto(URL);
  const r = await page.evaluate(() => S.rw);
  expect(r.cat.map(c => c.id)).toEqual(['bowling', 'cinema', 'glace']);
  expect(r.cat[0].cost).toBe(9);
  expect(r.cat[1].on).toBe(false);
  expect(r.tk).toEqual({ e: 5, s: 1 });
  expect(r.goal).toBe('cinema');
});

test('glace : 3 tickets, atteinte dès le 3e jour de mission, validation par un adulte', async ({ page }) => {
  await seed(page); await page.goto(URL);
  for (let d = 0; d < 3; d++) { await page.evaluate(d => { window.__day = 1100 + d; }, d); await doMission(page); }
  expect(await page.evaluate(() => tkBal())).toBe(3);
  await page.evaluate(() => recompenses());
  await page.locator('.rwc', { hasText: 'Une glace' }).getByRole('button', { name: /Je demande à un adulte/ }).click();
  expect((await rw(page)).ask).toBe('glace');
  await page.evaluate(() => { adultOK = true; adultValidate('glace'); });
  const r = await rw(page);
  expect(r.tk).toEqual({ e: 3, s: 3 });
  expect(r.hist[0]).toMatchObject({ id: 'glace', c: 3 });
});
