import { SpanMap } from '@volar/source-map';

export class LinkedCodeMap extends SpanMap {
	*getLinkedOffsets(start: number) {
		for (const mapped of this.originalToVirtualPositions(start)) {
			yield mapped.position;
		}
		for (const mapped of this.virtualToOriginalPositions(start)) {
			yield mapped.position;
		}
	}
}
