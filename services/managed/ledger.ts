import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { ManagedAccountStatus, ManagedRequestReceipt, ManagedRequestState } from '../../shared/morpheus/managed-types';
import { canonicalJson, featuresSchema, idSchema, ManagedError, moneySchema } from './validation';

const grantSchema = z.object({
  grantId: idSchema,
  accountId: idSchema,
  tier: z.enum(['trial', 'premium']),
  amountMicroUsd: moneySchema.positive(),
  expiresAt: z.number().int().positive().safe(),
  features: featuresSchema.min(1),
}).strict();
type Grant = z.infer<typeof grantSchema>;
type Row = {
  account_id: string; request_id: string; objective_id: string | null; route: string;
  fingerprint: string; state: ManagedRequestState; reserved: number;
  charged: number | null; actual: number | null; rate_version: string;
  evidence: ManagedRequestReceipt['costEvidence'];
  correlation: string | null;
};

/** Server-side only. One SQLite file on a persistent local volume, never NFS.
 * BEGIN IMMEDIATE coordinates separate connections/processes. Use a transactional
 * Postgres implementation before deploying independent replicas/hosts.
 */
export class ManagedLedger {
  private readonly db: DatabaseSync;

  constructor(path: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 2) {
      this.db.close();
      throw new ManagedError('unsupported_ledger_version', 503);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, tier TEXT NOT NULL, expires_at INTEGER NOT NULL,
        features TEXT NOT NULL, frozen INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS grants (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
        amount INTEGER NOT NULL CHECK(amount > 0), terms TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        account_id TEXT NOT NULL REFERENCES accounts(id), request_id TEXT NOT NULL,
        objective_id TEXT, route TEXT NOT NULL, fingerprint TEXT NOT NULL,
        state TEXT NOT NULL, reserved INTEGER NOT NULL CHECK(reserved > 0),
        charged INTEGER, actual INTEGER, evidence TEXT, rate_version TEXT NOT NULL, correlation TEXT,
        PRIMARY KEY(account_id, request_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
        request_id TEXT, kind TEXT NOT NULL, recorded_at INTEGER NOT NULL,
        details TEXT NOT NULL
      );
    `);
    const columns = this.db.prepare('PRAGMA table_info(requests)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'correlation')) this.db.exec('ALTER TABLE requests ADD COLUMN correlation TEXT;');
    this.db.exec('PRAGMA user_version=2;');
  }

  close(): void { this.db.close(); }

  private record(accountId: string, requestId: string | null, kind: string, details: Record<string, unknown> = {}): void {
    this.db.prepare('INSERT INTO events(account_id,request_id,kind,recorded_at,details) VALUES(?,?,?,?,?)')
      .run(accountId, requestId, kind, this.now(), canonicalJson(details));
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Trusted provisioning only; never expose to the desktop or an HTTP route. */
  grant(input: Grant): void {
    const grant = grantSchema.parse(input);
    const terms = canonicalJson(grant);
    this.transaction(() => {
      const prior = this.db.prepare('SELECT terms FROM grants WHERE id=?').get(grant.grantId) as { terms: string } | undefined;
      if (prior) {
        if (prior.terms !== terms) throw new ManagedError('grant_conflict', 409);
        return;
      }
      if (grant.expiresAt <= this.now()) throw new ManagedError('expired_grant');
      const status = this.status(grant.accountId);
      moneySchema.parse(status.allowance.granted + grant.amountMicroUsd);
      // Renewal/reset/payment policy is deliberately deferred; never revive an
      // expired account's old allowance by silently changing its expiration.
      if (status.expiresAt !== null) throw new ManagedError('account_already_provisioned', 409);
      this.db.prepare('INSERT INTO accounts(id,tier,expires_at,features) VALUES(?,?,?,?)')
        .run(grant.accountId, grant.tier, grant.expiresAt, JSON.stringify(grant.features));
      this.db.prepare('INSERT INTO grants(id,account_id,amount,terms) VALUES(?,?,?,?)')
        .run(grant.grantId, grant.accountId, grant.amountMicroUsd, terms);
      this.record(grant.accountId, null, 'granted', { grantId: grant.grantId, amountMicroUsd: grant.amountMicroUsd });
    });
  }

  status(accountId: string): ManagedAccountStatus {
    idSchema.parse(accountId);
    const account = this.db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId) as {
      tier: 'trial' | 'premium'; expires_at: number; features: string; frozen: number;
    } | undefined;
    const granted = (this.db.prepare('SELECT COALESCE(SUM(amount),0) AS value FROM grants WHERE account_id=?').get(accountId) as { value: number }).value;
    const totals = this.db.prepare(`SELECT COALESCE(SUM(charged),0) AS spent,
      COALESCE(SUM(CASE WHEN state IN ('reserved','dispatched','uncertain') THEN reserved ELSE 0 END),0) AS held
      FROM requests WHERE account_id=?`).get(accountId) as { spent: number; held: number };
    const enabled = Boolean(account && !account.frozen && account.expires_at > this.now());
    return {
      accountId, tier: account?.tier ?? 'basic', enabled,
      expiresAt: account?.expires_at ?? null,
      features: enabled ? featuresSchema.parse(JSON.parse(account!.features)) : [],
      allowance: { currency: 'USD', unit: 'micro-usd', granted, spent: totals.spent,
        reserved: totals.held, available: enabled ? Math.max(0, granted - totals.spent - totals.held) : 0 },
      billing: 'not-configured',
    };
  }

  private row(accountId: string, requestId: string): Row | undefined {
    return this.db.prepare('SELECT * FROM requests WHERE account_id=? AND request_id=?').get(accountId, requestId) as Row | undefined;
  }

  receipt(accountId: string, requestId: string): ManagedRequestReceipt | null {
    const row = this.row(idSchema.parse(accountId), idSchema.parse(requestId));
    return row ? {
      requestId: row.request_id, objectiveId: row.objective_id, route: row.route,
      state: row.state, reservedMicroUsd: row.reserved, chargedMicroUsd: row.charged,
      assessedCostMicroUsd: row.actual, costEvidence: row.evidence, rateVersion: row.rate_version,
      ...(row.correlation ? JSON.parse(row.correlation) as Pick<ManagedRequestReceipt, 'turnId' | 'workerRunId' | 'speechId'> : {}),
    } : null;
  }

  reserve(input: { accountId: string; requestId: string; objectiveId?: string; turnId?: string; workerRunId?: string; speechId?: string; route: string;
    fingerprint: string; feature: z.infer<typeof featuresSchema>[number]; maximumMicroUsd: number; rateVersion: string }): ManagedRequestReceipt {
    const value = z.object({ accountId: idSchema, requestId: idSchema, objectiveId: idSchema.optional(),
      turnId: idSchema.optional(), workerRunId: idSchema.optional(), speechId: idSchema.optional(),
      route: idSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), feature: featuresSchema.element,
      maximumMicroUsd: moneySchema.positive(), rateVersion: idSchema }).strict().parse(input);
    return this.transaction(() => {
      const prior = this.row(value.accountId, value.requestId);
      if (prior) {
        if (prior.fingerprint !== value.fingerprint || prior.route !== value.route || prior.objective_id !== (value.objectiveId ?? null)) {
          throw new ManagedError('request_conflict', 409);
        }
        return this.receipt(value.accountId, value.requestId)!;
      }
      const account = this.status(value.accountId);
      if (!account.enabled || !account.features.includes(value.feature)) throw new ManagedError('not_entitled', 403);
      if (account.allowance.available < value.maximumMicroUsd) throw new ManagedError('allowance_exhausted', 402);
      const correlation = canonicalJson({ ...(value.turnId ? { turnId: value.turnId } : {}),
        ...(value.workerRunId ? { workerRunId: value.workerRunId } : {}), ...(value.speechId ? { speechId: value.speechId } : {}) });
      this.db.prepare(`INSERT INTO requests(account_id,request_id,objective_id,route,fingerprint,state,reserved,rate_version,correlation)
        VALUES(?,?,?,?,?,'reserved',?,?,?)`).run(value.accountId, value.requestId, value.objectiveId ?? null,
        value.route, value.fingerprint, value.maximumMicroUsd, value.rateVersion, correlation);
      this.record(value.accountId, value.requestId, 'reserved', { maximumMicroUsd: value.maximumMicroUsd, rateVersion: value.rateVersion });
      return this.receipt(value.accountId, value.requestId)!;
    });
  }

  /** Only the process that atomically changes reserved -> dispatched may send. */
  dispatch(accountId: string, requestId: string): boolean {
    return this.transaction(() => {
      if (!this.status(accountId).enabled) throw new ManagedError('not_entitled', 403);
      const changed = this.db.prepare("UPDATE requests SET state='dispatched' WHERE account_id=? AND request_id=? AND state='reserved'")
        .run(accountId, requestId).changes === 1;
      if (changed) this.record(accountId, requestId, 'dispatched');
      return changed;
    });
  }

  uncertain(accountId: string, requestId: string): void {
    this.transaction(() => {
      const result = this.db.prepare("UPDATE requests SET state='uncertain' WHERE account_id=? AND request_id=? AND state='dispatched'").run(accountId, requestId);
      if (result.changes === 1) this.record(accountId, requestId, 'uncertain');
    });
  }

  /** Trusted reconciliation: unknown spend is held until evidence exists. */
  settle(accountId: string, requestId: string, actualMicroUsd: number,
    evidence: NonNullable<ManagedRequestReceipt['costEvidence']>): ManagedRequestReceipt {
    moneySchema.parse(actualMicroUsd);
    z.enum(['rate-estimate', 'provider-reported', 'reconciled']).parse(evidence);
    return this.transaction(() => {
      const row = this.row(accountId, requestId);
      if (!row) throw new ManagedError('request_not_found', 404);
      if (row.state === 'settled') {
        if (row.actual !== actualMicroUsd || row.evidence !== evidence) throw new ManagedError('settlement_conflict', 409);
        return this.receipt(accountId, requestId)!;
      }
      if (row.state !== 'dispatched' && row.state !== 'uncertain') throw new ManagedError('invalid_request_state', 409);
      // A broken quote must not silently debit more than the reserved user cap.
      // Record actual provider exposure and freeze managed access for review.
      const charged = Math.min(row.reserved, actualMicroUsd);
      this.db.prepare("UPDATE requests SET state='settled',charged=?,actual=?,evidence=? WHERE account_id=? AND request_id=?")
        .run(charged, actualMicroUsd, evidence, accountId, requestId);
      if (actualMicroUsd > row.reserved) this.db.prepare('UPDATE accounts SET frozen=1 WHERE id=?').run(accountId);
      this.record(accountId, requestId, 'settled', { chargedMicroUsd: charged, assessedCostMicroUsd: actualMicroUsd, evidence });
      return this.receipt(accountId, requestId)!;
    });
  }

  releaseUndispatched(accountId: string, requestId: string): void {
    this.transaction(() => {
      const result = this.db.prepare("UPDATE requests SET state='released',charged=0 WHERE account_id=? AND request_id=? AND state='reserved'")
        .run(accountId, requestId);
      if (result.changes !== 1) throw new ManagedError('cannot_release_dispatched_request', 409);
      this.record(accountId, requestId, 'released');
    });
  }
}
