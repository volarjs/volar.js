import * as SourceMaps from '@volar/source-map';
import { MirrorBehaviorCapabilities } from './types.js';

export class MirrorMap extends SourceMaps.SourceMap<[MirrorBehaviorCapabilities, MirrorBehaviorCapabilities]> {
	*findMirrorOffsets(start: number) {
		for (const mapped of this.toGeneratedOffsets(start)) {
			yield [mapped[0], mapped[1].data[1]] as const;
		}
		for (const mapped of this.toSourceOffsets(start)) {
			yield [mapped[0], mapped[1].data[0]] as const;
		}
	}
}
