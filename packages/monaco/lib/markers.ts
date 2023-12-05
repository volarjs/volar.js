import type * as volar from '@volar/language-service';
import type { editor } from 'monaco-types';

export const markers = new WeakMap<editor.IMarkerData, volar.Diagnostic>();
