import type { CodeMapping, VirtualCode } from '@volar/language-core';
import { createUriMap } from '@volar/language-service';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';
import {
	GetMatchTsConfigRequest,
	GetServicePluginsRequest,
	GetVirtualCodeRequest,
	GetVirtualFileRequest,
	UpdateServicePluginStateNotification,
	UpdateVirtualCodeStateNotification,
} from '../../protocol';
import type { LanguageServerState } from '../types';

export function register(server: LanguageServerState) {
	server.onInitialize(() => {
		const { project } = server;
		const scriptVersions = createUriMap<number>();
		const scriptVersionSnapshots = new WeakSet<ts.IScriptSnapshot>();

		server.connection.onRequest(GetMatchTsConfigRequest.type, async params => {
			const uri = URI.parse(params.uri);
			const languageService = await project.getLanguageService(uri);
			const tsProject = languageService.context.project.typescript;
			if (tsProject?.configFileName) {
				const { configFileName, uriConverter } = tsProject;
				return { uri: uriConverter.asUri(configFileName).toString() };
			}
		});
		server.connection.onRequest(GetVirtualFileRequest.type, async document => {
			const uri = URI.parse(document.uri);
			const languageService = await project.getLanguageService(uri);
			const documentUri = URI.parse(document.uri);
			const sourceScript = languageService.context.language.scripts.get(documentUri);
			if (sourceScript?.generated) {
				return prune(sourceScript.generated.root);
			}

			function prune(virtualCode: VirtualCode): GetVirtualFileRequest.VirtualCodeInfo {
				const uri = languageService.context.encodeEmbeddedDocumentUri(sourceScript!.id, virtualCode.id);
				let version = scriptVersions.get(uri) ?? 0;
				if (!scriptVersionSnapshots.has(virtualCode.snapshot)) {
					version++;
					scriptVersions.set(uri, version);
					scriptVersionSnapshots.add(virtualCode.snapshot);
				}
				return {
					fileUri: sourceScript!.id.toString(),
					virtualCodeId: virtualCode.id,
					languageId: virtualCode.languageId,
					embeddedCodes: virtualCode.embeddedCodes?.map(prune) || [],
					version,
					disabled: languageService.context.disabledEmbeddedDocumentUris.has(uri),
				};
			}
		});
		server.connection.onRequest(GetVirtualCodeRequest.type, async params => {
			const uri = URI.parse(params.fileUri);
			const languageService = await project.getLanguageService(uri);
			const sourceScript = languageService.context.language.scripts.get(URI.parse(params.fileUri));
			const virtualCode = sourceScript?.generated?.embeddedCodes.get(params.virtualCodeId);
			if (virtualCode) {
				const mappings: Record<string, CodeMapping[]> = {};
				for (const [sourceScript, map] of languageService.context.language.maps.forEach(virtualCode)) {
					mappings[sourceScript.id.toString()] = map.mappings;
				}
				return {
					content: virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength()),
					mappings,
				};
			}
		});
		server.connection.onNotification(UpdateVirtualCodeStateNotification.type, async params => {
			const uri = URI.parse(params.fileUri);
			const languageService = await project.getLanguageService(uri);
			const virtualFileUri = languageService.context.encodeEmbeddedDocumentUri(
				URI.parse(params.fileUri),
				params.virtualCodeId,
			);
			if (params.disabled) {
				languageService.context.disabledEmbeddedDocumentUris.set(virtualFileUri, true);
			}
			else {
				languageService.context.disabledEmbeddedDocumentUris.delete(virtualFileUri);
			}
		});
		server.connection.onNotification(UpdateServicePluginStateNotification.type, async params => {
			const uri = URI.parse(params.uri);
			const languageService = await project.getLanguageService(uri);
			const plugin = languageService.context.plugins[params.serviceId][1];
			if (params.disabled) {
				languageService.context.disabledServicePlugins.add(plugin);
			}
			else {
				languageService.context.disabledServicePlugins.delete(plugin);
			}
		});
		server.connection.onRequest(GetServicePluginsRequest.type, async params => {
			const uri = URI.parse(params.uri);
			const languageService = await project.getLanguageService(uri);
			const result: GetServicePluginsRequest.ResponseType = [];
			for (let pluginIndex = 0; pluginIndex < languageService.context.plugins.length; pluginIndex++) {
				const plugin = languageService.context.plugins[pluginIndex];
				result.push({
					id: pluginIndex,
					name: plugin[0].name,
					disabled: languageService.context.disabledServicePlugins.has(plugin[1]),
					features: Object.keys(plugin[1]),
				});
			}
			return result;
		});
	});
}
