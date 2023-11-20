import { CodeInformations, VirtualFile } from '@volar/language-core';
import { SourceMapWithDocuments } from '../documents';
import { ServiceContext } from '../types';

export async function visitEmbedded(
	context: ServiceContext,
	current: VirtualFile,
	cb: (file: VirtualFile, sourceMap: SourceMapWithDocuments<CodeInformations>) => Promise<boolean>,
	rootFile = current,
) {

	for (const embedded of current.embeddedFiles) {
		if (!await visitEmbedded(context, embedded, cb, rootFile)) {
			return false;
		}
	}

	for (const map of context.documents.getMaps(current)) {
		const sourceFile = context.project.fileProvider.getSourceFile(map.sourceFileDocument.uri);
		if (sourceFile?.root === rootFile) {
			if (!await cb(current, map)) {
				return false;
			}
		}
	}

	return true;
}
