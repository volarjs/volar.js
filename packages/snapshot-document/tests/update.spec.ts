import { beforeEach, describe, expect, it } from 'vitest';
import { SnapshotDocument } from '../lib/snapshotDocument';

describe('SnapshotDocument', () => {
	let snapshotDocument: SnapshotDocument;

	beforeEach(() => {
		snapshotDocument = new SnapshotDocument('', '', 0, '');
	});

	it('appends text with range', () => {
		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(0), end: snapshotDocument.positionAt(0) },
			text: 'Hello',
		}], 1);
		expect(snapshotDocument.getText()).toBe('Hello');

		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(5), end: snapshotDocument.positionAt(5) },
			text: 'World',
		}], 2);
		expect(snapshotDocument.getText()).toBe('HelloWorld');
	});

	it('replaces text without range', () => {
		snapshotDocument.update([
			{ text: 'Hello' },
			{ text: 'World' },
		], 1);
		expect(snapshotDocument.getText()).toBe('World');
	});

	it('returns correct change range', () => {
		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(0), end: snapshotDocument.positionAt(0) },
			text: 'Hello',
		}], 1);
		const snapshot1 = snapshotDocument.getSnapshot();

		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(5), end: snapshotDocument.positionAt(5) },
			text: 'World',
		}], 2);
		const snapshot2 = snapshotDocument.getSnapshot();

		const changeRange = snapshot2.getChangeRange(snapshot1);
		expect(changeRange).toEqual({ span: { start: 5, length: 0 }, newLength: 5 });
	});

	it('allows GC of unreferenced snapshots', () => {
		const _WeakRef = globalThis.WeakRef;

		(globalThis as any).WeakRef = class <T> {
			constructor(public ref: T) { }
			deref() { return this.ref; }
			clear() { this.ref = undefined as any; }
		};

		// create snapshot
		snapshotDocument.getSnapshot();

		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(0), end: snapshotDocument.positionAt(0) },
			text: 'Hello',
		}], 1);

		// @ts-expect-error
		expect(snapshotDocument.snapshots.length).toBe(2);

		// @ts-expect-error
		snapshotDocument.snapshots[0].ref.clear();

		// trigger clearUnreferencedVersions()
		snapshotDocument.getSnapshot();

		// @ts-expect-error
		expect(snapshotDocument.snapshots.length).toBe(1);

		globalThis.WeakRef = _WeakRef;
	});
});
