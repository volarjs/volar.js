import type * as ts from 'typescript';

export function dedupeDocumentSpans<T extends ts.DocumentSpan>(items: T[]): T[] {
	return dedupe(items, item =>
		[
			item.fileName,
			item.textSpan.start,
			item.textSpan.length,
		].join(':'));
}

function dedupe<T>(items: T[], getKey: (item: T) => string): T[] {
	const map = new Map<string, T>();
	for (const item of items.reverse()) {
		map.set(getKey(item), item);
	}
	return [...map.values()];
}
