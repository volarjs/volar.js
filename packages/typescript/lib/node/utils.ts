import { forEachEmbeddedFile, FileProvider } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getVirtualFileAndMap(files: FileProvider, fileName: string) {
	const sourceFile = files.getSourceFile(fileName);
	if (sourceFile?.generated) {
		for (const virtualFile of forEachEmbeddedFile(sourceFile.generated.virtualFile)) {
			if (virtualFile.typescript) {
				for (const map of files.getMaps(virtualFile)) {
					if (map[1][0] === sourceFile.snapshot) {
						return [virtualFile, sourceFile, map[1][1]] as const;
					}
				}
			}
		}
	}
	return [undefined, undefined, undefined] as const;
}
