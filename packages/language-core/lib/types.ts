import { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { createFileProvider } from '../lib/createFileProvider';

export interface VirtualFile extends BaseFile {
	mappings: Mapping<CodeInformations>[];
	embeddedFiles: VirtualFile[];
	typescript?: {
		scriptKind: ts.ScriptKind;
		isLanguageServiceSourceFile?: boolean;
	};
	codegenStacks?: Stack[];
	mirrorCodeMappings?: Mapping<[MirrorCodeInformations, MirrorCodeInformations]>[];
}

export interface MirrorCodeInformations {
	reference?: boolean;
	rename?: boolean;
	definition?: boolean;
	highlight?: boolean;
}

export interface CodeInformations {
	diagnostics?: boolean | {
		shouldReport(): boolean;
	};
	renameEdits?: boolean | {
		shouldRename: boolean;
		shouldEdit: boolean;
		resolveNewName?(newName: string): string;
		resolveEditText?(newText: string): string;
	};
	formattingEdits?: boolean;
	completionItems?: boolean | {
		isAdditional?: boolean;
		onlyImport?: boolean;
	};
	definitions?: boolean;
	references?: boolean;
	foldingRanges?: boolean;
	inlayHints?: boolean;
	codeActions?: boolean;
	symbols?: boolean;
	selectionRanges?: boolean;
	linkedEditingRanges?: boolean;
	colors?: boolean;
	autoInserts?: boolean;
	codeLenses?: boolean;
	highlights?: boolean;
	links?: boolean;
	semanticTokens?: boolean;
	hover?: boolean;
	signatureHelps?: boolean;
}

export interface SourceFile extends BaseFile {
	root?: VirtualFile;
	language?: Language;
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

export interface Language<T extends VirtualFile = VirtualFile> {
	createVirtualFile(id: string, languageId: string, snapshot: ts.IScriptSnapshot): T | undefined;
	updateVirtualFile(virtualFile: T, snapshot: ts.IScriptSnapshot): void;
	deleteVirtualFile?(virtualFile: T): void;
	typescript?: {
		resolveModuleName?(path: string, impliedNodeFormat?: ts.ResolutionMode): string | undefined;
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
	};
}

export type FileProvider = ReturnType<typeof createFileProvider>;

export interface Project {
	fileProvider: FileProvider;
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System;
		languageServiceHost: ts.LanguageServiceHost;
		synchronizeFileSystem?(): Promise<number>;
	};
}
