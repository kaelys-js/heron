/**
 * SvelteKit config — dual adapter.
 *
 * career-ops ships in two shapes:
 *
 *   1. Web/server build (default) — adapter-node, embedded inside the
 *      Electron app OR run remotely. Output goes to `build/` (Node entry).
 *
 *   2. Static shell build (CAPACITOR=1) — adapter-static, the Capacitor
 *      WebView's HTML/JS/CSS bundle. Output goes to `build/static/`. The
 *      WebView loads this shell, which immediately runs backend-discovery
 *      and connects to whichever backend is reachable.
 *
 * The same source code produces both. Server-only modules (`$lib/server/*`)
 * are tree-shaken out of the static build because they're never imported
 * by client code.
 */
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';

const CAPACITOR_BUILD = process.env.CAPACITOR === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
	},
	kit: {
		adapter: CAPACITOR_BUILD
			? staticAdapter({
				pages: 'build/static',
				assets: 'build/static',
				fallback: 'index.html',
				precompress: false,
				strict: false,
			})
			: nodeAdapter({
				out: 'build',
				precompress: false,
				envPrefix: '',
			}),
	},
};

export default config;
