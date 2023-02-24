import * as vscode from 'vscode-languageserver-protocol';
import type { editor } from 'monaco-editor-core';

export const markers = new WeakMap<editor.IMarkerData, vscode.Diagnostic>();
