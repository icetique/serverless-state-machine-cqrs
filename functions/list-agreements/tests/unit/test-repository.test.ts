import { describe, expect, it, jest } from '@jest/globals';
import { PostgresAgreementsReadRepository } from '../../src/repository';
import { type Queryable } from '../../src/lambda-utils';

describe('PostgresAgreementsReadRepository', () => {
    it('maps agreement rows', async () => {
        const queryMock: Queryable['query'] = async <Row>() => ({
            rows: [
                {
                    public_id: 'agr_123',
                    status: 'APPROVED',
                    merchant_id: 'merchant_1',
                    partner_id: 'partner_2',
                    amount: '1000',
                    created_at: '2026-06-04T12:00:00.000Z',
                } as unknown as Row,
            ],
        });
        const query = jest.fn(queryMock as (...args: unknown[]) => unknown);
        const pool: Queryable = {
            query: ((text, values) => query(text, values)) as Queryable['query'],
        };

        const result = await new PostgresAgreementsReadRepository(pool).listAgreements({
            limit: 10,
            role: 'admin',
        });

        expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM agreements_read_model'), [10]);
        expect(result).toEqual([
            {
                agreementId: 'agr_123',
                status: 'APPROVED',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                createdAt: '2026-06-04T12:00:00.000Z',
            },
        ]);
    });

    it('filters merchant agreements by merchant id', async () => {
        const query = jest.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const pool: Queryable = {
            query: ((text, values) => query(text, values)) as Queryable['query'],
        };

        await new PostgresAgreementsReadRepository(pool).listAgreements({
            limit: 10,
            role: 'merchant',
            merchantId: 'merchant_1',
        });

        expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE merchant_id = $2'), [10, 'merchant_1']);
    });
});
