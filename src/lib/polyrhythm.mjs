/*
 * Generator for polyrhythmic passing patterns.
 *
 * Two jugglers A and B share a common cycle of duration 1. A has nA throw
 * beats per cycle (at times i/nA), B has nB (at times j/nB). Each juggler
 * alternates hands R,L,R,L,... on their own beats, starting with R at t=0.
 *
 * Throw values are given in the thrower's own beats (value = time until the
 * club is thrown again, in thrower beats), so a self "3" means the same for
 * both jugglers even though its absolute duration differs.
 *
 * Selfs must land back on the thrower's own beat grid => integer values.
 * Passes must land on the partner's beat grid: a pass by A at beat i landing
 * on the partner's absolute beat j has value p = nA*j/nB - i (a fraction
 * with denominator nB).
 *
 * A pass is "straight" (II, right->left when facing each other) iff the
 * parity of the thrower's global beat differs from the catcher's.
 * If nA+nB is odd this label alternates every cycle (altOrient).
 *
 * An interface is the contract between the two sides: (SA, SB) with
 * SA = beats where A receives a pass (= landing beats of B's passes) and
 * SB = beats where B receives. Any A-sequence and B-sequence with matching
 * interfaces combine into a valid pattern.
 */

export function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export function lcm(a, b) { return a / gcd(a, b) * b; }
export function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBD = '₀₁₂₃₄₅₆₇₈₉';
const sup = n => String(n).split('').map(d => SUPD[+d]).join('');
const sub = n => String(n).split('').map(d => SUBD[+d]).join('');

export const defaultConfig = {
	nA: 5,
	nB: 7,
	selfMax: 4,       // inclusive; selfs are integers 0..selfMax (0 = empty beat)
	passMin: 2.5,     // inclusive
	passMax: 4.5,     // inclusive
	allowZero: false,
	excludeHolds: false, // drop self 2s (a 2 stays in the same hand = hold)
};

export const MAX_SEQS = 600000;

function makeOptions(n, m, cfg) {
	const beats = [];
	for (let i = 0; i < n; i++) {
		const list = [];
		const lo = cfg.allowZero ? 0 : 1;
		for (let v = lo; v <= cfg.selfMax; v++) {
			if (cfg.excludeHolds && v === 2)
				continue;
			list.push({ kind: 'self', v, land: (i + v) % n, num: v * m });
		}
		const jLo = Math.ceil(m * (i + cfg.passMin) / n - 1e-9);
		const jHi = Math.floor(m * (i + cfg.passMax) / n + 1e-9); // inclusive
		for (let jAbs = jLo; jAbs <= jHi; jAbs++) {
			list.push({
				kind: 'pass', num: n * jAbs - i * m, den: m, jAbs, jMod: jAbs % m,
				straight: (i % 2) !== (jAbs % 2),
				altOrient: (n + m) % 2 === 1,
			});
		}
		beats.push(list);
	}
	return beats;
}

function enumerate(n, m, cfg) {
	const opts = makeOptions(n, m, cfg);
	const seqs = [];
	const choice = new Array(n);
	const full = (1 << n) - 1;
	function dfs(i, selfLand, passLand, zeros) {
		if (i === n) {
			if (seqs.length >= MAX_SEQS)
				throw new Error('more than ' + MAX_SEQS.toLocaleString() +
					' sequences for one juggler — reduce beats per cycle, lower the max self, or narrow the pass range');
			let nonzero = 0;
			for (let b = 0; b < n; b++) {
				const o = choice[b];
				if (!(o.kind === 'self' && o.v === 0)) nonzero |= 1 << b;
			}
			let num = 0;
			for (const o of choice) num += o.num;
			seqs.push({ throws: choice.slice(), recv: nonzero & ~selfLand & full, out: passLand, num });
			return;
		}
		for (const o of opts[i]) {
			if (o.kind === 'self') {
				if (o.v === 0) {
					if (selfLand & (1 << i)) continue;
					choice[i] = o;
					dfs(i + 1, selfLand, passLand, zeros | (1 << i));
				} else {
					const b = 1 << o.land;
					if ((selfLand & b) || (zeros & b)) continue;
					choice[i] = o;
					dfs(i + 1, selfLand | b, passLand, zeros);
				}
			} else {
				const b = 1 << o.jMod;
				if (passLand & b) continue;
				choice[i] = o;
				dfs(i + 1, selfLand, passLand | b, zeros);
			}
		}
	}
	dfs(0, 0, 0, 0);
	return seqs;
}

