import { test } from 'uvu';
import * as assert from 'uvu/assert';
import Jif from '../src/lib/jif.mjs';
import {
	generate, generateSolo, buildJif, buildJifSolo, validatePair,
	soloHandSeq, soloGlobalSeq, lcm, seqToken,
} from '../src/lib/polyrhythm.mjs';

test('seqToken uniquely identifies sequences (url round-trip)', () => {
	const res = generateSolo({ nR: 3, nL: 2, maxHeight: 8 });
	const tokens = res.seqsA.map(seqToken);
	assert.equal(new Set(tokens).size, tokens.length, 'tokens unique per side');
	const p = res.patterns[42 % res.patterns.length];
	const rTok = seqToken(res.seqsA[p.ia]), lTok = seqToken(res.seqsB[p.ib]);
	const found = res.patterns.find(q =>
		seqToken(res.seqsA[q.ia]) === rTok && seqToken(res.seqsB[q.ib]) === lTok);
	assert.is(found, p);
	const pass = generate({ nA: 3, nB: 2 });
	const pTokens = pass.seqsA.map(seqToken);
	assert.equal(new Set(pTokens).size, pTokens.length);
});

test('passing generator produces valid patterns', () => {
	const res = generate({ nA: 3, nB: 2 });
	assert.ok(res.interfaces.length > 0);
	let checked = 0;
	for (const itf of res.interfaces.slice(0, 10)) {
		const sa = res.seqsA[itf.aIdx[0]], sb = res.seqsB[itf.bIdx[0]];
		assert.equal(validatePair(sa, sb, res.cfg), []);
		checked++;
	}
	assert.ok(checked > 0);
});

test('solo generator: every pattern is valid, balls integer', () => {
	for (const [nR, nL, maxHeight] of [[3, 2, 8], [4, 3, 10], [2, 2, 8], [3, 1, 8]]) {
		const res = generateSolo({ nR, nL, maxHeight });
		assert.ok(res.patterns.length > 0, nR + ':' + nL + ' has patterns');
		for (const p of res.patterns) {
			assert.ok(Number.isInteger(p.balls));
			assert.equal(validatePair(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg), [],
				nR + ':' + nL + ' pattern ' + p.ia + '/' + p.ib);
		}
	}
});

test('solo generator: holds excluded by default, included on demand', () => {
	const noHolds = generateSolo({ nR: 3, nL: 2, maxHeight: 8 });
	for (const s of [...noHolds.seqsA, ...noHolds.seqsB])
		for (const o of s.throws)
			assert.ok(!(o.kind === 'self' && o.v === 1), 'no same-hand 1s');
	const withHolds = generateSolo({ nR: 3, nL: 2, maxHeight: 8, includeHolds: true });
	assert.ok(withHolds.patterns.length > noHolds.patterns.length);
});

test('solo generator: max height respected in global vanilla units', () => {
	const maxHeight = 6;
	const res = generateSolo({ nR: 3, nL: 2, maxHeight });
	const nFast = res.cfg.nFast;
	const check = (seqs, n, m) => {
		for (const s of seqs)
			for (const o of s.throws) {
				const own = o.kind === 'self' ? o.v : o.num / o.den;
				assert.ok(2 * own * nFast / n <= maxHeight + 1e-9);
			}
	};
	check(res.seqsA, res.cfg.nA, res.cfg.nB);
	check(res.seqsB, res.cfg.nB, res.cfg.nA);
});

test('solo jif completes, defaults to balls, has both hand tempos', () => {
	const res = generateSolo({ nR: 3, nL: 2, maxHeight: 8 });
	const p = res.patterns[0];
	const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
	assert.equal(jif.props.length, p.balls);
	for (const prop of jif.props)
		assert.equal(prop.type, 'ball');
	assert.equal(jif.limbs.length, 2);
	assert.equal(jif.jugglers.length, 1);
	assert.equal(jif.repetition.period, lcm(3, 2));
	for (const t of jif.throws) {
		assert.ok(t.duration > 0);
		// every catch is held for a while and every throw keeps an arc
		assert.ok(t.dwell > 0);
		assert.ok(t.dwell < t.duration);
		assert.type(t.spins, 'number');
	}
	const { jif: completed } = Jif.complete(jif, { expand: true });
	assert.ok(completed.throws.length >= jif.throws.length);
});

/*
 * The dwell is deducted from the end of the flight, so it is time the
 * *catching* hand holds the prop. Judging it in the throwing hand's rhythm
 * made the slow hand's throws land 2.5 ticks early in a 5:2 fast hand whose
 * own beats are only 2 ticks apart, so that hand held two props at once and
 * its animated path degenerated into a curve spanning nearly the whole period.
 */
