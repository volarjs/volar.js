import type { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript';
import type { FileProvider } from './fileProvider';

export interface SourceFile extends BaseFile {
	virtualFile?: [VirtualFile, LanguagePlugin];
}

export type CodeMapping = Mapping<CodeInformation>;

export interface VirtualFile extends BaseFile {
	mappings: CodeMapping[];
	embeddedFiles: VirtualFile[];
	typescript?: {
		scriptKind: ts.ScriptKind;
	};
	codegenStacks?: Stack[];
	linkedCodeMappings?: Mapping[];
}

export interface CodeInformation {
	/** virtual code is expected to support verification */
	verification: boolean | {
		shouldReport?(): boolean;
	};
	/** virtual code is expected to support assisted completion */
	completion: boolean | {
		isAdditional?: boolean;
		onlyImport?: boolean;
	};
	/** virtual code is expected correctly reflect semantic of the source code */
	semantic: boolean | {
		shouldHighlight?(): boolean;
	};
	/** virtual code is expected correctly reflect reference relationships of the source code */
	navigation: boolean | {
		shouldRename?(): boolean;
		resolveRenameNewName?(newName: string): string;
		resolveRenameEditText?(newText: string): string;
	};
	/** virtual code is expected correctly reflect the structural information of the source code */
	structure: boolean;
	/** virtual code is expected correctly reflect the format information of the source code */
	format: boolean;
}

export interface BaseFile {
	uri: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
}

export interface LanguagePlugin<T extends VirtualFile = VirtualFile> {
	createVirtualFile(uri: string, languageId: string, snapshot: ts.IScriptSnapshot, files?: FileProvider): T | undefined;
	updateVirtualFile(virtualFile: T, snapshot: ts.IScriptSnapshot, files?: FileProvider): void;
	disposeVirtualFile?(virtualFile: T, files?: FileProvider): void;
	typescript?: {
		extraFileExtensions: ts.FileExtensionInfo[];
		resolveSourceFileName(tsFileName: string): string | undefined;
		resolveModuleName?(path: string, impliedNodeFormat?: ts.ResolutionMode): string | undefined;
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
	};
}

export interface Language {
	files: FileProvider;
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System & { sync?(): Promise<number>; };
		projectHost: TypeScriptProjectHost;
		languageServiceHost: ts.LanguageServiceHost;
	};
}

export interface TypeScriptProjectHost extends Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getCurrentDirectory'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
> {
	getLanguageId(fileName: string): string;
	uriToFileName(uri: string): string;
	fileNameToUri(fileName: string): string;
}
