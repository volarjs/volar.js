import type { Mapping, SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import type { LinkedCodeMap } from './linkedCodeMap';

export interface Language<T> {
	plugins: LanguagePlugin<T>[];
	scripts: {
		get(id: T): SourceScript<T> | undefined;
		set(id: T, snapshot: ts.IScriptSnapshot, languageId?: string, plugins?: LanguagePlugin<T>[]): SourceScript<T> | undefined;
		delete(id: T): void;
		fromVirtualCode(virtualCode: VirtualCode<T>): SourceScript<T>;
	};
	maps: {
		get(virtualCode: VirtualCode<T>): SourceMap<CodeInformation>;
		forEach(virtualCode: VirtualCode<T>): Generator<[id: T, snapshot: ts.IScriptSnapshot, map: SourceMap<CodeInformation>]>;
	};
	linkedCodeMaps: {
		get(virtualCode: VirtualCode<T>): LinkedCodeMap | undefined;
	};
	typescript?: {
		configFileName: string | undefined;
		sys: ts.System & {
			version?: number;
			sync?(): Promise<number>;
		};
		languageServiceHost: ts.LanguageServiceHost;
		getExtraServiceScript(fileName: string): TypeScriptExtraServiceScript<T> | undefined;
		asScriptId(fileName: string): T;
		asFileName(scriptId: T): string;
	};
}

export interface SourceScript<T> {
	id: T;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	targetIds: Set<T>;
	associatedIds: Set<T>;
	isAssociationDirty?: boolean;
	generated?: {
		root: VirtualCode<T>;
		languagePlugin: LanguagePlugin<T>;
		embeddedCodes: Map<string, VirtualCode<T>>;
	};
}

export type CodeMapping = Mapping<CodeInformation>;

export interface VirtualCode<T = unknown> {
	id: string;
	languageId: string;
	snapshot: ts.IScriptSnapshot;
	mappings: CodeMapping[];
	associatedScriptMappings?: Map<T, CodeMapping[]>;
	embeddedCodes?: VirtualCode<T>[];
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

export interface TypeScriptServiceScript<T = unknown> {
	code: VirtualCode<T>;
	extension: '.ts' | '.js' | '.mts' | '.mjs' | '.cjs' | '.cts' | '.d.ts' | string;
	scriptKind: ts.ScriptKind;
	/** See #188 */
	preventLeadingOffset?: boolean;
}

export interface TypeScriptExtraServiceScript<T> extends TypeScriptServiceScript<T> {
	fileName: string;
}

export interface LanguagePlugin<T, K extends VirtualCode<T> = VirtualCode<T>> {
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
	typescript?: TypeScriptGenericOptions<T, K> & TypeScriptNonTSPluginOptions<T, K>;
}

export interface CodegenContext<T> {
	getAssociatedScript(scriptId: T): SourceScript<T> | undefined;
}

/**
 * The following options available to all situations.
 */
interface TypeScriptGenericOptions<T, K> {
	extraFileExtensions: ts.FileExtensionInfo[];
	resolveHiddenExtensions?: boolean;
	getServiceScript(root: K): TypeScriptServiceScript<T> | undefined;
}

/**
 * The following options will not be available in TS plugin.
 */
interface TypeScriptNonTSPluginOptions<T, K> {
	getExtraServiceScripts?(fileName: string, rootVirtualCode: K): TypeScriptExtraServiceScript<T>[];
	resolveLanguageServiceHost?(host: ts.LanguageServiceHost): ts.LanguageServiceHost;
}
