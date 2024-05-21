import type { Mapping, SourceMap, Stack } from '@volar/source-map';
import type * as ts from 'typescript';
import type { LinkedCodeMap } from './linkedCodeMap';

export interface Language<T> {
	plugins: LanguagePlugin<T>[];
	scripts: {
		get(id: T): SourceScript<T> | undefined;
		set(id: T, snapshot: ts.IScriptSnapshot, languageId?: string, plugins?: LanguagePlugin<T>[]): SourceScript<T> | undefined;
		delete(id: T): void;
	};
	maps: {
		get(virtualCode: VirtualCode, scriptId?: T): SourceMap<CodeInformation> | undefined;
		forEach(virtualCode: VirtualCode): Map<T, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>;
	};
	linkedCodeMaps: {
		get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
	};
	typescript?: {
		configFileName: string | undefined;
		languageServiceHost: ts.LanguageServiceHost;
		getExtraServiceScript(fileName: string): TypeScriptExtraServiceScript | undefined;
		asScriptId(fileName: string): T;
		asFileName(scriptId: T): string;
	};
}

export interface SourceScript<T> {
	id: T;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	generated?: {
		root: VirtualCode;
		languagePlugin: LanguagePlugin<T>;
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

export interface TypeScriptServiceScript {
	code: VirtualCode;
	extension: '.ts' | '.js' | '.mts' | '.mjs' | '.cjs' | '.cts' | '.d.ts' | string;
	scriptKind: ts.ScriptKind;
}

export interface TypeScriptExtraServiceScript extends TypeScriptServiceScript {
	fileName: string;
}

export interface LanguagePlugin<T, K extends VirtualCode = VirtualCode> {
	getLanguageId(scriptId: T): string | undefined;
	createVirtualCode?(scriptId: T, languageId: string, snapshot: ts.IScriptSnapshot): K | undefined;
	updateVirtualCode?(scriptId: T, virtualCode: K, newSnapshot: ts.IScriptSnapshot): K | undefined;
	disposeVirtualCode?(scriptId: T, virtualCode: K): void;
	typescript?: {
		/**
		 * LSP + TS Plugin
		 */
		extraFileExtensions: ts.FileExtensionInfo[];
		/**
		 * LSP + TS Plugin
		 */
		getServiceScript(rootVirtualCode: K): TypeScriptServiceScript | undefined;
		/**
		 * LSP only
		 */
		getExtraServiceScripts?(fileName: string, rootVirtualCode: K): TypeScriptExtraServiceScript[];
		/**
		 * LSP only
		 */
		resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
	};
}

