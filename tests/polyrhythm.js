import { test } from 'uvu';
import * as assert from 'uvu/assert';
import Jif from '../src/lib/jif.mjs';
import {
	generate, generateSolo, buildJif, buildJifSolo, validatePair,
	soloHandSeq, soloGlobalSeq, lcm, seqToken, soloJugglingSpeed,
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

/*
 * Arcs are simulated ballistically against a fixed gravity and peak height goes
 * with the square of the flight in seconds, so the tempo decides how high a
 * throw looks. Running the global siteswap at one beat per beat of a normal
 * siteswap is what makes a global 5 fly like a 5 anywhere else.
 */
test('solo jif: the faster hand throws at plain siteswap tempo', () => {
	for (const [nR, nL] of [[5, 2], [3, 2], [5, 4], [3, 1], [7, 5]]) {
		const res = generateSolo({ nR, nL, maxHeight: 9 });
		const p = res.patterns[0];
		const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
		const L = lcm(nR, nL), fastTick = L / Math.max(nR, nL);
		// a hand of a vanilla siteswap throws every second beat
		assert.is(fastTick / jif.timeStretchFactor, 2, nR + ':' + nL);
	}
});

test('solo juggling speed hits the asked-for throw rate for the faster hand', () => {
	// the animation advances jugglingSpeed * animationSpeed beats per second and
	// the faster hand throws every second beat, so this is the rate it runs at
	const rate = (js, as) => 30 * js * as;
	for (const tpm of [85, 60, 120])
		for (const animationSpeed of [0.8, 1, 0.5]) {
			const js = soloJugglingSpeed(tpm, animationSpeed);
			assert.ok(Math.abs(rate(js, animationSpeed) - tpm) < 1e-9, tpm + ' at ' + animationSpeed);
		}

	// and the "every second beat" the rate rests on holds for every ratio
	for (const [nR, nL] of [[5, 2], [3, 2], [5, 4], [3, 1], [7, 5]]) {
		const res = generateSolo({ nR, nL, maxHeight: 9 });
		const p = res.patterns[0];
		const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
		const throws = jif.throws.filter(t => t.from === (nR >= nL ? 0 : 1)).map(t => t.time).sort((a, b) => a - b);
		assert.is(throws[1] - throws[0], 2 * jif.timeStretchFactor, nR + ':' + nL);
	}
});

/*
 * A club only turns while it is in the air, and how much of a throw's value is
 * flight depends on which hand catches it. At 3:2 the right hand's global 3
 * crosses into the slow left hand, which holds it for two of its three beats —
 * one beat of flight, a hand-over. The left hand's global 3 goes to the fast
 * hand instead and flies for 1 2/3, a real single.
 */
test('solo spins: a throw that is mostly carried does not spin', () => {
	const res = generateSolo({ nR: 3, nL: 2, minHeight: 2, maxHeight: 9 });
	const p = res.patterns.find(q => seqToken(res.seqsA[q.ia]) === 'x1.3.x2'
		&& seqToken(res.seqsB[q.ib]) === 'x2.x3');
	assert.ok(p, 'sample pattern still generated');
	const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
	const globalBeat = jif.timeStretchFactor;
	const both = jif.throws.filter(t => Math.abs(t.duration / globalBeat - 3) < 1e-9);
	assert.is(both.length, 2, 'the pattern has a global 3 into each hand');
	const intoSlow = both.find(t => t.to === 1), intoFast = both.find(t => t.to === 0);
	assert.ok((intoSlow.duration - intoSlow.dwell) / globalBeat < 1.5, 'carried, barely flies');
	assert.is(intoSlow.spins, 0, 'a hand-over does not spin');
	assert.ok((intoFast.duration - intoFast.dwell) / globalBeat > 1.5, 'a real throw');
	assert.is(intoFast.spins, 1, 'the same notated value into the fast hand is a single');
});

test('spins follow the global siteswap, not the thrower\'s own beats', () => {
	const L = lcm(5, 2), nFast = 5;

	// solo: scaled to the faster hand, one own beat spanning two siteswap beats
	const res = generateSolo({ nR: 5, nL: 2, maxHeight: 9 });
	const p = res.patterns.find(q => seqToken(res.seqsA[q.ia]) === '2.2.3.x3.x2'
		&& seqToken(res.seqsB[q.ib]) === 'x4.x6');
	assert.ok(p, 'sample pattern still generated');
	const jif = buildJifSolo(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg);
	const globalBeat = L / (2 * nFast);
	const pair = h => Math.max(0, Math.floor((h - 1) / 2));

	// everything the faster hand catches dwells the same however it was thrown,
	// so those follow the pairing on their notated value: 3 and 4 single, 5 and
	// 6 double, 7 and 8 triple
	let fastCatches = 0;
	for (const t of jif.throws)
		if (t.to === 0) {
			assert.is(t.spins, pair(t.duration / globalBeat), t.label + ' caught by the fast hand');
			fastCatches++;
		}
	assert.ok(fastCatches >= 4, 'sample covers the fast hand');
	// the left hand's global 8 counts locally as 3 1/5, which would be a single
	assert.is(jif.throws.find(t => t.from === 1 && t.duration === 8).spins, 3);

	// passing: each juggler's own beat is already a siteswap beat, and what the
	// faster juggler catches dwells the same however it was thrown, so those sit
	// on the same pairing as solo — one count for both pages
	const pr = generate({ nA: 5, nB: 2, selfMax: 6, passMin: 2.5, passMax: 5 });
	const itf = pr.interfaces.find(i => i.nPasses > 0);
	const pj = buildJif(pr.seqsA[itf.aIdx[0]], pr.seqsB[itf.bIdx[0]], pr.cfg);
	let fastCaught = 0;
	for (const t of pj.throws)
		if (t.to < 2) {
			assert.is(t.spins, pair(t.duration / (L / nFast)), t.label + ' caught by the fast juggler');
			fastCaught++;
		}
	assert.ok(fastCaught > 0, 'sample covers the fast juggler');
	// the slow juggler's own count would understate how long its clubs are up
	assert.ok(pj.throws.some(t => t.from >= 2 && t.to < 2 && pair(t.duration / (L / 2)) < t.spins),
		'local counting would understate the slow juggler');
});

/*
 * 5:7 with B the faster juggler: B's own beat is the global beat, so its 4s are
 * global 4s and pair down to singles the same way the fast hand's do on the solo
 * page. A is slower, so the same notated 4 is a global 5.6 and stays a double.
 */
test('passing spins: the faster juggler\'s 4s are singles', () => {
	const res = generate({ nA: 5, nB: 7, selfMax: 4, passMin: 2.5, passMax: 4.5 });
	let sa = null, sb = null;
	for (const itf of res.interfaces) {
		const a = itf.aIdx.find(i => seqToken(res.seqsA[i]) === '1.3.x7.4.4');
		const b = itf.bIdx.find(i => seqToken(res.seqsB[i]) === '1.3.3.3.x5.4.4');
		if (a !== undefined && b !== undefined) { sa = res.seqsA[a]; sb = res.seqsB[b]; break; }
	}
	assert.ok(sa && sb, 'sample pattern still generated');
	const jif = buildJif(sa, sb, res.cfg);
	const four = j => jif.throws.find(t => (j === 'A' ? t.from < 2 : t.from >= 2) && t.label === '4');
	assert.is(four('B').spins, 1, "the faster juggler's 4 is a single");
	assert.is(four('A').spins, 2, "the slower juggler's 4 is a global 5.6 and stays a double");
});

/*
 * The passing builder had the same latent fault the solo one did: it set no
 * dwell, so the animation derived one from the *thrower's* beat. At 5:2 the
 * slow juggler's throws then carried a dwell of 125% of the catching hand's
 * gap, leaving that hand holding two clubs at once.
 */
test('passing jif: no hand ever holds two props at once', () => {
	for (const [nA, nB] of [[5, 2], [3, 2], [4, 3], [5, 3], [3, 1]]) {
		const pr = generate({ nA, nB, selfMax: 6, passMin: 2.5, passMax: 5 });
		for (const itf of pr.interfaces.slice(0, 10)) {
			const raw = buildJif(pr.seqsA[itf.aIdx[0]], pr.seqsB[itf.bIdx[0]], pr.cfg);
			const { jif } = Jif.complete(raw, { expand: true });
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
			for (const holds of hands) {
				holds.sort((a, b) => a[0] - b[0]);
				for (let i = 1; i < holds.length; i++)
					assert.ok(holds[i][0] >= holds[i - 1][1] - 1e-9,
						nA + ':' + nB + ' hold ' + holds[i] + ' overlaps ' + holds[i - 1]);
			}
		}
	}
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
