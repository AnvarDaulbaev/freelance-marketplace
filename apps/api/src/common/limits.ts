/**
 * Money is stored as Int minor units (tyiyn); Postgres Int tops out at
 * 2 147 483 647, i.e. ~21.4M som. Inputs are capped below that.
 */
export const MAX_AMOUNT_SOM = 20_000_000;
