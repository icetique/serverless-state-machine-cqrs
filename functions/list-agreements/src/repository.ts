import { type Queryable } from './lambda-utils';
import type { AgreementListItem, AgreementStatus, ListAgreementsQuery } from '@serverless-state-machine-cqrs/domain';

export interface AgreementsReadRepository {
    listAgreements(query: ListAgreementsQuery): Promise<AgreementListItem[]>;
}

interface AgreementSummaryRow {
    public_id: string;
    status: AgreementStatus;
    merchant_id: string;
    partner_id: string;
    amount: string;
    created_at: string;
}

export class PostgresAgreementsReadRepository implements AgreementsReadRepository {
    constructor(private readonly pool: Queryable) {}

    async listAgreements(query: ListAgreementsQuery): Promise<AgreementListItem[]> {
        const values: unknown[] = [query.limit];
        let filterClause = '';

        if (query.role === 'merchant' && query.merchantId) {
            filterClause = 'WHERE merchant_id = $2';
            values.push(query.merchantId);
        } else if (query.role === 'partner' && query.partnerId) {
            filterClause = 'WHERE partner_id = $2';
            values.push(query.partnerId);
        }

        const result = await this.pool.query<AgreementSummaryRow>(
            `
                SELECT public_id, status, merchant_id, partner_id, amount, created_at::text
                FROM agreements
                ${filterClause}
                ORDER BY id DESC
                LIMIT $1
            `,
            values,
        );

        return result.rows.map((row) => ({
            agreementId: row.public_id,
            status: row.status,
            merchantId: row.merchant_id,
            partnerId: row.partner_id,
            amount: Number(row.amount),
            createdAt: row.created_at,
        }));
    }
}
