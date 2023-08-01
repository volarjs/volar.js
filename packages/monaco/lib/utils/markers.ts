import type * as vscode from 'vscode-languageserver-protocol';
import type { editor } from 'monaco-types';

export const markers = new WeakMap<editor.IMarkerData, vscode.Diagnostic>();
