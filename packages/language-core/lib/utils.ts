export class FileMap<T> extends Map<string, T> {
	private originalFileNames = new Map<string, string>();

	constructor(private caseSensitive: boolean) {
		super();
	}

	keys() {
		return this.originalFileNames.values();
	}

	get(key: string) {
		return super.get(this.normalizeId(key));
	}

	has(key: string) {
		return super.has(this.normalizeId(key));
	}

	set(key: string, value: T) {
		this.originalFileNames.set(this.normalizeId(key), key);
		return super.set(this.normalizeId(key), value);
	}

	delete(key: string) {
		this.originalFileNames.delete(this.normalizeId(key));
		return super.delete(this.normalizeId(key));
	}

	clear() {
		this.originalFileNames.clear();
		return super.clear();
	}

	normalizeId(id: string) {
		return this.caseSensitive ? id : id.toLowerCase();
	}
}
