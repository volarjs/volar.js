import { CancellationToken, Config, FormattingOptions, LanguageServiceHost, createLanguageService } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { asPosix, defaultCompilerOptions, fileNameToUri, getConfiguration, uriToFileName } from './utils';

export function createFormatter(
	config: Config,
	compilerOptions = defaultCompilerOptions
) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');

	let settings = {} as any;
	let dummyScriptUri = 'file:///dummy.txt';
	let dummyScriptFileName = '/dummy.txt';
	let dummyScriptVersion = 0;
	let dummyScriptSnapshot = ts.ScriptSnapshot.fromString('');
	let dummyScriptLanguageId: string | undefined;

	const service = createLanguageService(
		{ typescript: ts },
		{
			rootUri: URI.file('/'),
			uriToFileName: uri => {
				if (uri.startsWith(dummyScriptUri))
					return uri.replace(dummyScriptUri, dummyScriptFileName);
				return uriToFileName(uri);
			},
			fileNameToUri: fileName => {
				if (fileName.startsWith(dummyScriptFileName))
					return fileName.replace(dummyScriptFileName, dummyScriptUri);
				return fileNameToUri(fileName);
			},
			getConfiguration: section => getConfiguration(settings, section),
		},
		config,
		createHost(),
	);

	return {
		formatFile,
		formatCode,
		get settings() {
			return settings;
		},
		set settings(newValue) {
			settings = newValue;
		},
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
		dummyScriptSnapshot = ts.ScriptSnapshot.fromString(content);
		dummyScriptLanguageId = languageId;
		dummyScriptVersion++;
		const document = service.context.getTextDocument(dummyScriptUri)!;
		const edits = await service.format(dummyScriptUri, options, undefined, undefined, CancellationToken.None);
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
			getCompilationSettings: () => compilerOptions,
			getScriptFileNames: () => dummyScriptSnapshot ? [dummyScriptFileName] : [],
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
			getScriptVersion: (fileName) => {
				if (fileName === dummyScriptFileName) {
					return dummyScriptVersion.toString();
				}
				return scriptVersions.get(fileName)?.toString() ?? '';
			},
			getScriptSnapshot: (fileName) => {
				if (fileName === dummyScriptFileName) {
					return dummyScriptSnapshot;
				}
				if (!scriptSnapshots.has(fileName)) {
					const fileText = ts.sys.readFile(fileName);
					if (fileText !== undefined) {
						scriptSnapshots.set(fileName, ts.ScriptSnapshot.fromString(fileText));
					}
				}
				return scriptSnapshots.get(fileName);
			},
			getScriptLanguageId: uri => {
				if (uri === dummyScriptFileName) return dummyScriptLanguageId;
				return undefined;
			},
		};
		return host;
	}
}
