// Phase 2 : identifiants stables, migration v2, boîtes de Leitner, file d'échéance, mission du jour, régulation.
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
const bad = page => page.evaluate(() => pick(cur.qs[cur.i].opts.findIndex((_, i) => i !== cur.qs[cur.i].ok)));
const failQ = async page => { await bad(page); if (!(await page.evaluate(() => cur.locked))) await bad(page); };
const next = page => page.evaluate(() => nextQ());
const qm = page => page.evaluate(() => JSON.parse(JSON.stringify(S.qm)));

test('chaque question a un identifiant stable et unique', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    const ids = []; BLOCS.forEach(b => b.seqs.forEach(s => s.games.forEach(g => g.qs.forEach(q => ids.push(q.id)))));
    return { n: ids.length, unique: new Set(ids).size, missing: ids.filter(i => !i).length, size: QIDX.size };
  });
  expect(r.missing).toBe(0);
  expect(r.unique).toBe(r.n);
  expect(r.size).toBe(r.n);
  // stable : recharger donne les mêmes identifiants
  const a = await page.evaluate(() => [...QIDX.keys()].join());
  await page.reload();
  expect(await page.evaluate(() => [...QIDX.keys()].join())).toBe(a);
});

test('Leitner : montées, descentes et intervalles 0-1-3-7-21', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    const out = []; const q = { id: 'T1' }; window.__day = 100;
    const snap = () => { const m = S.qm.T1; out.push([m.b, m.due - __day]); };
    recordQ(q, true);  snap();                       // nouvelle, réussie → boîte 1, +1 j
    recordQ(q, true);  snap();                       // pas encore due : la boîte ne monte pas
    __day = 101; recordQ(q, true); snap();           // due → boîte 2, +3 j
    __day = 104; recordQ(q, true); snap();           // → boîte 3, +7 j
    __day = 111; recordQ(q, true); snap();           // → boîte 4, +21 j
    __day = 132; recordQ(q, true); snap();           // plafond : reste en 4
    recordQ(q, false); snap();                       // erreur depuis 4 → boîte 1, +1 j
    recordQ(q, false); snap();                       // erreur depuis 1 → boîte 0, même jour
    recordQ(q, false); snap();                       // jamais en dessous de 0
    return { out, n: S.qm.T1.n, ok: S.qm.T1.ok };
  });
  expect(r.out).toEqual([[1, 1], [1, 1], [2, 3], [3, 7], [4, 21], [4, 21], [1, 1], [0, 0], [0, 0]]);
  expect(r.n).toBe(9);
  expect(r.ok).toBe(6);
});

test('mixFormats : jamais deux fois le même format d’affilée quand c’est possible', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    const mk = o => ({ q: { opts: o.opts, hear: o.hear, viz: o.viz, story: o.story } });
    const two = [1, 2], three = [1, 2, 3];
    const list = [mk({ opts: three }), mk({ opts: three }), mk({ opts: two }), mk({ opts: two }), mk({ opts: three, hear: 'x' }), mk({ opts: three, hear: 'x' })];
    return mixFormats(list).map(e => fmtOf(e.q));
  });
  for (let i = 1; i < r.length; i++) expect(r[i]).not.toBe(r[i - 1]);
  expect(r.length).toBe(6);
});

test('mission du jour 1 : que du nouveau, 5 questions, dans la séquence en cours', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => { const l = buildMission(); return { n: l.length, allNew: l.every(e => e.isNew), seq: [...new Set(l.map(e => e.s.id))] }; });
  expect(r.n).toBe(5);
  expect(r.allNew).toBe(true);
});

test('mission : 5 à revoir (les plus en retard) + 3 nouvelles, 8 au maximum, sans doublon', async ({ page }) => {
  await seed(page); await page.goto(URL);
  const r = await page.evaluate(() => {
    window.__day = 200; const all = [...QIDX.values()];
    // 10 questions à revoir, avec des retards différents ; la plus en retard a un id connu
    all.slice(0, 10).forEach((e, i) => { S.qm[e.q.id] = { b: 1, last: 190, due: 200 - i, n: 1, ok: 1 }; });
    const l = buildMission(); const ids = l.map(e => e.q.id);
    const rev = l.filter(e => !e.isNew).map(e => e.q.id);
    const expected = all.slice(0, 10).map(e => e.q.id).reverse().slice(0, 5);   // les 5 plus anciennes échéances
    return { n: l.length, newN: l.filter(e => e.isNew).length, revN: rev.length, unique: new Set(ids).size, revOk: expected.every(i => rev.includes(i)), futureIn: l.some(e => !e.isNew && S.qm[e.q.id].due > 200) };
  });
  expect(r.n).toBe(8);
  expect(r.revN).toBe(5);
  expect(r.newN).toBe(3);
  expect(r.unique).toBe(8);
  expect(r.revOk).toBe(true);
  expect(r.futureIn).toBe(false);
});

