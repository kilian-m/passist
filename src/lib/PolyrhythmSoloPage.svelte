<script>
	import { defaults, useLocalStorage } from '$lib/passist.mjs';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import AnimationWidget from '$lib/AnimationWidget.svelte';
	import InputField from '$lib/InputField.svelte';
	import Jif from '$lib/jif.mjs';
	import {
		generateSolo, buildJifSolo, validatePair,
		soloHandSeq, soloGlobalSeq, timelineSvg,
	} from '$lib/polyrhythm.mjs';

	let nR = 3, nL = 2, minHeight = 1, maxHeight = 4;
	let includeHolds = false, allowZero = false;
	let propType = 'ball';
	let ballFilter = -1;
	let res = null, genError = '', genInfo = '';
	let sel = null;      // selected pattern object from res.patterns
	let shown = 1;
	const PAGE = 100;
	let animationSpeed = defaults.animationSpeed;

	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || lo));

	$: regenerate(nR, nL, minHeight, maxHeight, includeHolds, allowZero);
	function regenerate() {
		genError = '';
		try {
			const t0 = Date.now();
			res = generateSolo({
				nR: clamp(nR, 1, 9), nL: clamp(nL, 1, 9),
				minHeight: clamp(minHeight, 0.5, 9),
				maxHeight: clamp(maxHeight, 1, 12),
				includeHolds, allowZero,
			});
			genInfo = res.patterns.length.toLocaleString() + ' patterns (' + (Date.now() - t0) + ' ms)';
		} catch (e) {
			res = null;
			genError = e.message || String(e);
		}
		sel = null;
		shown = 1;
	}

	$: ballOptions = res ? [...new Set(res.patterns.map(p => p.balls))].sort((a, b) => a - b) : [];
	$: if (res && ballFilter >= 0 && !ballOptions.includes(ballFilter)) ballFilter = -1;
	$: list = res ? res.patterns.filter(p => ballFilter < 0 || p.balls === ballFilter) : [];
	$: if (res && (!sel || !list.includes(sel))) sel = list[0] || null;

	$: pattern = (sel && res) ? buildPattern(sel, propType) : null;
	function buildPattern(p, pt) {
		const sa = res.seqsA[p.ia], sb = res.seqsB[p.ib];
		const jifRaw = buildJifSolo(sa, sb, res.cfg, pt);
		const problems = validatePair(sa, sb, res.cfg);
		let completed = null, warnings = [];
		try {
			const c = Jif.complete(jifRaw, { expand: true, propType: pt });
			completed = c.jif; warnings = c.warnings;
		} catch (e) {
			warnings = [String(e)];
		}
		return {
			sa, sb, jifRaw, completed, warnings, problems,
			jifString: JSON.stringify(jifRaw, null, 2),
			balls: p.balls, nCross: p.nCross,
			periodTicks: jifRaw.repetition.period,
			svg: timelineSvg(sa, sb, res.cfg, null, { solo: true, labels: ['R', 'L'] }),
		};
	}

	function openInJifPage() {
		if (!pattern) return;
		if (useLocalStorage)
			localStorage.setItem('jif', pattern.jifString);
		goto(base + '/jif');
	}
	let savelink;
	function saveJif() {
		if (!pattern) return;
		savelink.href = window.URL.createObjectURL(new Blob([pattern.jifString], { type: 'application/jif+json' }));
	}
	$: saveName = pattern ?
		('solo-poly-' + res.cfg.nA + '-' + res.cfg.nB + '-' + soloHandSeq(pattern.sa) + '-' + soloHandSeq(pattern.sb)).replace(/[^\w.-]+/g, '_') + '.jif'
		: 'pattern.jif';
</script>

