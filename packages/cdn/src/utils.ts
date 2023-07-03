const textCache = new Map<string, Promise<string | undefined>>();
const jsonCache = new Map<string, Promise<any>>();

export async function fetchText(url: string) {
	if (!textCache.has(url)) {
		textCache.set(url, (async () => {
			try {
				const res = await fetch(url);
				if (res.status === 200) {
					return await res.text();
				}
			} catch {
				// ignore
			}
		})());
	}
	return await textCache.get(url)!;
}

export async function fetchJson<T>(url: string) {
	if (!jsonCache.has(url)) {
		jsonCache.set(url, (async () => {
			try {
				const res = await fetch(url);
				if (res.status === 200) {
					return await res.json();
				}
			} catch {
				// ignore
			}
		})());
	}
	return await jsonCache.get(url)! as T;
}
