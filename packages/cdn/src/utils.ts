const cache = new Map<string, Promise<any>>();

export async function fetchText(url: string) {
	try {
		if (!cache.has(url)) {
			cache.set(url, fetch(url));
		}
		const res = await cache.get(url);
		if (res.status === 200) {
			return await res.text();
		}
	} catch {
		// ignore
	}
}

export async function fetchJson<T>(url: string) {
	try {
		if (!cache.has(url)) {
			cache.set(url, fetch(url));
		}
		const res = await cache.get(url);
		if (res.status === 200) {
			return await res.json() as T;
		}
	} catch {
		// ignore
	}
}
