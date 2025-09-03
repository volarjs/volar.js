export { Mapping, SourceMap } from '@volar/source-map';
export * from './lib/editor';
export * from './lib/linkedCodeMap';
export * from './lib/types';
export * from './lib/utils';

import { SourceMap } from '@volar/source-map';
import { LinkedCodeMap } from './lib/linkedCodeMap';
import type {
	CodegenContext,
	IScriptSnapshot,
	Language,
	LanguagePlugin,
	Mapper,
	MapperFactory,
	SourceScript,
	VirtualCode,
} from './lib/types';

export const defaultMapperFactory: MapperFactory = mappings => new SourceMap(mappings);

export function createLanguage<T>(
	plugins: LanguagePlugin<T>[],
	scriptRegistry: Map<T, SourceScript<T>>,
	sync: (id: T, includeFsFiles: boolean, shouldRegister: boolean) => void,
	onAssociationDirty?: (targetId: T) => void,
) {
	const virtualCodeToSourceScriptMap = new WeakMap<VirtualCode, SourceScript<T>>();
	const virtualCodeToSourceMap = new WeakMap<IScriptSnapshot, WeakMap<IScriptSnapshot, Mapper>>();
	const virtualCodeToLinkedCodeMap = new WeakMap<IScriptSnapshot, [IScriptSnapshot, LinkedCodeMap | undefined]>();
	const language: Language<T> = {
		mapperFactory: defaultMapperFactory,
		plugins,
		scripts: {
			fromVirtualCode(virtualCode) {
				return virtualCodeToSourceScriptMap.get(virtualCode)!;
			},
			get(id, includeFsFiles = true, shouldRegister = false) {
				sync(id, includeFsFiles, shouldRegister);
				const result = scriptRegistry.get(id);
				// The sync function provider may not always call the set function due to caching, so it is necessary to explicitly check isAssociationDirty.
				if (result?.isAssociationDirty) {
					this.set(id, result.snapshot, result.languageId);
				}
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
					console.warn(`languageId not found for ${String(id)}`);
					return;
				}
				let associatedOnly = false;
				for (const plugin of plugins) {
					if (plugin.isAssociatedFileOnly?.(id, languageId)) {
						associatedOnly = true;
						break;
					}
				}
				if (scriptRegistry.has(id)) {
					const sourceScript = scriptRegistry.get(id)!;
					if (sourceScript.languageId !== languageId || sourceScript.associatedOnly !== associatedOnly) {
						this.delete(id);
						triggerTargetsDirty(sourceScript);
						return this.set(id, snapshot, languageId);
					}
					else if (associatedOnly) {
						if (sourceScript.snapshot !== snapshot) {
							sourceScript.snapshot = snapshot;
							triggerTargetsDirty(sourceScript);
						}
					}
					else if (sourceScript.isAssociationDirty || sourceScript.snapshot !== snapshot) {
						if (sourceScript.snapshot !== snapshot) {
							sourceScript.snapshot = snapshot;
							triggerTargetsDirty(sourceScript);
						}
						const codegenCtx = prepareCreateVirtualCode(sourceScript);
						if (sourceScript.generated) {
							const { updateVirtualCode, createVirtualCode } = sourceScript.generated.languagePlugin;
							const newVirtualCode = updateVirtualCode
								? updateVirtualCode(id, sourceScript.generated.root, snapshot, codegenCtx)
								: createVirtualCode?.(id, languageId, snapshot, codegenCtx);
							if (newVirtualCode) {
								sourceScript.generated.root = newVirtualCode;
								sourceScript.generated.embeddedCodes.clear();
								for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
									virtualCodeToSourceScriptMap.set(code, sourceScript);
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
					const sourceScript: SourceScript<T> = {
						id: id,
						languageId,
						snapshot,
						associatedIds: new Set(),
						targetIds: new Set(),
						associatedOnly,
					};
					scriptRegistry.set(id, sourceScript);
					if (associatedOnly) {
						return sourceScript;
					}
					for (const languagePlugin of _plugins) {
						const virtualCode = languagePlugin.createVirtualCode?.(
							id,
							languageId,
							snapshot,
							prepareCreateVirtualCode(sourceScript),
						);
						if (virtualCode) {
							sourceScript.generated = {
								root: virtualCode,
								languagePlugin,
								embeddedCodes: new Map(),
							};
							for (const code of forEachEmbeddedCode(virtualCode)) {
								virtualCodeToSourceScriptMap.set(code, sourceScript);
								sourceScript.generated.embeddedCodes.set(code.id, code);
							}
							break;
						}
					}

					return sourceScript;
				}
			},
			delete(id) {
				const sourceScript = scriptRegistry.get(id);
				if (sourceScript) {
					sourceScript.generated?.languagePlugin.disposeVirtualCode?.(id, sourceScript.generated.root);
					scriptRegistry.delete(id);
					triggerTargetsDirty(sourceScript);
				}
			},
		},
		maps: {
			get(virtualCode, sourceScript) {
				let mapCache = virtualCodeToSourceMap.get(virtualCode.snapshot);
				if (!mapCache) {
					virtualCodeToSourceMap.set(
						virtualCode.snapshot,
						mapCache = new WeakMap(),
					);
				}
				if (!mapCache.has(sourceScript.snapshot)) {
					const mappings = virtualCode.associatedScriptMappings?.get(sourceScript.id) ?? virtualCode.mappings;
					mapCache.set(
						sourceScript.snapshot,
						language.mapperFactory(mappings),
					);
				}
				return mapCache.get(sourceScript.snapshot)!;
			},
			*forEach(virtualCode) {
				const sourceScript = virtualCodeToSourceScriptMap.get(virtualCode)!;
				yield [
					sourceScript,
					this.get(virtualCode, sourceScript),
				];
				if (virtualCode.associatedScriptMappings) {
					for (const [relatedScriptId] of virtualCode.associatedScriptMappings) {
						const relatedSourceScript = scriptRegistry.get(relatedScriptId as T);
						if (relatedSourceScript) {
							yield [
								relatedSourceScript,
								this.get(virtualCode, relatedSourceScript),
							];
						}
					}
				}
			},
		},
		linkedCodeMaps: {
			get(virtualCode) {
				const sourceScript = virtualCodeToSourceScriptMap.get(virtualCode)!;
				let mapCache = virtualCodeToLinkedCodeMap.get(virtualCode.snapshot);
				if (mapCache?.[0] !== sourceScript.snapshot) {
					virtualCodeToLinkedCodeMap.set(
						virtualCode.snapshot,
						mapCache = [
							sourceScript.snapshot,
							virtualCode.linkedCodeMappings
								? new LinkedCodeMap(virtualCode.linkedCodeMappings)
								: undefined,
						],
					);
				}
				return mapCache[1];
			},
		},
	};

	return language;

	function triggerTargetsDirty(sourceScript: SourceScript<T>) {
		sourceScript.targetIds.forEach(id => {
			const sourceScript = scriptRegistry.get(id);
			if (sourceScript) {
				sourceScript.isAssociationDirty = true;
				onAssociationDirty?.(sourceScript.id);
			}
		});
	}

	function prepareCreateVirtualCode(sourceScript: SourceScript<T>): CodegenContext<T> {
		for (const id of sourceScript.associatedIds) {
			scriptRegistry.get(id)?.targetIds.delete(sourceScript.id);
		}
		sourceScript.associatedIds.clear();
		sourceScript.isAssociationDirty = false;
		return {
			getAssociatedScript(id) {
				sync(id, true, true);
				const relatedSourceScript = scriptRegistry.get(id);
				if (relatedSourceScript) {
					relatedSourceScript.targetIds.add(sourceScript.id);
					sourceScript.associatedIds.add(relatedSourceScript.id);
				}
				return relatedSourceScript;
			},
		};
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
