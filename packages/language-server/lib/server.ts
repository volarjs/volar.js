import { LanguageServicePlugin } from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { register as registerConfigurationSupport } from './features/configurations.js';
import { register as registerEditorFeaturesSupport } from './features/editorFeatures.js';
import { register as registerFileSystemSupport } from './features/fileSystem.js';
import { register as registerFileWatcher } from './features/fileWatcher.js';
import { register as registerLanguageFeatures } from './features/languageFeatures.js';
import { register as registerTextDocumentRegistry } from './features/textDocuments.js';
import { register as registerWorkspaceFolderRegistry } from './features/workspaceFolders.js';
import type { ExperimentalFeatures, LanguageServerProject } from './types.js';

export function createServerBase(connection: vscode.Connection) {
	const serverCapabilities: vscode.ServerCapabilities<ExperimentalFeatures> = {};
	const server = {
		initializeParams: undefined! as vscode.InitializeParams,
		project: undefined! as LanguageServerProject,
		languageServicePlugins: undefined! as LanguageServicePlugin[],
		features: undefined! as ReturnType<typeof registerFeatures>,
		initialize(
			params: vscode.InitializeParams,
			project: LanguageServerProject,
			languageServicePlugins: LanguageServicePlugin[]
		): vscode.InitializeResult<ExperimentalFeatures> {
			this.initializeParams = params;
			this.project = project;
			this.languageServicePlugins = languageServicePlugins;
			this.features = registerFeatures();
			return { capabilities: serverCapabilities };
		},
		initialized() {
			this.project.setup(this);
		},
		shutdown() {
			this.project.reload();
		},
	};

	return server;

	function registerFeatures() {
		const configurations = registerConfigurationSupport(connection, server.initializeParams);
		const editorFeatures = registerEditorFeaturesSupport(connection, server.project);
		const documents = registerTextDocumentRegistry(connection, serverCapabilities);
		const workspaceFolders = registerWorkspaceFolderRegistry(connection, server.initializeParams, server.project, serverCapabilities);
		const languageFeatures = registerLanguageFeatures(connection, documents, configurations, server.initializeParams, server.project, server.languageServicePlugins, serverCapabilities);
		const fileWatcher = registerFileWatcher(connection, server.initializeParams);
		const fileSystem = registerFileSystemSupport(documents, fileWatcher);

		return {
			configurations,
			editorFeatures,
			documents,
			workspaceFolders,
			languageFeatures,
			fileWatcher,
			fileSystem,
		};
	}
}
