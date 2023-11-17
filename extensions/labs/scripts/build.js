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
	plugins: [
		require('esbuild-plugin-copy').copy({
			resolveFrom: 'cwd',
			assets: {
				from: ['./node_modules/esbuild-visualizer/dist/lib/**/*'],
				to: ['./lib'],
			},
			// @ts-expect-error
			keepStructure: true,
		}),
		{
			name: 'meta',
			setup(build) {
				build.onEnd((result) => {
					if (result.metafile && result.errors.length === 0) {
						require('fs').writeFileSync(
							require('path').resolve(__dirname, '../meta.json'),
							JSON.stringify(result.metafile),
						);
					}
				});
			},
		},
	],
}).then(async ctx => {
	console.log('building...');
	if (process.argv.includes('--watch')) {
		await ctx.watch();
		console.log('watching...');
	} else {
		await ctx.rebuild();
		await ctx.dispose();
		console.log('finished.');
	}
});
