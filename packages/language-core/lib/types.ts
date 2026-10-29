import type { SpanMap, SpanMapSegment } from '@volar/source-map';
import type { LinkedCodeMap } from './linkedCodeMap';

export type { MappedPosition, MappedRange, NormalizedSpanMapSegment, SpanMapSegment } from '@volar/source-map';

export type Mapper = Pick<
	SpanMap,
	| 'segments'
	| 'virtualToOriginalPositions'
	| 'originalToVirtualPositions'
	| 'virtualToOriginalSpans'
	| 'originalToVirtualSpans'
>;

export type MapperFactory = (segments: readonly SpanMapSegment[]) => Mapper;

export interface Language<T = unknown> {
	mapperFactory: MapperFactory;
	plugins: LanguagePlugin<T>[];
	scripts: {
		get(id: T, includeFsFiles?: boolean, shouldRegister?: boolean): SourceScript<T> | undefined;
		set(
			id: T,
			snapshot: IScriptSnapshot,
			languageId?: string,
			plugins?: LanguagePlugin<T>[],
		): SourceScript<T> | undefined;
		delete(id: T): void;
		fromVirtualCode(virtualCode: VirtualCode): SourceScript<T>;
	};
	maps: {
		get(virtualCode: VirtualCode, sourceScript: SourceScript<T>): Mapper;
		forEach(virtualCode: VirtualCode): Generator<[sourceScript: SourceScript<T>, map: Mapper]>;
	};
	linkedCodeMaps: {
		get(virtualCode: VirtualCode): LinkedCodeMap | undefined;
	};
}

export interface SourceScript<T = unknown> {
	id: T;
	languageId: string;
	snapshot: IScriptSnapshot;
	targetIds: Set<T>;
	associatedIds: Set<T>;
	associatedOnly: boolean;
	isAssociationDirty?: boolean;
	generated?: {
		root: VirtualCode;
		languagePlugin: LanguagePlugin<T>;
		embeddedCodes: Map<string, VirtualCode>;
	};
}

export interface VirtualCode {
	id: string;
	languageId: string;
	snapshot: IScriptSnapshot;
	mappings: SpanMapSegment[];
	associatedScriptMappings?: Map<unknown, SpanMapSegment[]>;
	embeddedCodes?: VirtualCode[];
	linkedCodeMappings?: SpanMapSegment[];
}

export interface LanguagePlugin<T = unknown, K extends VirtualCode = VirtualCode> {
	/**
	 * The file extensions this plugin handles, including the leading dot (e.g. `['.vue', '.vue.md']`), filled in by the host.
	 *
	 * When set, a script is routed to this plugin only if its longest extension matched by any plugin of the language
	 * is one of these; plugins that list the same extension keep their order. Script IDs are matched by `String(scriptId)`.
	 *
	 * When omitted, the plugin is offered every script and decides for itself in `getLanguageId` / `createVirtualCode`.
	 */
	extensions?: string[];
	/**
	 * For files that are not opened in the IDE, the language ID will not be synchronized to the language server, so a hook is needed to parse the language ID of files that are known extension but not opened in the IDE.
	 */
	getLanguageId(scriptId: T): string | undefined;
	/**
	 * Generate a virtual code.
	 */
	createVirtualCode?(scriptId: T, languageId: string, snapshot: IScriptSnapshot, ctx: CodegenContext<T>): K | undefined;
	/**
	 * Incremental update a virtual code. If not provide, call createVirtualCode again.
	 */
	updateVirtualCode?(scriptId: T, virtualCode: K, newSnapshot: IScriptSnapshot, ctx: CodegenContext<T>): K | undefined;
	/**
	 * Cleanup a virtual code.
	 */
	disposeVirtualCode?(scriptId: T, virtualCode: K): void;
	/**
	 * Some file types should not be parsed or processed as TypeScript files,
	 * as they are used only as sources for generated files.
	 *
	 * This functionality is required only in TS plugin mode.
	 */
	isAssociatedFileOnly?(scriptId: T, languageId: string): boolean;
}

export interface CodegenContext<T = unknown> {
	getAssociatedScript(scriptId: T): SourceScript<T> | undefined;
}

export interface IScriptSnapshot {
	/** Gets a portion of the script snapshot specified by [start, end). */
	getText(start: number, end: number): string;
	/** Gets the length of this script snapshot. */
	getLength(): number;
	/**
	 * Gets the TextChangeRange that describe how the text changed between this text and
	 * an older version.  This information is used by the incremental parser to determine
	 * what sections of the script need to be re-parsed.  'undefined' can be returned if the
	 * change range cannot be determined.  However, in that case, incremental parsing will
	 * not happen and the entire document will be re - parsed.
	 */
	getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange | undefined;
	/** Releases all resources held by this script snapshot */
	dispose?(): void;
}

export interface TextChangeRange {
	span: TextSpan;
	newLength: number;
}

export interface TextSpan {
	start: number;
	length: number;
}
