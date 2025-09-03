import { beforeEach, describe, expect, it } from 'vitest';
import { SnapshotDocument } from '../lib/utils/snapshotDocument';

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

	it('returns correct change range with multiple edits', () => {
		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(0), end: snapshotDocument.positionAt(0) },
			text: 'HelloXXWorld',
		}], 1);
		const snapshot1 = snapshotDocument.getSnapshot();

		snapshotDocument.update([
			// -> HelloXWorld
			{
				range: { start: snapshotDocument.positionAt(5), end: snapshotDocument.positionAt(6) },
				text: '',
			},
			// -> HelloWorld
			{
				range: { start: snapshotDocument.positionAt(5), end: snapshotDocument.positionAt(6) },
				text: '',
			},
		], 2);
		const snapshot2 = snapshotDocument.getSnapshot();

		expect(snapshot2.getText(0, snapshot2.getLength())).toEqual('HelloWorld');
		const changeRange = snapshot2.getChangeRange(snapshot1);
		expect(changeRange).toEqual({ span: { start: 5, length: 2 }, newLength: 0 });
	});

	it('returns correct change range with multiple overlapping edits', () => {
		snapshotDocument.update([{
			range: { start: snapshotDocument.positionAt(0), end: snapshotDocument.positionAt(0) },
			text: 'HelloXYYXWorld',
		}], 1);
		const snapshot1 = snapshotDocument.getSnapshot();

		snapshotDocument.update([
			// -> HelloXXWorld
			{
				range: { start: snapshotDocument.positionAt(6), end: snapshotDocument.positionAt(8) },
				text: '',
			},
			// -> HelloWorld
			{
				range: { start: snapshotDocument.positionAt(5), end: snapshotDocument.positionAt(7) },
				text: '',
			},
		], 2);
		const snapshot2 = snapshotDocument.getSnapshot();

		expect(snapshot2.getText(0, snapshot2.getLength())).toEqual('HelloWorld');
		const changeRange = snapshot2.getChangeRange(snapshot1);
		expect(changeRange).toEqual({ span: { start: 5, length: 4 }, newLength: 0 });
	});

	it('allows GC of unreferenced snapshots', () => {
		const _WeakRef = globalThis.WeakRef;

		(globalThis as any).WeakRef = class<T> {
			constructor(public ref: T) {}
			deref() {
				return this.ref;
			}
			clear() {
				this.ref = undefined as any;
			}
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
