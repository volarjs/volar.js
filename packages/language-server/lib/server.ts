import { type LanguageServicePlugin } from '@volar/language-service';
import type * as vscode from 'vscode-languageserver';
import { register as registerConfigurationSupport } from './features/configurations.js';
import { register as registerEditorFeaturesSupport } from './features/editorFeatures.js';
import { register as registerFileSystemSupport } from './features/fileSystem.js';
import { register as registerFileWatcher } from './features/fileWatcher.js';
import { register as registerLanguageFeatures } from './features/languageFeatures.js';
import { register as registerTextDocumentRegistry } from './features/textDocuments.js';
import { register as registerWorkspaceFolderRegistry } from './features/workspaceFolders.js';
import type {
	ExperimentalFeatures,
	LanguageServerEnvironment,
	LanguageServerProject,
	LanguageServerState,
} from './types.js';

export function createServerBase(connection: vscode.Connection, env: LanguageServerEnvironment) {
	const onInitializeCallbacks: ((serverCapabilities: vscode.ServerCapabilities<ExperimentalFeatures>) => void)[] = [];
	const onInitializedCallbacks: (() => void)[] = [];
	const state: LanguageServerState = {
		env,
		connection,
		initializeParams: undefined! as vscode.InitializeParams,
		project: undefined! as LanguageServerProject,
		languageServicePlugins: undefined! as LanguageServicePlugin[],
		onInitialize(callback: (serverCapabilities: vscode.ServerCapabilities<ExperimentalFeatures>) => void) {
			onInitializeCallbacks.push(callback);
		},
		onInitialized(callback: () => void) {
			onInitializedCallbacks.push(callback);
		},
	};
	const configurations = registerConfigurationSupport(state);
	const editorFeatures = registerEditorFeaturesSupport(state);
	const documents = registerTextDocumentRegistry(state);
	const workspaceFolders = registerWorkspaceFolderRegistry(state);
	const fileWatcher = registerFileWatcher(state);
	const languageFeatures = registerLanguageFeatures(state, documents, configurations);
	const fileSystem = registerFileSystemSupport(documents, fileWatcher);
	const server = {
		...state,
		get initializeParams() {
			return state.initializeParams;
		},
		get project() {
			return state.project;
		},
		get languageServicePlugins() {
			return state.languageServicePlugins;
		},
		initialize(
			params: vscode.InitializeParams,
			project: LanguageServerProject,
			languageServicePlugins: LanguageServicePlugin[],
		): vscode.InitializeResult<ExperimentalFeatures> {
			state.initializeParams = params;
			state.project = project;
			state.languageServicePlugins = languageServicePlugins;
			const serverCapabilities: vscode.ServerCapabilities<ExperimentalFeatures> = {};
			onInitializeCallbacks.forEach(cb => cb(serverCapabilities));
			return { capabilities: serverCapabilities };
		},
		initialized() {
			onInitializedCallbacks.forEach(cb => cb());
			state.project.setup(server);
		},
		shutdown() {
			state.project.reload();
		},
		configurations,
		editorFeatures,
		documents,
		workspaceFolders,
		fileWatcher,
		languageFeatures,
		fileSystem,
	};

	return server;
}
