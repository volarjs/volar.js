import { FormattingOptions, LanguagePlugin, ServicePlugin, createFileProvider, createLanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';
import { uriToFileName } from './utils';

export function createFormatter(
	languages: LanguagePlugin[],
	services: ServicePlugin[]
) {

	let fakeUri = 'file:///dummy.txt';
	let fakeFileName = uriToFileName(fakeUri);
	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const files = createFileProvider(languages, false, () => { });
	const service = createLanguageService(
		{ files },
		services,
		env,
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
		files.updateSourceFile(fakeFileName, languageId, snapshot);

		const document = service.context.documents.get(fakeUri, languageId, snapshot);
		const edits = await service.format(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
