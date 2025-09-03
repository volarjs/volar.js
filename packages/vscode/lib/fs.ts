import * as vscode from 'vscode';

const textDecoder = new TextDecoder('utf8');

export async function readFile(uri: vscode.Uri) {
	try {
		return textDecoder.decode(await vscode.workspace.fs.readFile(uri));
	}
	catch {}
}

export async function readDirectory(uri: vscode.Uri) {
	try {
		return await vscode.workspace.fs.readDirectory(uri);
	}
	catch {
		return [];
	}
}

export async function stat(uri: vscode.Uri) {
	try {
		return await vscode.workspace.fs.stat(uri);
	}
	catch {}
}