test('solo jif: no hand ever holds two props at once', () => {
	const holdsPerHand = (sa, sb, cfg) => {
		const { jif } = Jif.complete(buildJifSolo(sa, sb, cfg), { expand: true });
		const period = jif.repetition.period;
		const perProp = Array.from({ length: jif.props.length }, () => []);
		for (const t of jif.throws)
			perProp[t.prop].push({ start: t.time, end: t.time + t.duration - t.dwell, from: t.from });
		const hands = Array.from({ length: jif.limbs.length }, () => []);
		for (const flights of perProp) {
			flights.sort((a, b) => a.start - b.start);
			flights.forEach((f, i) => {
				const caught = flights[(i + flights.length - 1) % flights.length].end % period;
				hands[f.from].push([caught, f.start + (f.start >= caught - 1e-9 ? 0 : period)]);
			});
		}
		return hands;
	};
	for (const [nR, nL] of [[5, 2], [3, 1], [3, 2], [4, 3], [5, 3], [5, 4]]) {
		const res = generateSolo({ nR, nL, maxHeight: 9 });
		for (const p of res.patterns.slice(0, 150)) {
			const sa = res.seqsA[p.ia], sb = res.seqsB[p.ib];
			for (const holds of holdsPerHand(sa, sb, res.cfg)) {
				holds.sort((a, b) => a[0] - b[0]);
				for (let i = 1; i < holds.length; i++)
					assert.ok(holds[i][0] >= holds[i - 1][1] - 1e-9,
						nR + ':' + nL + ' ' + soloHandSeq(sa) + ' | ' + soloHandSeq(sb) +
						' — hold ' + holds[i] + ' overlaps ' + holds[i - 1]);
			}
		}
	}
});

test('spins follow the global siteswap, not the thrower\'s own beats', () => {
	const L = lcm(5, 2), nFast = 5;

	// solo: scaled to the faster hand, one own beat spanning two siteswap beats
	const res = generateSolo({ nR: 5, nL: 2, maxHeight: 9 });
	const p = res.patterns.find(q => seqToken(res.seqsA[q.ia]) === '2.2.3.x3.x2'
		&& seqToken(res.seqsB[q.ib]) === 'x4.x6');
	assert.ok(p, 'sample pattern still generated');
	const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
	const want = new Map();
	const collect = (seq, n, m, limb) => {
		seq.throws.forEach((o, i) => {
			if (o.kind === 'self' && o.v === 0) return;
			const global = 2 * (o.kind === 'self' ? o.v * m : o.num) * nFast / (n * m);
			want.set(limb + '@' + i * (L / n), Math.max(0, Math.floor(global - 2)));
		});
	};
	collect(res.seqsA[p.ia], 5, 2, 0);
	collect(res.seqsB[p.ib], 2, 5, 1);
	for (const t of jif.throws)
		assert.is(t.spins, want.get(t.from + '@' + t.time), t.label + ' at t=' + t.time);
	// the left hand's global 8 counts locally as 3 1/5, which would be a single
	assert.is(jif.throws.find(t => t.from === 1 && t.duration === 8).spins, 6);

	// passing: each juggler's own beat is already a siteswap beat
	const pr = generate({ nA: 5, nB: 2, selfMax: 6, passMin: 2.5, passMax: 5 });
	const itf = pr.interfaces.find(i => i.nPasses > 0);
	const pj = buildJif(pr.seqsA[itf.aIdx[0]], pr.seqsB[itf.bIdx[0]], pr.cfg);
	for (const t of pj.throws)
		assert.is(t.spins, Math.max(0, Math.floor(t.duration / (L / nFast) - 2)), t.label);
	// the slow juggler spins for how long the club is up, not for its own count
	assert.ok(pj.throws.some(t => Math.max(0, Math.floor(t.duration / (L / (t.from < 2 ? 5 : 2)) - 2)) < t.spins),
		'local counting would understate the slow juggler');
});

test('passing jif prop type is configurable', () => {
	const res = generate({ nA: 3, nB: 2 });
	const itf = res.interfaces.find(i => i.nPasses > 0);
	const sa = res.seqsA[itf.aIdx[0]], sb = res.seqsB[itf.bIdx[0]];
	for (const type of ['club', 'ball']) {
		const jif = buildJif(sa, sb, res.cfg, null, type);
		for (const prop of jif.props)
			assert.equal(prop.type, type);
	}
});

test('solo notation: hand-local and global strings', () => {
	const res = generateSolo({ nR: 3, nL: 2, maxHeight: 8 });
	const p = res.patterns[0];
	const sa = res.seqsA[p.ia], sb = res.seqsB[p.ib];
	assert.equal(soloHandSeq(sa).split(' ').length, 3);
	assert.equal(soloHandSeq(sb).split(' ').length, 2);
	const global = soloGlobalSeq(sa, sb, res.cfg);
	// every non-zero throw is marked II (same hand) or X (crossing)
	const marks = (global.match(/II|X/g) || []).length;
	const throwCount = [...sa.throws, ...sb.throws].filter(o => !(o.kind === 'self' && o.v === 0)).length;
	assert.equal(marks, throwCount);
	// simultaneous first beats are grouped
	assert.ok(global.startsWith('('));
});

test.run();
