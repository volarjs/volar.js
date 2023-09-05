require('esbuild').build({
	entryPoints: {
		extension: './out/extension.js',
	},
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
	watch: process.argv.includes('--watch'),
	plugins: [
		require('esbuild-plugin-copy').copy({
			resolveFrom: 'cwd',
			assets: {
				from: ['./node_modules/esbuild-visualizer/dist/lib/**/*'],
				to: ['./lib'],
			},
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
}).catch(() => process.exit(1))
