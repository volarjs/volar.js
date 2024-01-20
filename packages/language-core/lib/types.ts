import type { Mapping, Stack } from '@volar/source-map';
import type * as ts from 'typescript';
import type { FileRegistry } from './fileRegistry';

export interface SourceFile extends BaseCodeInfo {
	/**
	 * uri or fileName
	 */
	id: string;
	generated?: {
		code: VirtualCode;
		languagePlugin: LanguagePlugin;
	};
}

export type CodeMapping = Mapping<CodeInformation>;

export interface VirtualCode<T extends string = string> extends BaseCodeInfo {
	id: T;
	mappings: CodeMapping[];
	embeddedCodes: VirtualCode[];
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

export interface BaseCodeInfo {
	languageId: string;
	snapshot: ts.IScriptSnapshot;
}

export interface LanguagePlugin<T extends VirtualCode = VirtualCode> {
	createVirtualCode(fileId: string, languageId: string, snapshot: ts.IScriptSnapshot, files?: FileRegistry): T | undefined;
	updateVirtualCode(fileId: string, virtualCode: T, newSnapshot: ts.IScriptSnapshot, files?: FileRegistry): T;
	disposeVirtualCode?(fileId: string, virtualCode: T, files?: FileRegistry): void;
	typescript?: {
		extraFileExtensions: ts.FileExtensionInfo[];
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
		getScript(rootVirtualCode: T): {
			code: VirtualCode;
			extension: '.ts' | '.js' | '.mts' | '.mjs' | '.cjs' | '.cts' | '.d.ts' | string;
			scriptKind: ts.ScriptKind;
		} | undefined;
	};
}

export interface LanguageContext {
	files: FileRegistry;
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
}
