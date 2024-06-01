export * from '@volar/source-map';
export * from './lib/editorFeatures';
export * from './lib/linkedCodeMap';
export * from './lib/types';
export * from './lib/utils';

import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import { LinkedCodeMap } from './lib/linkedCodeMap';
import type { CodeInformation, Language, LanguagePlugin, SourceScript, VirtualCode } from './lib/types';

export function createLanguage<T>(
	plugins: LanguagePlugin<T>[],
	scriptRegistry: Map<T, SourceScript<T>>,
	sync: (id: T) => void
): Language<T> {
	const virtualCodeToSourceFileMap = new WeakMap<VirtualCode, SourceScript<T>>();
	const virtualCodeToMaps = new WeakMap<ts.IScriptSnapshot, Map<T, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>>();
	const virtualCodeToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, LinkedCodeMap | undefined>();

	return {
		plugins,
		scripts: {
			get(id) {
				sync(id);
				return scriptRegistry.get(id);
			},
			set(id, snapshot, languageId, _plugins = plugins) {
				if (!languageId) {
					for (const plugin of plugins) {
						languageId = plugin.getLanguageId?.(id);
						if (languageId) {
							break;
						}
					}
				}
				if (!languageId) {
					console.warn(`languageId not found for ${id}`);
					return;
				}
				if (scriptRegistry.has(id)) {
					const sourceScript = scriptRegistry.get(id)!;
					if (sourceScript.languageId !== languageId) {
						// languageId changed
						this.delete(id);
						return this.set(id, snapshot, languageId);
					}
					else if (sourceScript.snapshot !== snapshot) {
						// snapshot updated
						sourceScript.snapshot = snapshot;
						if (sourceScript.generated) {
							const { updateVirtualCode, createVirtualCode } = sourceScript.generated.languagePlugin;
							const newVirtualCode = updateVirtualCode
								? updateVirtualCode(id, sourceScript.generated.root, snapshot)
								: createVirtualCode?.(id, languageId, snapshot);
							if (newVirtualCode) {
								sourceScript.generated.root = newVirtualCode;
								sourceScript.generated.embeddedCodes.clear();
								for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
									virtualCodeToSourceFileMap.set(code, sourceScript);
									sourceScript.generated.embeddedCodes.set(code.id, code);
								}
								return sourceScript;
							}
							else {
								this.delete(id);
								return;
							}
						}
					}
					else {
						// not changed
						return sourceScript;
					}
				}
				else {
					// created
					const sourceScript: SourceScript<T> = { id, languageId, snapshot };
					scriptRegistry.set(id, sourceScript);
					for (const languagePlugin of _plugins) {
						const virtualCode = languagePlugin.createVirtualCode?.(id, languageId, snapshot);
						if (virtualCode) {
							sourceScript.generated = {
								root: virtualCode,
								languagePlugin,
								embeddedCodes: new Map(),
							};
							for (const code of forEachEmbeddedCode(virtualCode)) {
								virtualCodeToSourceFileMap.set(code, sourceScript);
								sourceScript.generated.embeddedCodes.set(code.id, code);
							}
							break;
						}
					}
					return sourceScript;
				}
			},
			delete(id) {
				const value = scriptRegistry.get(id);
				if (value) {
					if (value.generated) {
						value.generated.languagePlugin.disposeVirtualCode?.(id, value.generated.root);
					}
					scriptRegistry.delete(id);
				}
			},
		},
		maps: {
			get(virtualCode, scriptId) {
				if (!scriptId) {
					const sourceScript = virtualCodeToSourceFileMap.get(virtualCode);
					if (!sourceScript) {
						return;
					}
					scriptId = sourceScript.id;
				}
				for (const [id, [_snapshot, map]] of this.forEach(virtualCode)) {
					if (id === scriptId) {
						return map;
					}
				}
			},
			forEach(virtualCode) {
				let map = virtualCodeToMaps.get(virtualCode.snapshot);
				if (!map) {
					map = new Map();
					virtualCodeToMaps.set(virtualCode.snapshot, map);
				}
				updateVirtualCodeMapOfMap<T>(virtualCode, map, id => {
					if (id) {
						throw 'not implemented';
						// const sourceScript = sourceScripts.get(id)!;
						// return [id, sourceScript.snapshot];
					}
					else {
						const sourceScript = virtualCodeToSourceFileMap.get(virtualCode)!;
						return [sourceScript.id, sourceScript.snapshot];
					}
				});
				return map;
			},
		},
		linkedCodeMaps: {
			get(virtualCode) {
				if (!virtualCodeToLinkedCodeMap.has(virtualCode.snapshot)) {
					virtualCodeToLinkedCodeMap.set(
						virtualCode.snapshot,
						virtualCode.linkedCodeMappings
							? new LinkedCodeMap(virtualCode.linkedCodeMappings)
							: undefined
					);
				}
				return virtualCodeToLinkedCodeMap.get(virtualCode.snapshot);
			},
		},
	};
}

export function updateVirtualCodeMapOfMap<T>(
	virtualCode: VirtualCode,
	mapOfMap: Map<T, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>,
	getSourceSnapshot: (source: string | undefined) => [T, ts.IScriptSnapshot] | undefined
) {
	const sources = new Set<string | undefined>();
	if (!virtualCode.mappings.length) {
		const source = getSourceSnapshot(undefined);
		if (source) {
			mapOfMap.set(source[0], [source[1], new SourceMap([])]);
		}
	}
	for (const mapping of virtualCode.mappings) {
		if (sources.has(mapping.source)) {
			continue;
		}
		sources.add(mapping.source);
		const source = getSourceSnapshot(mapping.source);
		if (!source) {
			continue;
		}
		if (!mapOfMap.has(source[0]) || mapOfMap.get(source[0])![0] !== source[1]) {
			mapOfMap.set(source[0], [source[1], new SourceMap(virtualCode.mappings.filter(mapping2 => mapping2.source === mapping.source))]);
		}
	}
}

export function* forEachEmbeddedCode(virtualCode: VirtualCode): Generator<VirtualCode> {
	yield virtualCode;
	if (virtualCode.embeddedCodes) {
		for (const embeddedCode of virtualCode.embeddedCodes) {
			yield* forEachEmbeddedCode(embeddedCode);
		}
	}
}
