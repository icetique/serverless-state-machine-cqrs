# Settlement queue rename (stack-scoped names)

After switching from global names (`settlement-queue`, `settlement-dlq`) to stack-scoped names (`{StackName}-settlement-queue`, `{StackName}-settlement-dlq`), a deploy **replaces** the SQS resources. The old queues may remain in the account (the DLQ has `DeletionPolicy: Retain`).

## Local check (before AWS deploy)

```bash
cd serverless-state-machine-cqrs
sam build
sam validate
```

Optional: confirm synthesized queue names in `.aws-sam/build/template.yaml` search for `settlement-queue`.

## Deploy (you run manually)

```bash
sam build
sam deploy
```

Note new outputs: `SettlementQueueName`, `SettlementDeadLetterQueueName`, `SettlementQueueUrl`.

## Verify async path after deploy

1. Fund an agreement via API or UI.
2. Wait for outbox dispatch (~1 min) + settlement.
3. Confirm agreement becomes **SETTLED**.
4. In SQS console, confirm the **new** queue names exist and are receiving/processing messages.
5. Check CloudWatch alarm `*-SettlementDeadLetterQueue-VisibleMessages` still lists the new DLQ name.

## Clean up orphaned queues

Only after the new stack path works:

1. Open **SQS** in the same region as the stack (`eu-central-1` for current deploy).
2. Look for legacy queues:
    - `settlement-queue`
    - `settlement-dlq`
3. For each orphan:
    - **Purge** or drain any remaining messages (DLQ first if you need to inspect failures).
    - **Delete** the queue.

Do **not** delete queues whose names match `{StackName}-settlement-*` — those belong to the live stack.

## If deploy fails on queue replacement

- **Queue already exists** with the new stack-scoped name: rare; delete the conflicting orphan or rename stack.
- **Event source mapping lag**: wait a few minutes after deploy before testing fund → settle.
- **Messages stuck on old queue**: old Lambda mapping is gone; purge old queue or replay messages manually via `sam local invoke SettlementProcessorFunction` with a test event (local only).

## Rollback

If you must revert, redeploy the previous template commit. CloudFormation will attempt to recreate the old fixed names — only works if those names are not taken by orphans you deleted.
