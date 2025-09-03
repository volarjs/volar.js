export function resolveFileLanguageId(path: string): string | undefined {
	const ext = path.split('.').pop();
	switch (ext) {
		case 'js':
			return 'javascript';
		case 'cjs':
			return 'javascript';
		case 'mjs':
			return 'javascript';
		case 'ts':
			return 'typescript';
		case 'cts':
			return 'typescript';
		case 'mts':
			return 'typescript';
		case 'jsx':
			return 'javascriptreact';
		case 'tsx':
			return 'typescriptreact';
		case 'json':
			return 'json';
	}
}
