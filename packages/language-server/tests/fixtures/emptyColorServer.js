// A server whose color provider has no result for any document.
const { createConnection, createServer, createSimpleProject } = require('../../node');

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params =>
	server.initialize(
		params,
		createSimpleProject([]),
		[{
			capabilities: {
				colorProvider: true,
			},
			create() {
				return {
					provideDocumentColors() {},
					provideColorPresentations() {},
				};
			},
		}],
	)
);
connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
