import { URI } from 'vscode-uri';

const encodeds = new Map<string, URI>();

export function uriToFileName(uri: string) {
	const parsed = URI.parse(uri);
	if (parsed.scheme === 'file') {
		return parsed.fsPath.replace(/\\/g, '/');
	}
	const encoded = encodeURIComponent(`${parsed.scheme}://${parsed.authority}`);
	encodeds.set(encoded, parsed);
	return `/${encoded}${parsed.path}`;
}

export function fileNameToUri(fileName: string) {
	for (const [encoded, uri] of encodeds) {
		const prefix = `/${encoded}`;
		if (fileName.startsWith(prefix)) {
			return URI.from({
				scheme: uri.scheme,
				authority: uri.authority,
				path: fileName.substring(prefix.length),
			}).toString();
		}
	}
	return URI.file(fileName).toString();
}
