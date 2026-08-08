import { describe, expect, it } from 'vitest';
import { parseTrustProxy, trustProxyWarning } from './trust-proxy';

describe('parseTrustProxy', () => {
  // The default is the whole point: an unset var must leave Express exactly as
  // it behaves today, so adding this setting cannot change any environment
  // that has not opted in.
  it('defaults to false when unset or blank', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('   ')).toBe(false);
  });

  it('reads the falsey keywords', () => {
    for (const v of ['false', 'FALSE', '0', 'off', 'no', ' No ']) {
      expect(parseTrustProxy(v)).toBe(false);
    }
  });

  it('reads the truthy keywords', () => {
    for (const v of ['true', 'TRUE', 'on', 'yes', ' Yes ']) {
      expect(parseTrustProxy(v)).toBe(true);
    }
  });

  // Hop counts are the value almost every deployment actually wants.
  it('reads a non-negative integer as a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy(' 3 ')).toBe(3);
  });

  // '0' is the one integer that is NOT a hop count — Express treats 0 hops as
  // "trust nothing", which is the same thing as false, and the falsey-keyword
  // branch gets there first. Pinned because a later refactor that reorders the
  // branches would turn it into the number 0 and change nothing visible until
  // someone reads the logs.
  it('treats 0 as false, not as the number zero', () => {
    expect(parseTrustProxy('0')).toBe(false);
  });

  // A malformed value must NOT be silently coerced. parseInt('2abc') is 2, so a
  // typo in a deploy config would quietly become a hop count nobody chose;
  // passing it through instead makes Express reject it at boot.
  it('does not coerce a partially-numeric value into a hop count', () => {
    expect(parseTrustProxy('2abc')).toBe('2abc');
    expect(parseTrustProxy('1.9')).toBe('1.9');
    expect(parseTrustProxy('-1')).toBe('-1');
  });

  // Express's own presets and CIDR allowlists travel through unchanged.
  it('passes presets and address lists through verbatim', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('uniquelocal')).toBe('uniquelocal');
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toBe('10.0.0.0/8, 172.16.0.0/12');
  });
});

describe('trustProxyWarning', () => {
  it('warns about true in every environment, because the chain is spoofable', () => {
    expect(trustProxyWarning(true, 'production')).toMatch(/spoof/i);
    expect(trustProxyWarning(true, 'development')).toMatch(/spoof/i);
    expect(trustProxyWarning(true, undefined)).toMatch(/spoof/i);
  });

  it('warns when production runs with no setting at all', () => {
    expect(trustProxyWarning(false, 'production')).toMatch(/not set/i);
  });

  it('stays quiet in development with no setting — that is the correct local state', () => {
    expect(trustProxyWarning(false, 'development')).toBeNull();
    expect(trustProxyWarning(false, undefined)).toBeNull();
    expect(trustProxyWarning(false, 'test')).toBeNull();
  });

  it('stays quiet for a hop count or an allowlist, which are the intended values', () => {
    expect(trustProxyWarning(1, 'production')).toBeNull();
    expect(trustProxyWarning(2, 'production')).toBeNull();
    expect(trustProxyWarning('loopback', 'production')).toBeNull();
  });
});
