import type { Mapping, SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import type { LinkedCodeMap } from './linkedCodeMap';

export interface Language<T = unknown> {
	plugins: LanguagePlugin<T>[];
	scripts: {
		get(id: T): SourceScript<T> | undefined;
		set(id: T, snapshot: ts.IScriptSnapshot, languageId?: string, plugins?: LanguagePlugin<T>[]): SourceScript<T> | undefined;
		delete(id: T): void;
		fromVirtualCode(virtualCode: VirtualCode): SourceScript<T>;
	};
	maps: {
		get(virtualCode: VirtualCode): SourceMap<CodeInformation, T>;
		forEach(virtualCode: VirtualCode): Generator<[id: T, snapshot: ts.IScriptSnapshot, map: SourceMap<CodeInformation, T>]>;
	};
	linkedCodeMaps: {
		get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
	};
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System & {
			version?: number;
			sync?(): Promise<number>;
		};
		languageServiceHost: ts.LanguageServiceHost;
		getExtraServiceScript(fileName: string): TypeScriptExtraServiceScript | undefined;
		asScriptId(fileName: string): T;
		asFileName(scriptId: T): string;
	};
}

export interface SourceScript<T = unknown> {
	id: T;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	targetIds: Set<T>;
	associatedIds: Set<T>;
	isAssociationDirty?: boolean;
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
	associatedScriptMappings?: Map<unknown, CodeMapping[]>;
	embeddedCodes?: VirtualCode[];
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
	/** See #188 */
	preventLeadingOffset?: boolean;
}

export interface TypeScriptExtraServiceScript extends TypeScriptServiceScript {
	fileName: string;
}

export interface LanguagePlugin<T = unknown, K extends VirtualCode = VirtualCode> {
	/**
	 * For files that are not opened in the IDE, the language ID will not be synchronized to the language server, so a hook is needed to parse the language ID of files that are known extension but not opened in the IDE.
	 */
	getLanguageId(scriptId: T): string | undefined;
	/**
	 * Generate a virtual code.
	 */
	createVirtualCode?(scriptId: T, languageId: string, snapshot: ts.IScriptSnapshot, ctx: CodegenContext<T>): K | undefined;
	/**
	 * Incremental update a virtual code. If not provide, call createVirtualCode again.
	 */
	updateVirtualCode?(scriptId: T, virtualCode: K, newSnapshot: ts.IScriptSnapshot, ctx: CodegenContext<T>): K | undefined;
	/**
	 * Cleanup a virtual code.
	 */
	disposeVirtualCode?(scriptId: T, virtualCode: K): void;
	typescript?: TypeScriptGenericOptions<K> & TypeScriptNonTSPluginOptions<K>;
}

export interface CodegenContext<T = unknown> {
	getAssociatedScript(scriptId: T): SourceScript<T> | undefined;
}

/**
 * The following options available to all situations.
 */
interface TypeScriptGenericOptions<K> {
	extraFileExtensions: ts.FileExtensionInfo[];
	resolveHiddenExtensions?: boolean;
	getServiceScript(root: K): TypeScriptServiceScript | undefined;
}

/**
 * The following options will not be available in TS plugin.
 */
interface TypeScriptNonTSPluginOptions<K> {
	getExtraServiceScripts?(fileName: string, rootVirtualCode: K): TypeScriptExtraServiceScript[];
	resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
}
