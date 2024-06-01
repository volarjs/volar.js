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
	const virtualCodeToSourceScriptMap = new WeakMap<VirtualCode, SourceScript<T>>();
	const virtualCodeToSourceMap = new WeakMap<ts.IScriptSnapshot, [ts.IScriptSnapshot, SourceMap<CodeInformation>]>();
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
			get(virtualCode) {
				const sourceScript = virtualCodeToSourceScriptMap.get(virtualCode)!;
				let mapCache = virtualCodeToSourceMap.get(virtualCode.snapshot);
				if (mapCache?.[0] !== sourceScript.snapshot) {
					if (virtualCode.mappings.some(mapping => mapping.source)) {
						throw 'not implemented';
					}
					virtualCodeToSourceMap.set(
						virtualCode.snapshot,
						mapCache = [
							sourceScript.snapshot,
							new SourceMap(virtualCode.mappings),
						]
					);
				}
				return mapCache[1];
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
}

export function* forEachEmbeddedCode(virtualCode: VirtualCode): Generator<VirtualCode> {
	yield virtualCode;
	if (virtualCode.embeddedCodes) {
		for (const embeddedCode of virtualCode.embeddedCodes) {
			yield* forEachEmbeddedCode(embeddedCode);
		}
	}
}
