/**
 * Scope idempotency to (idempotency_key, operation_type) so the same key can
 * be reused across create / approve / fund / settle without a unique violation.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const TABLE = 'idempotency_keys';
const SINGLE_KEY_UNIQUE = 'idempotency_keys_idempotency_key_key';
const COMPOSITE_UNIQUE = 'idempotency_keys_idempotency_key_operation_type_key';

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
    pgm.dropConstraint(TABLE, SINGLE_KEY_UNIQUE);
    pgm.addConstraint(TABLE, COMPOSITE_UNIQUE, {
        unique: ['idempotency_key', 'operation_type'],
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
    pgm.dropConstraint(TABLE, COMPOSITE_UNIQUE);
    pgm.addConstraint(TABLE, SINGLE_KEY_UNIQUE, {
        unique: ['idempotency_key'],
    });
};
