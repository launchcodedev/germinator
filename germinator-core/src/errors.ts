export class GerminatorError extends Error {}
export class InvalidSeed extends GerminatorError {}
export class InvalidSeedEntryCreation extends GerminatorError {}
export class UpdateOfDeletedEntry extends GerminatorError {}
export class UpdateOfMultipleEntries extends GerminatorError {}
export class SynchronizeWithNoTracking extends GerminatorError {}
