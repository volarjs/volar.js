import { CancellationToken, Config, FormattingOptions, LanguageServiceHost, createLanguageService } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { asPosix, fileNameToUri, uriToFileName } from './utils';

export function createFormatter(config: Config) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');
	const service = createLanguageService(
		{ typescript: ts },
		{
			uriToFileName,
			fileNameToUri,
			rootUri: URI.file('/'),
		},
		config,
		createHost(),
	);

	return {
		formatFile,
		formatCode,
	};

	async function formatFile(fileName: string, options: FormattingOptions): Promise<string> {
		fileName = asPosix(fileName);
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri);
		if (!document) throw `file not found: ${fileName}`;
		const edits = await service.format(uri, options, undefined, undefined, CancellationToken.None);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}
		return document.getText();
	}

	async function formatCode(content: string, languageId: string, options: FormattingOptions): Promise<string> {
		const document = TextDocument.create('file://unknown', languageId, 0, content);
		const edits = await service.format(document, options, undefined, undefined, CancellationToken.None);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}
		return content;
	}

	function createHost() {
		const scriptVersions = new Map<string, number>();
		const scriptSnapshots = new Map<string, ts.IScriptSnapshot>();
		const host: LanguageServiceHost = {
			...ts.sys,
			getCompilationSettings: () => ({}),
			getScriptFileNames: () => [],
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
			getScriptVersion: (fileName) => scriptVersions.get(fileName)?.toString() ?? '',
			getScriptSnapshot: (fileName) => {
				if (!scriptSnapshots.has(fileName)) {
					const fileText = ts.sys.readFile(fileName);
					if (fileText !== undefined) {
						scriptSnapshots.set(fileName, ts.ScriptSnapshot.fromString(fileText));
					}
				}
				return scriptSnapshots.get(fileName);
			},
		};
		return host;
	}
}
