export * from '@volar/source-map';
export * from './lib/editorFeatures';
export * from './lib/linkedCodeMap';
export * from './lib/types';
export * from './lib/utils';

import { SourceMap } from '@volar/source-map';
import type * as ts from 'typescript';
import { LinkedCodeMap } from './lib/linkedCodeMap';
import type { CodeInformation, CodegenContext, Language, LanguagePlugin, SourceScript, VirtualCode } from './lib/types';

export function createLanguage<T>(
	plugins: LanguagePlugin<T>[],
	scriptRegistry: Map<T, SourceScript<T>>,
	sync: (id: T) => void
): Language<T> {
	const virtualCodeToSourceScriptMap = new WeakMap<VirtualCode<T>, SourceScript<T>>();
	const virtualCodeToSourceMap = new WeakMap<ts.IScriptSnapshot, WeakMap<ts.IScriptSnapshot, SourceMap<CodeInformation>>>();
	const virtualCodeToLinkedCodeMap = new WeakMap<ts.IScriptSnapshot, [ts.IScriptSnapshot, LinkedCodeMap | undefined]>();

	return {
		plugins,
		scripts: {
			fromVirtualCode(virtualCode) {
				return virtualCodeToSourceScriptMap.get(virtualCode)!;
			},
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
					else if (sourceScript.isRelatedDirty || sourceScript.snapshot !== snapshot) {
						// snapshot updated
						sourceScript.snapshot = snapshot;
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
						triggerTargetsDirty(sourceScript);
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
						relateds: new Set(),
						targets: new Set(),
					};
					scriptRegistry.set(id, sourceScript);

					for (const languagePlugin of _plugins) {
						const virtualCode = languagePlugin.createVirtualCode?.(id, languageId, snapshot, prepareCreateVirtualCode(sourceScript));
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
			get(virtualCode) {
				for (const map of this.forEach(virtualCode)) {
					return map[2];
				}
				throw `no map found for ${virtualCode.id}`;
			},
			*forEach(virtualCode) {
				let mapCache = virtualCodeToSourceMap.get(virtualCode.snapshot);
				if (!mapCache) {
					virtualCodeToSourceMap.set(
						virtualCode.snapshot,
						mapCache = new WeakMap()
					);
				}

				const sourceScript = virtualCodeToSourceScriptMap.get(virtualCode)!;
				if (!mapCache.has(sourceScript.snapshot)) {
					mapCache.set(
						sourceScript.snapshot,
						new SourceMap(virtualCode.mappings)
					);
				}
				yield [sourceScript.id, sourceScript.snapshot, mapCache.get(sourceScript.snapshot)!];

				if (virtualCode.associatedScriptMappings) {
					for (const [relatedScriptId, relatedMappings] of virtualCode.associatedScriptMappings) {
						const relatedSourceScript = scriptRegistry.get(relatedScriptId);
						if (relatedSourceScript) {
							if (!mapCache.has(relatedSourceScript.snapshot)) {
								mapCache.set(
									relatedSourceScript.snapshot,
									new SourceMap(relatedMappings)
								);
							}
							yield [relatedSourceScript.id, relatedSourceScript.snapshot, mapCache.get(relatedSourceScript.snapshot)!];
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
						]
					);
				}
				return mapCache[1];
			},
		},
	};

	function triggerTargetsDirty(sourceScript: SourceScript<T>) {
		sourceScript.targets.forEach(id => {
			const sourceScript = scriptRegistry.get(id);
			if (sourceScript) {
				sourceScript.isRelatedDirty = true;
			}
		});
	}

	function prepareCreateVirtualCode(sourceScript: SourceScript<T>): CodegenContext<T> {
		for (const id of sourceScript.relateds) {
			scriptRegistry.get(id)?.targets.delete(sourceScript.id);
		}
		sourceScript.relateds.clear();
		sourceScript.isRelatedDirty = false;
		return {
			getAssociatedScript(id) {
				sync(id);
				const relatedSourceScript = scriptRegistry.get(id);
				if (relatedSourceScript) {
					relatedSourceScript.targets.add(sourceScript.id);
					sourceScript.relateds.add(relatedSourceScript.id);
				}
				return relatedSourceScript;
			},
		};
	}
}

export function* forEachEmbeddedCode<T>(virtualCode: VirtualCode<T>): Generator<VirtualCode<T>> {
	yield virtualCode;
	if (virtualCode.embeddedCodes) {
		for (const embeddedCode of virtualCode.embeddedCodes) {
			yield* forEachEmbeddedCode(embeddedCode);
		}
	}
}
