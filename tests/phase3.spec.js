// Phase 3 : trois horizons, maîtrise, fraîcheur, intention « quand », absence sans perte, personnalisation.
const { test, expect } = require('@playwright/test');
const path = require('path');
const URL = 'file://' + path.resolve(process.env.APP_FILE || path.join(__dirname, '..', 'index.html'));
const KEY1 = 'mouad-cap-ol-v1', KEY = 'mouad-cap-ol-v2';

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
const BAD_WORDS = /perdu|perdue|manqu|raté|retard|culpab|série brisée|tu n['’]as pas/i;

test('accueil : 3 horizons visibles (aujourd’hui, ma séquence, mon CAP)', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const prog = page.locator('.prog');
  await expect(prog).toContainText('Aujourd’hui');
  await expect(prog).toContainText('Ma séquence');
  await expect(prog).toContainText('Mon CAP');
  await expect(prog.locator('.pips i')).toHaveCount(8);
  await expect(prog.locator('.pips i.on')).toHaveCount(0);
  await expect(prog.locator('[role=progressbar]')).toHaveCount(2);
});

test('aujourd’hui : la jauge de 8 pas se remplit à chaque réponse et le ✔ apparaît à la fin de la mission', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.locator('#mission').click();
  const n = await page.evaluate(() => cur.qs.length);
  await good(page); await next(page);
  await good(page); await next(page);
  expect(await page.evaluate(() => S.today.n)).toBe(2);
  for (let i = 2; i < n; i++) { await good(page); await next(page); }
  await page.getByRole('button', { name: /Accueil/ }).first().click();
  await expect(page.locator('.pips i.on')).toHaveCount(n);
  await expect(page.locator('.prog .pr').first()).toContainText('✔');
});

test('maîtrise : séquence, compétences du CAP ; les étoiles ne bougent pas', async ({ page }) => {
  await seed(page, { stars: { quiz: 2 } }); await page.goto(URL);
  const r = await page.evaluate(() => {
    const before = capStats();
    const sq = BLOCS[0].seqs[0];
    seqQs(sq).forEach(q => { S.qm[q.id] = { b: 3, last: 1, due: dayNum() + 9, n: 3, ok: 3 }; });
    const after = capStats(); save();
    return { before, after, mas: masOf(seqQs(sq)), stars: S.stars.quiz };
  });
  expect(r.before.ok).toBe(0);
  expect(r.mas).toBe(1);
  expect(r.after.ok).toBeGreaterThan(0);          // les compétences qui ne reposent que sur cette séquence sont maîtrisées
  expect(r.after.n).toBe(r.before.n);
  expect(r.stars).toBe(2);
  await page.evaluate(() => { S.last = { bid: BLOCS[0].id, sid: BLOCS[0].seqs[0].id }; home(); });
  await expect(page.locator('.prog')).toContainText('100 % maîtrisé');
});

test('référentiel : 🏅 pour une compétence maîtrisée', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { seqQs(BLOCS[0].seqs[0]).forEach(q => { S.qm[q.id] = { b: 4, last: 1, due: dayNum() + 20, n: 4, ok: 4 }; }); refView(); });
  await expect(page.locator('.cl .ci', { hasText: '🏅' }).first()).toBeVisible();
});

test('fraîcheur : « À jour » / « À revoir », dite positivement, rien avant d’avoir commencé', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    const [a, b, c] = BLOCS[0].seqs; window.__day = 50;
    const out = { none: freshOf(a) };
    seqQs(b).forEach(q => { S.qm[q.id] = { b: 2, last: 49, due: 53, n: 2, ok: 2 }; });
    out.ok = freshOf(b);
    seqQs(c).forEach(q => { S.qm[q.id] = { b: 1, last: 40, due: 41, n: 1, ok: 1 }; });
    out.rev = freshOf(c);
    out.line = freshLine(c); out.ring = blocRing(BLOCS[0]).items.map(i => i.sub).join('|');
    return out;
  });
  expect(r.none).toBeNull();
  expect(r.ok.txt).toBe('À jour');
  expect(r.rev.txt).toBe('À revoir');
  expect(r.rev.n).toBeGreaterThan(0);
  expect(r.line + r.ring).not.toMatch(BAD_WORDS);
  expect(r.ring).toContain('🌿');
  expect(r.ring).toContain('🔄');
});

