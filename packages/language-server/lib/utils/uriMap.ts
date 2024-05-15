import { URI } from 'vscode-uri';
export * as _ from 'vscode-uri';

export type UriMap<T> = ReturnType<typeof createUriMap<T>>;

export function createUriMap<T>(caseSensitive = false) {
	const map = new Map<string, T>();
	const uriToNormalizedUri = new Map<string, string>();
	const normalizedUriToUri = new Map<string, string>();

	return {
		clear: _clear,
		values: _values,
		keys: _keys,
		delete: _delete,
		get: _get,
		has: _has,
		set: _set,
	};

	function getUriByUri(uri: string) {
		if (!uriToNormalizedUri.has(uri)) {
			const normalizedUri = normalizeUri(uri);
			uriToNormalizedUri.set(uri, normalizedUri);
			normalizedUriToUri.set(normalizedUri, uri);
		}
		return uriToNormalizedUri.get(uri)!;
	}

	function _clear() {
		uriToNormalizedUri.clear();
		normalizedUriToUri.clear();
		return map.clear();
	}
	function _values() {
		return map.values();
	}
	function* _keys() {
		for (const normalizedUri of map.keys()) {
			yield normalizedUriToUri.get(normalizedUri)!;
		}
	}
	function _delete(_uri: string) {
		return map.delete(getUriByUri(_uri));
	}
	function _get(_uri: string) {
		return map.get(getUriByUri(_uri));
	}
	function _has(_uri: string) {
		return map.has(getUriByUri(_uri));
	}
	function _set(_uri: string, item: T) {
		return map.set(getUriByUri(_uri), item);
	}

	function normalizeUri(uri: string) {
		try {
			let normalized = URI.parse(uri).toString();
			if (!caseSensitive) {
				normalized = normalized.toLowerCase();
			}
			return normalized;
		} catch {
			return '';
		}
	}
}