export function generate(cfg) {
	cfg = Object.assign({}, defaultConfig, cfg);
	const seqsA = enumerate(cfg.nA, cfg.nB, cfg);
	const seqsB = enumerate(cfg.nB, cfg.nA, cfg);
	const mapA = new Map(), mapB = new Map();
	seqsA.forEach((s, i) => {
		const k = s.recv + ':' + s.out;
		if (!mapA.has(k)) mapA.set(k, []);
		mapA.get(k).push(i);
	});
	seqsB.forEach((s, i) => {
		const k = s.recv + ':' + s.out;
		if (!mapB.has(k)) mapB.set(k, []);
		mapB.get(k).push(i);
	});
	const interfaces = [];
	for (const [k, aIdx] of mapA) {
		const parts = k.split(':').map(Number);
		const bIdx = mapB.get(parts[1] + ':' + parts[0]);
		if (bIdx) interfaces.push({ SA: parts[0], SB: parts[1], nPasses: popcount(parts[0]), aIdx, bIdx });
	}
	interfaces.sort((x, y) => x.nPasses - y.nPasses || x.SA - y.SA || x.SB - y.SB);
	// show "natural" sequences first: average throw value closest to 3
	const target = 3 * cfg.nA * cfg.nB;
	const byNum = seqs => (i, j) =>
		Math.abs(seqs[i].num - target) - Math.abs(seqs[j].num - target) || seqs[i].num - seqs[j].num || i - j;
	for (const itf of interfaces) {
		itf.aIdx.sort(byNum(seqsA));
		itf.bIdx.sort(byNum(seqsB));
	}
	return { cfg, seqsA, seqsB, interfaces };
}

export function maskToBeats(mask, n) {
	const r = [];
	for (let b = 0; b < n; b++) if (mask & (1 << b)) r.push(b);
	return r;
}

export function throwLabel(o, html) {
	if (o.kind === 'self') return String(o.v);
	const whole = Math.floor(o.num / o.den), rem = o.num % o.den;
	let s = whole || !rem ? String(whole) : '';
	const orient = o.altOrient ? 'X↔II' : (o.straight ? 'II' : 'X');
	if (!rem)
		return html ? s + '<sub class="orient">' + orient + '</sub>' : s + orient;
	const g = gcd(rem, o.den);
	if (html)
		return s + '<span class="frac"><span class="fn">' + (rem / g) + '</span><span>' + (o.den / g) +
			'</span></span><sub class="orient">' + orient + '</sub>';
	return s + sup(rem / g) + '⁄' + sub(o.den / g) + orient;
}

export function seqString(seq, html, markRecv) {
	return seq.throws.map((o, i) => {
		let s = throwLabel(o, html);
		if (html && markRecv && (seq.recv & (1 << i))) s = '<span class="recv">' + s + '</span>';
		return s;
	}).join(' ');
}

export function clubCount(sa, sb, cfg) { return (sa.num + sb.num) / (cfg.nA * cfg.nB); }

