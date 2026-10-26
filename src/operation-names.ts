// Only names are needed, keeping this helper compatible with GraphQL 16/17 ASTs.
interface NamedOperation {
	readonly name?: { readonly value: string };
}

/**
 * Creates a stable allocator for callback operation names.
 *
 * Ensures:
 * - Anonymous names never collide with explicit operation names
 * - Duplicate named operations receive deterministic suffixes
 * - Generated names do not overwrite previous callback entries
 */
export function createOperationNameAllocator(
	operations: readonly NamedOperation[],
): (operation: NamedOperation) => string {
	const explicitNames = new Set<string>();
	for (const operation of operations) {
		if (operation.name?.value) {
			explicitNames.add(operation.name.value);
		}
	}

	const usedNames = new Set<string>();
	const namedCounts = new Map<string, number>();
	let anonymousCount = 0;

	return (operation: NamedOperation): string => {
		const explicitName = operation.name?.value;
		if (explicitName) {
			let suffix = namedCounts.get(explicitName) ?? 0;
			let candidate = suffix === 0 ? explicitName : `${explicitName}_${suffix}`;

			while (usedNames.has(candidate) || (suffix > 0 && explicitNames.has(candidate))) {
				suffix++;
				candidate = `${explicitName}_${suffix}`;
			}

			namedCounts.set(explicitName, suffix + 1);
			usedNames.add(candidate);
			return candidate;
		}

		anonymousCount++;
		let candidate = anonymousCount === 1 ? "[anonymous]" : `[anonymous:${anonymousCount}]`;
		while (usedNames.has(candidate) || explicitNames.has(candidate)) {
			anonymousCount++;
			candidate = `[anonymous:${anonymousCount}]`;
		}

		usedNames.add(candidate);
		return candidate;
	};
}
