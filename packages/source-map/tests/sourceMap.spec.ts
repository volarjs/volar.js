import { describe, expect, test } from 'vitest';
import { SourceMap } from '../lib/sourceMap';

describe('sourceMap', () => {
	test('Angular template', () => {
		const map = new SourceMap([
			{
				sourceOffsets: [
					`{{|data?.icon?.toString()}}`.indexOf('|'),
					//  ^^^^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? ((null as any ? (this.|data)!.icon : undefined)!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                                                     ^^^^
				],
				lengths: [
					`data`.length,
				],
				data: {},
			},
			{
				sourceOffsets: [
					`{{data?.|icon?.toString()}}`.indexOf('|'),
					//        ^^^^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.|icon : undefined)!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                                                            ^^^^
				],
				lengths: [
					`icon`.length,
				],
				data: {},
			},
			{
				sourceOffsets: [
					`{{data?.icon?.|toString()}}`.indexOf('|'),
					//              ^^^^^^^^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.|toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                                                                               ^^^^^^^^
				],
				lengths: [
					`toString`.length,
				],
				data: {},
			},
			{
				sourceOffsets: [
					`{{data?.icon?.|toString()}}`.indexOf('|'),
					//                      ^^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!|() : undefined)`
						.indexOf('|'),
					//                                                                                                      ^^
				],
				lengths: [
					`()`.length,
				],
				data: {},
			},
			{
				sourceOffsets: [
					`{{|data?.icon?.toString()}}`.indexOf('|'),
					// ^
					`{{data?.icon|?.toString()}}`.indexOf('|'),
					//           ^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                               ^
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                                                                            ^
				],
				lengths: [0, 0],
				data: {},
			},
			{
				sourceOffsets: [
					`{{|data?.icon?.toString()}}`.indexOf('|'),
					// ^
					`{{data?.icon?.toString|()}}`.indexOf('|'),
					//                     ^
				],
				generatedOffsets: [
					`(null as any ? (|(null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//               ^
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))|!() : undefined)`
						.indexOf('|'),
					//                                                                                                    ^
				],
				lengths: [0, 0],
				data: {},
			},
			{
				sourceOffsets: [
					`{{|data?.icon?.toString()}}`.indexOf('|'),
					// ^
					`{{data?.icon?.toString()|}}`.indexOf('|'),
					//                       ^
				],
				generatedOffsets: [
					0,
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
						.length,
				],
				lengths: [0, 0],
				data: {},
			},
		]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data|?.icon?.toString()}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				`(null as any ? ((null as any ? ((null as any ? (this.|data)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                                                    ^
				`(null as any ? ((null as any ? ((null as any ? (this.data|)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                                                        ^
			],
		]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.ic|on?.toString()}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.icon|?.toString()}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                               ^
				`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                                                                            ^
			],
		]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.icon?.toString|()}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				`(null as any ? (|(null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//               ^
				`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))|!() : undefined)`
					.indexOf('|'),
				//                                                                                                    ^
			],
		]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.icon?.toString()|}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				0,
				`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.length,
			],
		]);
	});

	test('Angular template - fallbackToAnyMatch', () => {
		const map = new SourceMap([
			{
				sourceOffsets: [
					`{{|data?.icon?.toString()}}`.indexOf('|'),
					// ^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                               ^
				],
				lengths: [0, 0],
				data: {},
			},
			{
				sourceOffsets: [
					`{{data?.icon|?.toString()}}`.indexOf('|'),
					//           ^
				],
				generatedOffsets: [
					`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`
						.indexOf('|'),
					//                                                                            ^
				],
				lengths: [0, 0],
				data: {},
			},
		]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.icon|?.toString()}}`.indexOf('|'),
			false,
		)].map(mapped => mapped.slice(0, 2))).toEqual([]);

		expect([...map.toGeneratedRange(
			`{{|data?.icon?.toString()}}`.indexOf('|'),
			`{{data?.icon|?.toString()}}`.indexOf('|'),
			true,
		)].map(mapped => mapped.slice(0, 2))).toEqual([
			[
				`(null as any ? ((null as any ? (|(null as any ? (this.data)!.icon : undefined)!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                               ^
				`(null as any ? ((null as any ? ((null as any ? (this.data)!.icon : undefined)|!.toString : undefined))!() : undefined)`
					.indexOf('|'),
				//                                                                            ^
			],
		]);
	});
});
