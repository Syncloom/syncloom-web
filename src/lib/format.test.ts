import { describe, expect, it } from 'vitest';
import { fileKind, formatBytes } from './format';

describe('format', () => {
	it('formats sizes', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
		expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB');
	});
	it('classifies files', () => {
		expect(fileKind('Photo.JPG').glyph).toBe('image');
		expect(fileKind('a.tar.gz').glyph).toBe('archive');
		expect(fileKind('noext').glyph).toBe('file');
	});
});
