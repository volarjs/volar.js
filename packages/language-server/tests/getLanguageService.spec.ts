import * as path from 'path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { type LanguageServerHandle, startLanguageServer } from '../../test-utils';
import { LogMessageNotification, MessageType } from '../node';

let server: LanguageServerHandle;
const errors: string[] = [];

beforeAll(async () => {
	server = startLanguageServer(path.join(__dirname, 'fixtures/rejectingServer.js'), __dirname);
	server.connection.onNotification(LogMessageNotification.type, ({ type, message }) => {
		if (type === MessageType.Error) {
			errors.push(message);
		}
	});
	await server.initialize('file:///', {});
});

afterAll(async () => {
	await server.shutdown();
});

test('a rejected getLanguageService fails only the request and the diagnostics pass', async () => {
	const document = await server.openUntitledDocument('plaintext', 'text');
	expect(await server.sendHoverRequest(document.uri, { line: 0, character: 0 })).toBeNull();
	// push diagnostics run after a 250ms delay
	await new Promise(resolve => setTimeout(resolve, 600));
	expect(server.process.exitCode).toBeNull();
	expect(await server.sendHoverRequest(document.uri, { line: 0, character: 0 })).toBeNull();
	expect(errors.length).toBeGreaterThanOrEqual(3);
	expect(errors.every(error => error.includes('no language service'))).toBe(true);
});
