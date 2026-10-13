/** Joins class names, skipping falsy values. */
export const cn = (...xs) => xs.flat().filter(Boolean).join(' ');