<style>
	.tabs { display:flex; gap:0.3em; margin-bottom:1em }
	.tabs a { padding:0.3em 1.1em; border:1px solid #ddd; border-radius:4px 4px 0 0; border-bottom:none;
		text-decoration:none; color:#555; background:#f0f0f0 }
	.tabs a.active { background:#fff; color:#16697a; font-weight:700; border-color:#bbb }

	.controls { display:flex; flex-wrap:wrap; align-items:flex-end; gap:0 0.5em }
	.checks { display:flex; flex-wrap:wrap; gap:1.5em; margin:0 1em 1em 0; align-items:center }
	.geninfo { color:#666; font-size:0.85em; margin-bottom:1em }
	.generror { color:#dc3545; margin-bottom:1em }

	.panel { border:1px solid #ddd; border-radius:4px; overflow:hidden; background:#fff; max-width:70em }
	.phead { display:flex; justify-content:space-between; align-items:center; gap:0.5em;
		padding:0.4em 0.7em; border-bottom:1px solid #ddd; background:#f7f7f7;
		font-size:0.8em; text-transform:uppercase; letter-spacing:0.06em; color:#555 }
	.phead select { font-size:1em; max-width:10em }
	.list { max-height:26em; overflow-y:auto }
	.row { display:grid; grid-template-columns:1fr 1fr 1.7fr auto; gap:0.8em; align-items:center;
		padding:0.35em 0.7em; cursor:pointer; border-bottom:1px solid #eee; font-size:0.95em }
	.row.hdr { cursor:default; font-size:0.75em; text-transform:uppercase; letter-spacing:0.05em;
		color:#888; background:#fbfbfb; position:sticky; top:0 }
	@media (max-width:50em) { .row { grid-template-columns:1fr 1fr; } .row .glob { grid-column:1 / -1 } }
	.row:hover:not(.hdr) { background:#f0f6f8 }
	.row.sel { background:#e3eff1; box-shadow:inset 3px 0 0 #16697a }
	.row .meta { font-size:0.8em; color:#888; white-space:nowrap; text-align:right }
	.seqstr { font-family:ui-monospace, Menlo, Consolas, monospace; font-variant-numeric:tabular-nums;
		white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
	.seqstr :global(sub.orient) { font-size:0.6em }
	.seqstr :global(.frac) { display:inline-flex; flex-direction:column; align-items:center;
		font-size:0.48em; line-height:1.1; vertical-align:middle; margin:0 0.1em }
	.seqstr :global(.frac .fn) { border-bottom:1px solid currentColor; padding:0 0.2em }
	.hR, .seqstr :global(.hR) { color:#16697a }
	.hL, .seqstr :global(.hL) { color:#c05621 }
	.more { width:100%; border:none; background:#f0f0f0; padding:0.4em; cursor:pointer }
	.empty { padding:1.5em; text-align:center; color:#888 }

	.pattern { margin-top:1em }
	.patstr { display:grid; grid-template-columns:auto 1fr; gap:0.2em 0.8em; align-items:baseline }
	.patstr .who { font-weight:700 }
	.patstr .who.r { color:#16697a } .patstr .who.l { color:#c05621 }
	.patstr .seqstr { font-size:1.4em; overflow-x:auto; text-overflow:clip }
	.badges { display:flex; flex-wrap:wrap; gap:0.5em; margin:0.6em 0; font-size:0.85em }
	.badge { padding:0.1em 0.7em; border-radius:99px; background:#f0f0f0; border:1px solid #ddd; color:#555 }
	.badge.ok { color:#2f7d4f; border-color:#2f7d4f }
	.badge.err { color:#b3382f; border-color:#b3382f }
	.svgwrap { overflow-x:auto; margin:0.5em 0 }
	.jifbtns { display:flex; flex-wrap:wrap; gap:0.6em; margin:0.6em 0 }
	.warnings { color:orange }
	.animwrap { max-width:56em }
	.animbox { height:26em }
	label.pure-button { margin:0 }
</style>

<h1>Solo polyrhythmic juggling</h1>

<div class=tabs>
	<a href="{base}/polyrhythm">Passing</a>
	<a href="{base}/polyrhythm/solo" class=active aria-current=page>Solo</a>
</div>

<p>
	One juggler, hands at different tempos: the <b class=hR>right hand</b> throws {nR}
	and the <b class=hL>left hand</b> {nL} times per cycle. Hand-local values are counted in the
	<b>throwing hand's own beats</b> (crossing throws land on the other hand's grid, so they carry
	fractions and an <span class=seqstr><sub class=orient>X</sub></span>). The global notation merges
	both hands in time order and scales every value to <b>beats of the faster hand</b>:
	<span class=seqstr><sub class=orient>II</sub></span> = stays in the same hand,
	<span class=seqstr><sub class=orient>X</sub></span> = crosses. Heights are limited in global beats.
</p>

<div class=controls>
	<InputField bind:value={nR} type=number id=nr label="beats right" min=1 max=9 defaultValue=3 />
	<InputField bind:value={nL} type=number id=nl label="beats left" min=1 max=9 defaultValue=2 />
	<InputField bind:value={minHeight} type=number id=minheight label="min height" min=0.5 max=9 step=0.5 defaultValue=1 />
	<InputField bind:value={maxHeight} type=number id=maxheight label="max height" min=1 max=12 step=0.5 defaultValue=4 />
</div>
<div class=checks>
	<label><input type=checkbox bind:checked={includeHolds}> include holds (same-hand 1s)</label>
	<label><input type=checkbox bind:checked={allowZero}> allow 0 (empty beat)</label>
</div>
{#if genError}<div class=generror>{genError}</div>{:else}<div class=geninfo>{genInfo}</div>{/if}

{#if res}
<div class=panel>
	<div class=phead><span>Patterns</span>
		<select bind:value={ballFilter} on:change={() => shown = 1}>
			<option value={-1}>any # balls</option>
			{#each ballOptions as b}<option value={b}>{b} ball{b == 1 ? '' : 's'}</option>{/each}
		</select>
	</div>
	<div class=list>
		<div class="row hdr">
			<span class=hR>right hand</span><span class=hL>left hand</span>
			<span class=glob>global (beats of the faster hand)</span><span></span>
		</div>
		{#each list.slice(0, shown * PAGE) as p (p.ia + ':' + p.ib)}
		<div class=row class:sel={sel === p} on:click={() => sel = p}
			on:keydown={e => (e.key == 'Enter' || e.key == ' ') && (sel = p)} tabindex=0 role=button>
			<span class="seqstr hR">{@html soloHandSeq(res.seqsA[p.ia], true)}</span>
			<span class="seqstr hL">{@html soloHandSeq(res.seqsB[p.ib], true)}</span>
			<span class="seqstr glob">{@html soloGlobalSeq(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg, true)}</span>
			<span class=meta>{p.balls} ball{p.balls == 1 ? '' : 's'} · {p.nCross} ✕</span>
		</div>
		{/each}
		{#if list.length > shown * PAGE}
		<button class=more on:click={() => shown++}>show more ({(list.length - shown * PAGE).toLocaleString()} hidden)</button>
		{/if}
		{#if !list.length}<div class=empty>no patterns match</div>{/if}
	</div>
</div>
{/if}

{#if pattern}
<div class=pattern>
	<div class=patstr>
		<span class="who r">R</span><span class=seqstr>{@html soloHandSeq(pattern.sa, true)}</span>
		<span class="who l">L</span><span class=seqstr>{@html soloHandSeq(pattern.sb, true)}</span>
		<span class=who>&Sigma;</span><span class=seqstr>{@html soloGlobalSeq(pattern.sa, pattern.sb, res.cfg, true)}</span>
	</div>
	<div class=badges>
		<span class=badge>{pattern.balls} ball{pattern.balls == 1 ? '' : 's'}</span>
		<span class=badge>{pattern.nCross} crossing throw{pattern.nCross == 1 ? '' : 's'} per cycle</span>
		<span class=badge>period {pattern.periodTicks} ticks = 1 cycle</span>
		{#if pattern.problems.length}
			<span class="badge err">✗ {pattern.problems[0]}</span>
		{:else}
			<span class="badge ok">✓ verified valid</span>
		{/if}
	</div>

	{#if pattern.completed}
	<div class=animwrap>
		<div class=animbox>
			<AnimationWidget jif={pattern.completed} animationSpeed={parseFloat(animationSpeed)} />
		</div>
		<div class=controls>
			<InputField id=proptype type=custom label="Prop type">
				<label class="pure-button" class:pure-button-active={propType == 'ball'}>
					<input type="radio" bind:group={propType} value="ball" autocomplete="off"> Balls
				</label>
				<label class="pure-button" class:pure-button-active={propType == 'club'}>
					<input type="radio" bind:group={propType} value="club" autocomplete="off"> Clubs
				</label>
			</InputField>
			<InputField
				bind:value={animationSpeed}
				type=range
				id=animationspeed
				label='Animation speed'
				step=0.1 min=0.1 max=2
				defaultValue={defaults.animationSpeed}
			/>
		</div>
	</div>
	{/if}
	{#if pattern.warnings.length}
	<ul class=warnings>{#each pattern.warnings as w}<li>{w}</li>{/each}</ul>
	{/if}

	<div class=svgwrap>{@html pattern.svg}</div>

	<div class=jifbtns>
		<button class=pure-button on:click={openInJifPage}>open in jif editor</button>
		<a href="{base}/jif" bind:this={savelink} class=pure-button download={saveName} on:click={saveJif}>save .jif</a>
	</div>
</div>
{/if}
