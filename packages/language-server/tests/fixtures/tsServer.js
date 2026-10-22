// A server backed by a TypeScript project and no language plugins.
const ts = require('typescript');
const { createConnection, createServer, createTypeScriptProject } = require('../../node');

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params =>
	server.initialize(
		params,
		createTypeScriptProject(ts, undefined, () => ({ languagePlugins: [] })),
		[],
	)
);
connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