test('absence prolongée : message neutre, mission allégée, rien n’est perdu ni « cassé »', async ({ page }) => {
  await seed(page, { stars: { quiz: 3, relier: 2 }, badges: ['first'] }); await page.goto(URL);
  const before = await page.evaluate(() => {
    window.__day = 1000; const all = [...QIDX.values()];
    all.slice(0, 20).forEach((e, i) => { S.qm[e.q.id] = { b: 3, last: 900, due: 910 + i, n: 4, ok: 4 }; });
    S.lastDay = 940; S.today = { d: 940, n: 8 }; S.maxMas = 7; save();
    return JSON.stringify({ stars: S.stars, badges: S.badges, qm: S.qm, maxMas: S.maxMas });
  });
  await page.evaluate(() => home());
  await expect(page.locator('.welcome')).toContainText('Content de te revoir ! On reprend doucement.');
  const n = await page.evaluate(() => buildMission().length);
  expect(n).toBeLessThanOrEqual(5);
  await expect(page.locator('#mission')).toContainText(`${n} questions`);
  await expect(page.locator('#app')).not.toContainText(BAD_WORDS);
  await expect(page.locator('.pips i.on')).toHaveCount(0);               // un nouveau jour : on repart de zéro, sans reproche
  const after = await page.evaluate(() => JSON.stringify({ stars: S.stars, badges: S.badges, qm: S.qm, maxMas: S.maxMas }));
  expect(after).toBe(before);
  // dès qu'il répond, le message disparaît
  await page.locator('#mission').click();
  await page.evaluate(() => pick(cur.qs[cur.i].ok));
  await page.evaluate(() => home());
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('« Quand… » : choix à la fin de la mission, affiché à l’accueil, modifiable dans « Moi »', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.locator('#mission').click();
  const n = await page.evaluate(() => cur.qs.length);
  for (let i = 0; i < n; i++) { await good(page); await next(page); }
  await page.getByRole('button', { name: 'après le repas' }).click();
  await expect(page.locator('#whenbox')).toContainText('Quand je suis après le repas, je fais ma mission.');
  expect(await page.evaluate(() => S.when)).toBe('après le repas');
  await page.getByRole('button', { name: /Accueil/ }).first().click();
  await expect(page.locator('.avb')).toContainText('après le repas');
  await page.locator('.avb').click();
  await page.getByRole('button', { name: 'dans le bus' }).click();
  expect(await page.evaluate(() => S.when)).toBe('dans le bus');
  await page.getByRole('button', { name: 'Pas de moment fixe' }).click();
  expect(await page.evaluate(() => S.when)).toBeUndefined();
});

test('personnalisation : débloquée par la maîtrise, et jamais retirée ensuite', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.locator('.avb').click();
  const orange = page.getByRole('button', { name: /Orange/ });
  await expect(orange).toBeDisabled();
  await expect(page.getByRole('button', { name: /Jaune/ })).toBeEnabled();
  // on maîtrise 3 questions → l'orange (seuil 2) se débloque, avec un message de joie
  await page.evaluate(() => {
    [...QIDX.values()].slice(0, 3).forEach(e => { S.qm[e.q.id] = { b: 2, last: 1, due: dayNum(), n: 2, ok: 2 }; });
    recordQ([...QIDX.values()][0].q, true); recordQ([...QIDX.values()][1].q, true); recordQ([...QIDX.values()][2].q, true);
  });
  expect(await page.evaluate(() => masCount())).toBe(3);
  await expect(page.locator('.toast')).toContainText('Nouveau pour mon cariste');
  await page.evaluate(() => moi(true));
  await expect(orange).toBeEnabled();
  await orange.click();
  expect(await page.evaluate(() => S.av.c)).toBe('#F2A65A');
  // même si la maîtrise redescend (erreurs), le choix reste débloqué
  await page.evaluate(() => { [...QIDX.values()].slice(0, 3).forEach(e => recordQ(e.q, false)); moi(true); });
  expect(await page.evaluate(() => masCount())).toBe(0);
  await expect(orange).toBeEnabled();
  expect(await page.evaluate(() => S.maxMas)).toBe(3);
  await page.reload();
  expect(await page.evaluate(() => avatar().c)).toBe('#F2A65A');
});

test('aucun classement, aucune comparaison, aucun minuteur dans l’interface', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await expect(page.locator('#app')).not.toContainText(/classement|meilleur score|rang\b|minuteur|compte à rebours|série de \d+ jours|jours d['’]affilée/i);
});
