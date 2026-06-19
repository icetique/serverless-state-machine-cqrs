export interface QueryResult<Row> {
    rows: Row[];
}

export interface Queryable {
    query<Row>(text: string, values: unknown[]): Promise<QueryResult<Row>>;
}

export interface TransactionalQueryable extends Queryable {
    release(): void;
}

export interface TransactionPool {
    connect(): Promise<TransactionalQueryable>;
}
