/**
 * Restrict agreement status columns to the known lifecycle vocabulary.
 * Transition rules remain enforced in application code.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const STATUS_VALUES = "('CREATED', 'APPROVED', 'FUNDED', 'SETTLED')";

const AGREEMENTS_STATUS_CHECK = 'agreements_status_check';
const EVENTS_NEW_STATUS_CHECK = 'agreement_events_new_status_check';
const EVENTS_PREVIOUS_STATUS_CHECK = 'agreement_events_previous_status_check';

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
    pgm.addConstraint('agreements', AGREEMENTS_STATUS_CHECK, {
        check: `status IN ${STATUS_VALUES}`,
    });

    pgm.addConstraint('agreement_events', EVENTS_NEW_STATUS_CHECK, {
        check: `new_status IN ${STATUS_VALUES}`,
    });

    pgm.addConstraint('agreement_events', EVENTS_PREVIOUS_STATUS_CHECK, {
        check: `previous_status IS NULL OR previous_status IN ${STATUS_VALUES}`,
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
    pgm.dropConstraint('agreement_events', EVENTS_PREVIOUS_STATUS_CHECK);
    pgm.dropConstraint('agreement_events', EVENTS_NEW_STATUS_CHECK);
    pgm.dropConstraint('agreements', AGREEMENTS_STATUS_CHECK);
};