export function buildJif(seqA, seqB, cfg, names) {
	names = names || ['A', 'B'];
	const nA = cfg.nA, nB = cfg.nB;
	const L = lcm(nA, nB);
	const periodCycles = (nA % 2 === 0 && nB % 2 === 0) ? 1 : 2;
	const throws = [];
	const add = (seq, n, m, limbBase, otherBase) => {
		const tick = L / n, otherTick = L / m;
		for (let c = 0; c < periodCycles; c++) {
			seq.throws.forEach((o, i) => {
				const g = c * n + i;
				const time = g * tick;
				if (o.kind === 'self') {
					if (o.v === 0) return;
					throws.push({ time, duration: o.v * tick,
						from: limbBase + (g % 2), to: limbBase + ((g + o.v) % 2), label: throwLabel(o) });
				} else {
					throws.push({ time, duration: o.jAbs * otherTick - i * tick,
						from: limbBase + (g % 2), to: otherBase + ((c * m + o.jAbs) % 2), label: throwLabel(o) });
				}
			});
		}
	};
	add(seqA, nA, nB, 0, 2);
	add(seqB, nB, nA, 2, 0);
	throws.sort((a, b) => a.time - b.time || a.from - b.from);
	const strA = seqString(seqA), strB = seqString(seqB);
	return {
		jif: '0.01',
		meta: {
			name: 'polyrhythm ' + nA + ':' + nB + '  A: ' + strA + '  B: ' + strB,
			description: 'Polyrhythmic passing pattern, ' + nA + ' beats per cycle for ' + names[0] +
				' against ' + nB + ' for ' + names[1] + '. Throw values are in the thrower\'s own beats. ' +
				'Time unit: 1/' + L + ' cycle.',
			generator: 'polyrhythm-passing-generator',
		},
		highLevelDescription: { type: 'polyrhythmicSiteswap', description: names[0] + ': ' + strA + ' | ' + names[1] + ': ' + strB },
		jugglers: [
			{ name: names[0], position: [1.6, 0, 0], lookAt: [0, 0, 0] },
			{ name: names[1], position: [-1.6, 0, 0], lookAt: [0, 0, 0] },
		],
		limbs: [
			{ juggler: 0, type: 'right hand' }, { juggler: 0, type: 'left hand' },
			{ juggler: 1, type: 'right hand' }, { juggler: 1, type: 'left hand' },
		],
		props: Array.from({ length: clubCount(seqA, seqB, cfg) }, () => ({ type: 'club' })),
		timeStretchFactor: 2 * L / (nA + nB),
		repetition: { period: periodCycles * L },
		throws,
	};
}

// Independent validity check: simulates one structural period and verifies
// every throwing beat receives exactly one club, empty beats none, and the
// club count is an integer. Returns a list of problems (empty = valid).
export function validatePair(seqA, seqB, cfg) {
	const nA = cfg.nA, nB = cfg.nB, L = lcm(nA, nB);
	const problems = [];
	const landings = new Map();
	const add = (seq, n, m, self, other) => {
		const tick = L / n, otherTick = L / m;
		seq.throws.forEach((o, i) => {
			let target, landTick;
			if (o.kind === 'self') {
				if (o.v === 0) return;
				target = self; landTick = (i + o.v) * tick;
			} else { target = other; landTick = o.jAbs * otherTick; }
			const k = target + ':' + (((landTick % L) + L) % L);
			landings.set(k, (landings.get(k) || 0) + 1);
		});
	};
	add(seqA, nA, nB, 'A', 'B');
	add(seqB, nB, nA, 'B', 'A');
	const check = (seq, n, who) => {
		const tick = L / n;
		seq.throws.forEach((o, i) => {
			const k = who + ':' + i * tick;
			const got = landings.get(k) || 0;
			const want = (o.kind === 'self' && o.v === 0) ? 0 : 1;
			if (got !== want) problems.push(who + ' beat ' + i + ': expects ' + want + ' landing(s), got ' + got);
			landings.delete(k);
		});
	};
	check(seqA, nA, 'A');
	check(seqB, nB, 'B');
	for (const e of landings) problems.push(e[1] + ' landing(s) at ' + e[0] + ' where nobody throws');
	const clubs = clubCount(seqA, seqB, cfg);
	if (!Number.isInteger(clubs)) problems.push('club count not integer: ' + clubs);
	return problems;
}

