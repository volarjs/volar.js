import { FormattingOptions, Language, Service, createFileProvider, createLanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';

export function createFormatter(
	languages: Language[],
	services: Service[]
) {

	let fakeUri = 'file:///dummy.txt';
	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const fileProvider = createFileProvider(languages, () => { });
	const service = createLanguageService(
		{ typescript: ts as any },
		services,
		env,
		{ fileProvider },
	);

	return {
		// apis
		format,

		// settings
		get settings() {
			return settings;
		},
		set settings(v) {
			settings = v;
		},
	};

	async function format(content: string, languageId: string, options: FormattingOptions): Promise<string> {

		const snapshot = ts.ScriptSnapshot.fromString(content);
		fileProvider.updateSourceFile(fakeUri, snapshot, languageId);

		const document = service.context.documents.get(fakeUri, languageId, snapshot)!;
		const edits = await service.format(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
