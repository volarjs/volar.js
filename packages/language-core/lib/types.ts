import type { Mapping, SourceMap, Stack } from '@volar/source-map';
import type * as ts from 'typescript';
import type { LinkedCodeMap } from './linkedCodeMap';

export interface Language {
	plugins: LanguagePlugin[];
	scripts: {
		get(id: string): SourceScript | undefined;
		set(id: string, snapshot: ts.IScriptSnapshot, languageId?: string, plugins?: LanguagePlugin[]): SourceScript | undefined;
		delete(id: string): void;
	};
	maps: {
		get(virtualCode: VirtualCode, scriptId?: string): SourceMap<CodeInformation> | undefined;
		forEach(virtualCode: VirtualCode): Map<string, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>;
	};
	linkedCodeMaps: {
		get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
	};
	typescript?: {
		projectHost: TypeScriptProjectHost;
		languageServiceHost: ts.LanguageServiceHost;
		getExtraServiceScript(fileName: string): ExtraServiceScript | undefined;
	};
}

export interface SourceScript {
	/**
	 * uri or fileName
	 */
	id: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	generated?: {
		root: VirtualCode;
		languagePlugin: LanguagePlugin;
		embeddedCodes: Map<string, VirtualCode>;
	};
}

export type CodeMapping = Mapping<CodeInformation>;

export interface VirtualCode {
	id: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	mappings: CodeMapping[];
	embeddedCodes?: VirtualCode[];
	codegenStacks?: Stack[];
	linkedCodeMappings?: Mapping[];
}

export interface CodeInformation {
	/** virtual code is expected to support verification */
	verification?: boolean | {
		shouldReport?(): boolean;
	};
	/** virtual code is expected to support assisted completion */
	completion?: boolean | {
		isAdditional?: boolean;
		onlyImport?: boolean;
	};
	/** virtual code is expected correctly reflect semantic of the source code */
	semantic?: boolean | {
		shouldHighlight?(): boolean;
	};
	/** virtual code is expected correctly reflect reference relationships of the source code */
	navigation?: boolean | {
		shouldRename?(): boolean;
		resolveRenameNewName?(newName: string): string;
		resolveRenameEditText?(newText: string): string;
	};
	/** virtual code is expected correctly reflect the structural information of the source code */
	structure?: boolean;
	/** virtual code is expected correctly reflect the format information of the source code */
	format?: boolean;
}

export interface ServiceScript {
	code: VirtualCode;
	extension: '.ts' | '.js' | '.mts' | '.mjs' | '.cjs' | '.cts' | '.d.ts' | string;
	scriptKind: ts.ScriptKind;
}

export interface ExtraServiceScript extends ServiceScript {
	fileName: string;
}

export interface LanguagePlugin<T extends VirtualCode = VirtualCode> {
	getLanguageId(scriptId: string): string | undefined;
	createVirtualCode?(scriptId: string, languageId: string, snapshot: ts.IScriptSnapshot): T | undefined;
	updateVirtualCode?(scriptId: string, virtualCode: T, newSnapshot: ts.IScriptSnapshot): T | undefined;
	disposeVirtualCode?(scriptId: string, virtualCode: T): void;
	typescript?: {
		/**
		 * LSP + TS Plugin
		 */
		extraFileExtensions: ts.FileExtensionInfo[];
		/**
		 * LSP + TS Plugin
		 */
		getServiceScript(rootVirtualCode: T): ServiceScript | undefined;
		/**
		 * LSP only
		 */
		getExtraServiceScripts?(fileName: string, rootVirtualCode: T): ExtraServiceScript[];
		/**
		 * LSP only
		 */
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
	};
}

export interface TypeScriptProjectHost extends ts.System, Pick<
	ts.LanguageServiceHost,
	'getLocalizedDiagnosticMessages'
	| 'getCompilationSettings'
	| 'getProjectReferences'
	| 'getCurrentDirectory'
	| 'getScriptFileNames'
	| 'getProjectVersion'
	| 'getScriptSnapshot'
> {
	configFileName: string | undefined;
	getSystemVersion?(): number;
	syncSystem?(): Promise<number>;
	scriptIdToFileName(scriptId: string): string;
	fileNameToScriptId(fileName: string): string;
}
