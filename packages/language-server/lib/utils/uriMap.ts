import type { URI } from 'vscode-uri';

export type UriMap<T> = ReturnType<typeof createUriMap<T>>;

export function createUriMap<T>(caseSensitive = false) {
	const map = new Map<string, T>();
	const rawUriToNormalizedUri = new Map<string, string>();
	const normalizedUriToRawUri = new Map<string, URI>();

	return {
		clear: _clear,
		values: _values,
		keys: _keys,
		delete: _delete,
		get: _get,
		has: _has,
		set: _set,
	};

	function _clear() {
		rawUriToNormalizedUri.clear();
		normalizedUriToRawUri.clear();
		return map.clear();
	}

	function _values() {
		return map.values();
	}

	function* _keys() {
		for (const normalizedUri of map.keys()) {
			yield normalizedUriToRawUri.get(normalizedUri)!;
		}
	}
	function _delete(uri: URI) {
		return map.delete(getUriByUri(uri));
	}

	function _get(uri: URI) {
		return map.get(getUriByUri(uri));
	}

	function _has(uri: URI) {
		return map.has(getUriByUri(uri));
	}

	function _set(uri: URI, item: T) {
		return map.set(getUriByUri(uri), item);
	}

	function getUriByUri(uri: URI) {
		const rawUri = uri.toString();
		if (!rawUriToNormalizedUri.has(rawUri)) {
			let normalizedUri = uri.toString();
			if (!caseSensitive) {
				normalizedUri = normalizedUri.toLowerCase();
			}
			rawUriToNormalizedUri.set(rawUri, normalizedUri);
			normalizedUriToRawUri.set(normalizedUri, uri);
		}
		return rawUriToNormalizedUri.get(rawUri)!;
	}
}