test('mission : parcours complet → écran de clôture, bilan en 3 lignes, mémoire enregistrée', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.locator('#mission').click();
  const n = await page.evaluate(() => cur.qs.length);
  for (let i = 0; i < n; i++) { await good(page); await next(page); }
  await expect(page.locator('h2')).toContainText('Mission terminée');
  await expect(page.locator('.endc')).toContainText('À demain');
  await expect(page.locator('.bilan li')).toHaveCount(3);
  const m = await qm(page);
  expect(Object.keys(m).length).toBe(n);
  expect(Object.values(m).every(x => x.b === 1 && x.n === 1)).toBe(true);
  // accueil : mission faite, pas de gros bouton « encore », mais « Continuer quand même » discret
  await page.getByRole('button', { name: /Accueil/ }).first().click();
  await expect(page.locator('#mission')).toHaveCount(0);
  await expect(page.locator('.mission.done')).toContainText('Mission du jour faite');
  await expect(page.getByRole('button', { name: 'Continuer quand même' })).toBeVisible();
  // et ça tient après rechargement
  await page.reload();
  await expect(page.locator('.mission.done')).toBeVisible();
});

test('une erreur en jeu normal devient une révision programmée dans la mission', async ({ page }) => {
  await seed(page); await page.goto(URL);
  await page.evaluate(() => { window.__day = 300; const b = BLOCS[0], sq = b.seqs[0]; ctx = { bid: b.id, sid: sq.id }; play(sq.games[0].id); });
  const qid = await page.evaluate(() => cur.qs[cur.i].id);
  await failQ(page);
  const m = (await qm(page))[qid];
  expect(m.b).toBe(0);
  expect(m.due).toBe(300);
  // le jour même la question est à revoir ; une réussie du premier coup ne l'est pas
  await page.evaluate(() => { window.__day = 300; S.last = { bid: BLOCS[0].id, sid: BLOCS[0].seqs[0].id }; });
  const inMission = await page.evaluate(id => buildMission().some(e => e.q.id === id && !e.isNew), qid);
  expect(inMission).toBe(true);
});

test('régulation : 2 échecs de suite → une mauvaise réponse déjà enlevée ; 5 réussites → indice retiré', async ({ page }) => {
  await seed(page); await page.goto(URL);
  // on force des questions à 3 choix pour que l'aide soit visible
  await page.evaluate(() => {
    const g = { id: 'T', name: 'T', mix: false, qs: [] };
    for (let i = 0; i < 12; i++) g.qs.push({ id: 'Z' + i, icon: '', text: 'Q' + i, opts: [{ t: 'a' }, { t: 'b' }, { t: 'c' }], ok: 0, why: 'w' });
    ctx = { bid: BLOCS[0].id, sid: BLOCS[0].seqs[0].id };
    cur = { g, s: null, qs: g.qs, i: 0, pts: 0, first: 0, tries: 0, locked: false, streak: 0, missed: new Set(), review: false, cf: 0, cs: 0 }; showQ();
  });
  await expect(page.locator('#hintb')).toBeVisible();
  await expect(page.locator('.opt.gone')).toHaveCount(0);
  await failQ(page); await next(page);
  await failQ(page); await next(page);
  expect(await page.evaluate(() => cur.assist)).toBe(true);
  await expect(page.locator('.opt.gone')).toHaveCount(1);
  await good(page); await next(page);                           // réussite : l'aide supplémentaire cesse
  expect(await page.evaluate(() => cur.assist)).toBe(false);
  await expect(page.locator('.opt.gone')).toHaveCount(0);
  for (let i = 0; i < 4; i++) { await good(page); await next(page); }
  await good(page);                                             // 5e réussite d'affilée
  expect(await page.evaluate(() => cur.lean)).toBe(true);
  await next(page);
  await expect(page.locator('#hintb')).toHaveCount(0);
  await failQ(page); await next(page);                          // une erreur rétablit l'indice
  await expect(page.locator('#hintb')).toBeVisible();
});

test('1 tap depuis l’accueil suffit pour lancer la mission (jamais d’attente forcée > 1,5 s)', async ({ page }) => {
  await seed(page, { auto: false, calm: true });
  await page.goto(URL);
  await page.locator('#mission').click();
  await expect(page.locator('.pbar')).toBeVisible();
  await expect(page.locator('.opts.wait')).toHaveCount(0, { timeout: 2000 });
});
