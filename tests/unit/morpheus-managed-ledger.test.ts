// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManagedLedger } from '../../services/managed/ledger';

describe('managed durable allowance', () => {
  let directory: string;
  let ledger: ManagedLedger;
  let time: number;
  const grant = { grantId: 'trial:a', accountId: 'a', tier: 'trial' as const,
    amountMicroUsd: 100, expiresAt: 2000, features: ['planning'] as const };
  const reserve = (requestId = 'r1', maximumMicroUsd = 60) => ({
    accountId: 'a', requestId, objectiveId: 'task1', route: 'planner', fingerprint: 'a'.repeat(64),
    feature: 'planning' as const, maximumMicroUsd, rateVersion: 'fixture-v1',
  });
  beforeEach(() => {
    time = 1000;
    directory = mkdtempSync(join(tmpdir(), 'morpheus-managed-'));
    ledger = new ManagedLedger(join(directory, 'ledger.sqlite'), () => time);
    ledger.grant({ ...grant, features: [...grant.features] });
  });
  afterEach(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });

  it('has no implicit trial or paid entitlement', () => {
    expect(ledger.status('unknown')).toMatchObject({ tier: 'basic', enabled: false,
      billing: 'not-configured', allowance: { available: 0 } });
  });
  it('provisions idempotently and rejects changed terms or a second trial', () => {
    ledger.grant({ ...grant, features: [...grant.features] });
    expect(ledger.status('a').allowance.granted).toBe(100);
    expect(() => ledger.grant({ ...grant, features: [...grant.features], amountMicroUsd: 101 })).toThrow('grant_conflict');
    expect(() => ledger.grant({ ...grant, features: [...grant.features], grantId: 'second' })).toThrow('account_already_provisioned');
  });
  it('counts reservations across separate connections', () => {
    const second = new ManagedLedger(join(directory, 'ledger.sqlite'), () => time);
    try {
      ledger.reserve(reserve());
      expect(() => second.reserve(reserve('r2'))).toThrow('allowance_exhausted');
      expect(second.status('a').allowance).toMatchObject({ reserved: 60, available: 40 });
      second.reserve(reserve('r2', 40));
      expect(ledger.status('a').allowance.available).toBe(0);
    } finally { second.close(); }
  });
  it('survives restart without refunding an uncertain dispatch', () => {
    ledger.reserve(reserve());
    expect(ledger.dispatch('a', 'r1')).toBe(true);
    ledger.uncertain('a', 'r1');
    ledger.close();
    ledger = new ManagedLedger(join(directory, 'ledger.sqlite'), () => time);
    expect(ledger.receipt('a', 'r1')?.state).toBe('uncertain');
    expect(ledger.status('a').allowance.available).toBe(40);
    expect(ledger.dispatch('a', 'r1')).toBe(false);
    expect(() => ledger.releaseUndispatched('a', 'r1')).toThrow('cannot_release');
  });
  it('rolls back reservation and dispatch if the accounting event cannot persist', () => {
    const admin = new DatabaseSync(join(directory, 'ledger.sqlite'));
    try {
      admin.exec("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'accounting unavailable'); END;");
      expect(() => ledger.reserve(reserve())).toThrow('accounting unavailable');
      expect(ledger.receipt('a', 'r1')).toBeNull();
      expect(ledger.status('a').allowance.available).toBe(100);
      admin.exec('DROP TRIGGER fail_event');
      ledger.reserve(reserve());
      admin.exec("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'accounting unavailable'); END;");
      expect(() => ledger.dispatch('a', 'r1')).toThrow('accounting unavailable');
      expect(ledger.receipt('a', 'r1')?.state).toBe('reserved');
    } finally { admin.close(); }
  });
  it('retains a dispatched hold after a crash before receiving usage', () => {
    ledger.reserve(reserve()); ledger.dispatch('a', 'r1');
    ledger.close(); ledger = new ManagedLedger(join(directory, 'ledger.sqlite'), () => time);
    expect(ledger.receipt('a', 'r1')?.state).toBe('dispatched');
    expect(ledger.status('a').allowance.reserved).toBe(60);
  });
  it('rejects conflicting duplicate requests', () => {
    ledger.reserve(reserve());
    ledger.reserve(reserve());
    expect(ledger.status('a').allowance.reserved).toBe(60);
    expect(() => ledger.reserve({ ...reserve(), fingerprint: 'b'.repeat(64) })).toThrow('request_conflict');
    expect(() => ledger.reserve({ ...reserve(), objectiveId: 'other' })).toThrow('request_conflict');
  });
  it('settles once, releases the unused difference and preserves provenance', () => {
    ledger.reserve(reserve()); ledger.dispatch('a', 'r1');
    ledger.settle('a', 'r1', 25, 'rate-estimate');
    ledger.settle('a', 'r1', 25, 'rate-estimate');
    expect(ledger.status('a').allowance).toMatchObject({ spent: 25, reserved: 0, available: 75 });
    expect(ledger.receipt('a', 'r1')).toMatchObject({ costEvidence: 'rate-estimate', objectiveId: 'task1' });
    expect(() => ledger.settle('a', 'r1', 26, 'rate-estimate')).toThrow('settlement_conflict');
  });
  it('freezes misquoted routes without debiting above the reserved cap', () => {
    ledger.reserve(reserve()); ledger.dispatch('a', 'r1');
    ledger.settle('a', 'r1', 80, 'provider-reported');
    expect(ledger.status('a')).toMatchObject({ enabled: false, allowance: { spent: 60, available: 0 } });
    expect(ledger.receipt('a', 'r1')).toMatchObject({ assessedCostMicroUsd: 80, chargedMicroUsd: 60 });
  });
  it('releases only undispatched work and never sends a released ID', () => {
    ledger.reserve(reserve()); ledger.releaseUndispatched('a', 'r1');
    expect(ledger.status('a').allowance.available).toBe(100);
    expect(ledger.dispatch('a', 'r1')).toBe(false);
    expect(() => ledger.settle('a', 'r1', 0, 'reconciled')).toThrow('invalid_request_state');
  });
  it('requires explicit zero usage evidence after dispatch', () => {
    ledger.reserve(reserve()); ledger.dispatch('a', 'r1');
    ledger.settle('a', 'r1', 0, 'reconciled');
    expect(ledger.status('a').allowance.available).toBe(100);
  });
  it('checks expiry again immediately before dispatch', () => {
    ledger.reserve(reserve()); time = 2000;
    expect(() => ledger.dispatch('a', 'r1')).toThrow('not_entitled');
    expect(() => ledger.reserve(reserve('r2', 1))).toThrow('not_entitled');
  });
  it('isolates identities and denies unsupported feature grants', () => {
    ledger.reserve(reserve());
    expect(ledger.receipt('b', 'r1')).toBeNull();
    expect(() => ledger.reserve({ ...reserve('r2'), feature: 'speech' })).toThrow('not_entitled');
    expect(() => ledger.reserve({ ...reserve('r2'), accountId: 'b' })).toThrow('not_entitled');
  });
  it.each([-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER])('rejects unsafe reservation %s', (maximumMicroUsd) => {
    expect(() => ledger.reserve(reserve('r2', maximumMicroUsd))).toThrow();
    expect(ledger.status('a').allowance.available).toBe(100);
  });
});
