/**
 * Phase 2 event-sourced baseline. Apply on a new Supabase project — see docs/supabase-setup.md.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const AGREEMENT_STATUSES = ['CREATED', 'APPROVED', 'FUNDED', 'SETTLED'];
const AGREEMENTS_STATUS_CHECK = 'agreements_read_model_status_check';

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
    pgm.createTable('event_store', {
        id: {
            type: 'bigserial',
            primaryKey: true,
        },
        stream_id: {
            type: 'text',
            notNull: true,
        },
        stream_version: {
            type: 'integer',
            notNull: true,
        },
        event_type: {
            type: 'text',
            notNull: true,
        },
        payload: {
            type: 'jsonb',
            notNull: true,
        },
        metadata: {
            type: 'jsonb',
            notNull: true,
        },
        occurred_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.addConstraint('event_store', 'event_store_stream_id_stream_version_key', {
        unique: ['stream_id', 'stream_version'],
    });
    pgm.createIndex('event_store', ['stream_id', 'stream_version']);

    pgm.createTable('agreements_read_model', {
        public_id: {
            type: 'text',
            primaryKey: true,
        },
        status: {
            type: 'text',
            notNull: true,
        },
        merchant_id: {
            type: 'text',
            notNull: true,
        },
        partner_id: {
            type: 'text',
            notNull: true,
        },
        amount: {
            type: 'numeric',
            notNull: true,
        },
        stream_version: {
            type: 'integer',
            notNull: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
        updated_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.addConstraint('agreements_read_model', AGREEMENTS_STATUS_CHECK, {
        check: `status IN (${AGREEMENT_STATUSES.map((s) => `'${s}'`).join(', ')})`,
    });
    pgm.createIndex('agreements_read_model', ['merchant_id', 'updated_at']);
    pgm.createIndex('agreements_read_model', ['partner_id', 'updated_at']);

    pgm.createTable('ledger_read_model', {
        id: {
            type: 'bigserial',
            primaryKey: true,
        },
        transaction_id: {
            type: 'text',
            notNull: true,
            unique: true,
        },
        agreement_id: {
            type: 'text',
            notNull: true,
        },
        amount: {
            type: 'numeric',
            notNull: true,
        },
        entry_type: {
            type: 'text',
            notNull: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.createIndex('ledger_read_model', ['agreement_id', 'created_at']);

    pgm.createTable('idempotency_keys', {
        id: {
            type: 'bigserial',
            primaryKey: true,
        },
        idempotency_key: {
            type: 'text',
            notNull: true,
        },
        operation_type: {
            type: 'text',
            notNull: true,
        },
        request_hash: {
            type: 'text',
            notNull: true,
        },
        response_status_code: {
            type: 'integer',
            notNull: true,
        },
        response_body: {
            type: 'text',
            notNull: true,
        },
        stream_id: {
            type: 'text',
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
        updated_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.addConstraint('idempotency_keys', 'idempotency_keys_idempotency_key_operation_type_key', {
        unique: ['idempotency_key', 'operation_type'],
    });

    pgm.createTable('outbox_events', {
        id: {
            type: 'bigserial',
            primaryKey: true,
        },
        aggregate_type: {
            type: 'text',
            notNull: true,
        },
        aggregate_id: {
            type: 'text',
            notNull: true,
        },
        event_type: {
            type: 'text',
            notNull: true,
        },
        event_source: {
            type: 'text',
            notNull: true,
        },
        payload: {
            type: 'jsonb',
            notNull: true,
        },
        request_id: {
            type: 'text',
        },
        idempotency_key: {
            type: 'text',
        },
        status: {
            type: 'text',
            notNull: true,
            default: 'pending',
        },
        attempt_count: {
            type: 'integer',
            notNull: true,
            default: 0,
        },
        available_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
        last_error: {
            type: 'text',
        },
        published_at: {
            type: 'timestamptz',
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.createIndex('outbox_events', ['status', 'available_at']);
    pgm.createIndex('outbox_events', ['aggregate_type', 'aggregate_id']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
    pgm.dropTable('outbox_events');
    pgm.dropTable('idempotency_keys');
    pgm.dropTable('ledger_read_model');
    pgm.dropTable('agreements_read_model');
    pgm.dropTable('event_store');
};
