import type { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { FileProvider } from './fileProvider';

export interface SourceFile extends BaseFile {
	virtualFile?: [VirtualFile, LanguagePlugin];
}

export interface VirtualFile extends BaseFile {
	mappings: Mapping<CodeInformation>[];
	embeddedFiles: VirtualFile[];
	typescript?: {
		scriptKind: ts.ScriptKind;
	};
	codegenStacks?: Stack[];
	linkedNavigationMappings?: Mapping[];
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
	/**
	 * for language-server, kit, monaco, this is uri
	 * 
	 * for typescript server plugin, tsc, this is fileName
	 */
	id: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
}

export interface LanguagePlugin<T extends VirtualFile = VirtualFile> {
	createVirtualFile(id: string, languageId: string, snapshot: ts.IScriptSnapshot): T | undefined;
	updateVirtualFile(virtualFile: T, snapshot: ts.IScriptSnapshot): void;
	disposeVirtualFile?(virtualFile: T): void;
	typescript?: {
		resolveSourceFileName(tsFileName: string): string | undefined;
		resolveModuleName?(path: string, impliedNodeFormat?: ts.ResolutionMode): string | undefined;
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
	};
}

export interface Language {
	files: FileProvider;
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System;
		languageServiceHost: ts.LanguageServiceHost;
		synchronizeFileSystem?(): Promise<number>;
	};
}
