/**
 * The DOM join between a rendered element and its persisted appearance lock.
 * Keep this in a dependency-free module so the registry and activation gate
 * cannot drift by carrying two spellings of the same attribute.
 */
export const AppearanceLockTargetAttribute = 'data-md3-lock-target'
