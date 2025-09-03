// @ts-check
require('esbuild').context({
	entryPoints: {
		extension: './src/extension.ts',
	},
	sourcemap: true,
	bundle: true,
	metafile: process.argv.includes('--metafile'),
	outdir: './dist',
	external: [
		'vscode',
	],
	format: 'cjs',
	platform: 'node',
	tsconfig: './tsconfig.json',
	define: { 'process.env.NODE_ENV': '"production"' },
	minify: process.argv.includes('--minify'),
}).then(async ctx => {
	console.log('building...');
	if (process.argv.includes('--watch')) {
		await ctx.watch();
		console.log('watching...');
	}
	else {
		await ctx.rebuild();
		await ctx.dispose();
		console.log('finished.');
	}
});
