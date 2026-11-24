// Decimal MB, matching the displayed limit. Transport requests remain small.
export const CAD_MAX_BYTES = 250_000_000;
export const OTHER_MAX_BYTES = 40_000_000;
export const CAD_CHUNK_BYTES = 900_000;
export const CAD_MAX_CHUNKS = Math.ceil(CAD_MAX_BYTES / CAD_CHUNK_BYTES);
export const drawingLimit = name => /\.(dwg|dxf)$/i.test(name) ? CAD_MAX_BYTES : OTHER_MAX_BYTES;
