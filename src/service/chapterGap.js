/**
 * Gap rule for chapter discovery: a whole volume is "held" when a whole
 * volume at least two numbers below it is known, meaning a volume between
 * them was skipped. Decimal volumes (e.g. 171.5) are never held and never
 * count as known fillers, because they are side stories, not sequence steps.
 *
 * @example
 * findGap({ volume: '177', knownVolumeKeys: new Set(['170', '171']) })
 * // { isHeld: true, previousKnownVolume: 171 }
 */
export function findGap({ volume, knownVolumeKeys }) {
	const current = Number(volume);
	if (!Number.isInteger(current)) {
		return { isHeld: false, previousKnownVolume: null };
	}
	const previousKnownVolume = findPreviousIntegerKey(current, knownVolumeKeys);
	const isHeld =
		previousKnownVolume !== null && previousKnownVolume < current - 1;
	return { isHeld, previousKnownVolume };
}

function findPreviousIntegerKey(current, knownVolumeKeys) {
	let previous = null;
	for (const key of knownVolumeKeys) {
		const value = Number(key);
		if (!Number.isInteger(value) || value >= current) continue;
		if (previous === null || value > previous) previous = value;
	}
	return previous;
}
