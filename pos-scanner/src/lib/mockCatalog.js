/**
 * @deprecated Mock catalog removed for production (PS-27).
 * Kept as a thin re-export so accidental imports fail loudly in tests.
 */
export async function lookupItem() {
	throw new Error("mockCatalog removed — use itemLookup.lookupItem");
}

export function listMockItems() {
	return [];
}
