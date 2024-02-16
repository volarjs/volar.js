import { URI } from 'vscode-uri';

export function uriToFileName(uri: string) {
	const parsed = URI.parse(uri);
	if (parsed.scheme === 'file') {
		return parsed.fsPath.replace(/\\/g, '/');
	}
	return `/${parsed.scheme}@@${parsed.authority}@@${parsed.path}`;
}

export function fileNameToUri(fileName: string) {
	if (fileName.startsWith('/') && fileName.includes('@@')) {
		const parts = fileName.slice(1).split('@@');
		if (parts.length !== 3) {
			throw new Error('Invalid file name');
		}
		return URI.from({
			scheme: parts[0],
			authority: parts[1],
			path: parts[2],
		}).toString();
	}
	return URI.file(fileName).toString();
}
