import { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { createFileProvider } from '../lib/createFileProvider';

export interface FileCapabilities {
	diagnostic?: boolean;
	foldingRange?: boolean;
	documentFormatting?: boolean;
	documentSymbol?: boolean;
	codeAction?: boolean;
	inlayHint?: boolean;
}

export interface FileRangeCapabilities {
	hover?: boolean;
	references?: boolean;
	definition?: boolean;
	rename?: boolean | {
		normalize?(newName: string): string;
		apply?(newName: string): string;
	};
	completion?: boolean | {
		additional?: boolean;
		autoImportOnly?: boolean;
	};
	diagnostic?: boolean | {
		shouldReport(): boolean;
	};
	semanticTokens?: boolean;

	// TODO
	referencesCodeLens?: boolean;
	displayWithLink?: boolean;
}

export interface MirrorBehaviorCapabilities {
	references?: boolean;
	definition?: boolean;
	rename?: boolean;
}

export namespace FileCapabilities {
	export const full: FileCapabilities = {
		diagnostic: true,
		foldingRange: true,
		documentFormatting: true,
		documentSymbol: true,
		codeAction: true,
		inlayHint: true,
	};
}

export namespace FileRangeCapabilities {
	export const full: FileRangeCapabilities = {
		hover: true,
		references: true,
		definition: true,
		rename: true,
		completion: true,
		diagnostic: true,
		semanticTokens: true,
	};
}

export namespace MirrorBehaviorCapabilities {
	export const full: MirrorBehaviorCapabilities = {
		references: true,
		definition: true,
		rename: true,
	};
}

export enum FileKind {
	TextFile = 0,
	TypeScriptHostFile = 1,
}

export interface SourceFile extends BaesFile {
	root?: VirtualFile;
	language?: Language;
}

export interface VirtualFile extends BaesFile {
	kind: FileKind,
	capabilities: FileCapabilities,
	mappings: Mapping<FileRangeCapabilities>[],
	codegenStacks: Stack[],
	mirrorBehaviorMappings?: Mapping<[MirrorBehaviorCapabilities, MirrorBehaviorCapabilities]>[],
	embeddedFiles: VirtualFile[],
}

export interface BaesFile {
	/**
	 * for language-server, kit, monaco, this is uri
	 * 
	 * for typescript server plugin, tsc, this is fileName
	 */
	id: string,
	languageId: string,
	snapshot: ts.IScriptSnapshot,
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

export interface TypeScriptProjectHost extends Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getCurrentDirectory'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
	| 'getCancellationToken'
> { }

export type FileProvider = ReturnType<typeof createFileProvider>;

export interface Project {
	fileProvider: FileProvider;
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System & {
			dispose?(): void;
			sync?(): Promise<number>;
		};
		languageServiceHost: ts.LanguageServiceHost;
	};
}
