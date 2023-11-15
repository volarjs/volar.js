import { FormattingOptions, Language, Service, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function createFormatter(
	languages: Language[],
	services: Service[],
	env: ServiceEnvironment
) {

	let fakeUri = 'file:///dummy.txt';
	let fakeFileName = '/dummy.txt';

	const fileProvider = createFileProvider(languages, () => { });
	const service = createLanguageService(
		{ typescript: ts as any },
		services,
		env,
		{ fileProvider },
	);

	return { formatCode };

	async function formatCode(content: string, languageId: string, options: FormattingOptions): Promise<string> {

		fileProvider.updateSource(fakeFileName, ts.ScriptSnapshot.fromString(content), languageId);

		const document = service.context.getTextDocument(fakeUri)!;
		const edits = await service.format(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