// Timeline of both jugglers' throws over two cycles as an svg string.
export function timelineSvg(sa, sb, cfg, colors) {
	const { cA, cB, cLine, cSoft } = Object.assign(
		{ cA: '#16697a', cB: '#c05621', cLine: '#ccc', cSoft: '#888' }, colors);
	const nA = cfg.nA, nB = cfg.nB;
	const cycles = 2, cw = 380, x0 = 34, W = x0 + cycles * cw + 40, H = 240;
	const yA = 62, yB = 178;
	let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
		'aria-label="timeline of throws over two cycles">';
	for (let c = 0; c <= cycles; c++) {
		const x = x0 + c * cw;
		s += '<line x1="' + x + '" y1="26" x2="' + x + '" y2="' + (H - 26) + '" stroke="' + cLine + '" stroke-dasharray="3 4"/>';
		if (c < cycles) s += '<text x="' + (x + 4) + '" y="20" font-size="11" fill="' + cSoft + '">cycle ' + c + '</text>';
	}
	s += '<line x1="' + x0 + '" y1="' + yA + '" x2="' + (W - 30) + '" y2="' + yA + '" stroke="' + cLine + '"/>';
	s += '<line x1="' + x0 + '" y1="' + yB + '" x2="' + (W - 30) + '" y2="' + yB + '" stroke="' + cLine + '"/>';
	s += '<text x="8" y="' + (yA + 4) + '" font-size="13" font-weight="700" fill="' + cA + '">A</text>';
	s += '<text x="8" y="' + (yB + 4) + '" font-size="13" font-weight="700" fill="' + cB + '">B</text>';
	const X = t => x0 + t * cw;
	const arcs = [], marks = [];
	const draw = (seq, n, m, y, yOther, color, self) => {
		for (let c = -1; c < cycles; c++) {
			seq.throws.forEach((o, i) => {
				const t1 = c + i / n;
				const g = ((c % 2) + 2) * n + i;
				if (t1 >= 0) {
					const hand = g % 2 ? 'L' : 'R';
					marks.push('<circle cx="' + X(t1) + '" cy="' + y + '" r="' + ((seq.recv >> i) & 1 ? 5.5 : 3.5) +
						'" fill="' + ((seq.recv >> i) & 1 ? 'none' : color) + '" stroke="' + color + '" stroke-width="1.6"/>' +
						'<text x="' + X(t1) + '" y="' + (y + (self === 'A' ? -34 : 40)) + '" font-size="9.5" fill="' + cSoft +
						'" text-anchor="middle">' + hand + '</text>');
				}
				if (o.kind === 'self') {
					if (o.v === 0) return;
					const t2 = t1 + o.v / n;
					if (t2 < -0.02 || t1 > cycles) return;
					const bow = self === 'A' ? -1 : 1;
					arcs.push('<path d="M' + X(t1) + ' ' + y + ' Q' + X((t1 + t2) / 2) + ' ' +
						(y + bow * (14 + 20 * o.v / n)) + ' ' + X(t2) + ' ' + y + '" fill="none" stroke="' + color +
						'" stroke-width="1.4" opacity="0.55"/>');
				} else {
					const t2 = (c * m + o.jAbs) / m;
					if (t2 < -0.02 || t1 > cycles) return;
					const dash = o.straight ? '' : ' stroke-dasharray="5 4"';
					arcs.push('<path d="M' + X(t1) + ' ' + y + ' Q' + X((t1 + t2) / 2) + ' ' + ((y + yOther) / 2) +
						' ' + X(t2) + ' ' + yOther + '" fill="none" stroke="' + color + '" stroke-width="2"' + dash + '/>');
				}
			});
		}
	};
	draw(sa, nA, nB, yA, yB, cA, 'A');
	draw(sb, nB, nA, yB, yA, cB, 'B');
	s += arcs.join('') + marks.join('');
	s += '<text x="' + x0 + '" y="' + (H - 8) + '" font-size="11" fill="' + cSoft +
		'">passes: solid = straight II, dashed = crossing X · open circle = receives</text>';
	return s + '</svg>';
}
