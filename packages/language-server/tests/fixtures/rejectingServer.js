// A server whose project can never provide a language service.
const { createConnection, createServer } = require('../../node');

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params =>
	server.initialize(
		params,
		{
			setup() {},
			getLanguageService() {
				return Promise.reject(new Error('no language service'));
			},
			getExistingLanguageServices() {
				return [];
			},
			reload() {},
		},
		[{
			capabilities: {
				hoverProvider: true,
				diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
			},
			create() {
				return {};
			},
		}],
	)
);
connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
