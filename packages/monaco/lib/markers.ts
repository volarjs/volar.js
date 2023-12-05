import type { Diagnostic } from '@volar/language-service';
import type { editor } from 'monaco-types';

export const markers = new WeakMap<editor.IMarkerData, Diagnostic>();
