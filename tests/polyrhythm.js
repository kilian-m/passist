import { test } from 'uvu';
import * as assert from 'uvu/assert';
import Jif from '../src/lib/jif.mjs';
import {
	generate, generateSolo, buildJif, buildJifSolo, validatePair,
	soloHandSeq, soloGlobalSeq, lcm,
} from '../src/lib/polyrhythm.mjs';

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
	for (const [nR, nL, maxHeight] of [[3, 2, 4], [4, 3, 5], [2, 2, 4], [3, 1, 4]]) {
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
	const noHolds = generateSolo({ nR: 3, nL: 2, maxHeight: 4 });
	for (const s of [...noHolds.seqsA, ...noHolds.seqsB])
		for (const o of s.throws)
			assert.ok(!(o.kind === 'self' && o.v === 1), 'no same-hand 1s');
	const withHolds = generateSolo({ nR: 3, nL: 2, maxHeight: 4, includeHolds: true });
	assert.ok(withHolds.patterns.length > noHolds.patterns.length);
});

test('solo generator: max height respected in global units', () => {
	const maxHeight = 3;
	const res = generateSolo({ nR: 3, nL: 2, maxHeight });
	const nFast = res.cfg.nFast;
	const check = (seqs, n, m) => {
		for (const s of seqs)
			for (const o of s.throws) {
				const own = o.kind === 'self' ? o.v : o.num / o.den;
				assert.ok(own * nFast / n <= maxHeight + 1e-9);
			}
	};
	check(res.seqsA, res.cfg.nA, res.cfg.nB);
	check(res.seqsB, res.cfg.nB, res.cfg.nA);
});

test('solo jif completes, defaults to balls, has both hand tempos', () => {
	const res = generateSolo({ nR: 3, nL: 2, maxHeight: 4 });
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
		assert.ok(t.dwell < t.duration);
		assert.type(t.spins, 'number');
	}
	const { jif: completed } = Jif.complete(jif, { expand: true });
	assert.ok(completed.throws.length >= jif.throws.length);
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
	const res = generateSolo({ nR: 3, nL: 2, maxHeight: 4 });
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
