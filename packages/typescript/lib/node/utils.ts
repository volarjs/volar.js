import { forEachEmbeddedFile, FileProvider } from '@volar/language-core';

export function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

export function getVirtualFileAndMap(files: FileProvider, fileName: string) {
	const sourceFile = files.getSourceFile(fileName);
	if (sourceFile?.virtualFile) {
		for (const virtualFile of forEachEmbeddedFile(sourceFile.virtualFile[0])) {
			const ext = virtualFile.fileName.substring(fileName.length);
			if (virtualFile.typescript && (ext === '.d.ts' || ext.match(/^\.(js|ts)x?$/))) {
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
