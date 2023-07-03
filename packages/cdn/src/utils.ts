export async function fetchText(url: string) {
	try {
		const res = await fetch(url);
		if (res.status === 200) {
			return await res.text();
		}
	} catch {
		// ignore
	}
}

export async function fetchJson<T>(url: string) {
	try {
		const res = await fetch(url);
		if (res.status === 200) {
			return await res.json() as T;
		}
	} catch {
		// ignore
	}
}

/**
 * @example
 * "/a/b/c" -> "a"
 * "/@a/b/c" -> "@a/b"
 * "/@a/b@1.2.3/c" -> "@a/b@1.2.3"
 */
export function getPackageName(path: string) {
	const parts = path.split('/');
	let pkgName = parts[1];
	if (pkgName.startsWith('@')) {
		if (parts.length < 3 || !parts[2]) {
			return undefined;
		}
		pkgName += '/' + parts[2];
	}
	return pkgName;
}
