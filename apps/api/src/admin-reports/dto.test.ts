import { describe, expect, it } from 'vitest';
import { UpdateReportDto } from './dto';

describe('UpdateReportDto', () => {
  describe('CLAIM', () => {
    it('needs nothing beyond the action', () => {
      expect(UpdateReportDto.safeParse({ action: 'CLAIM' }).success).toBe(true);
    });

    // The discriminated union plus .strict() is what makes "claim it AND close
    // the job" unrepresentable, rather than something the service has to refuse.
    it('rejects fields that belong to another branch', () => {
      expect(UpdateReportDto.safeParse({ action: 'CLAIM', closeJob: true }).success).toBe(false);
      expect(UpdateReportDto.safeParse({ action: 'CLAIM', note: 'hi' }).success).toBe(false);
    });
  });

  describe('ACTION', () => {
    it('accepts a bare uphold', () => {
      expect(UpdateReportDto.safeParse({ action: 'ACTION' }).success).toBe(true);
    });

    it('accepts a note and a takedown', () => {
      const parsed = UpdateReportDto.safeParse({
        action: 'ACTION',
        note: 'company does not exist',
        closeJob: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.action === 'ACTION') {
        expect(parsed.data.closeJob).toBe(true);
      }
    });

    it('rejects a non-boolean takedown', () => {
      expect(UpdateReportDto.safeParse({ action: 'ACTION', closeJob: 'yes' }).success).toBe(false);
    });
  });

  describe('DISMISS', () => {
    // Dismissing overrules the reporter, so the note is REQUIRED here and
    // optional on ACTION. That asymmetry is the schema's rule, not a preference
    // — see ProfileAuditAction.CONTENT_REPORT_DISMISSED.
    it('requires a note', () => {
      expect(UpdateReportDto.safeParse({ action: 'DISMISS' }).success).toBe(false);
      expect(
        UpdateReportDto.safeParse({ action: 'DISMISS', note: 'posting is legitimate' }).success,
      ).toBe(true);
    });

    it('rejects a whitespace-only note', () => {
      expect(UpdateReportDto.safeParse({ action: 'DISMISS', note: '   ' }).success).toBe(false);
    });

    it('rejects a takedown on a dismissal', () => {
      expect(
        UpdateReportDto.safeParse({ action: 'DISMISS', note: 'fine', closeJob: true }).success,
      ).toBe(false);
    });
  });

  describe('the note', () => {
    function note(value: string) {
      const parsed = UpdateReportDto.safeParse({ action: 'DISMISS', note: value });
      return parsed.success && parsed.data.action === 'DISMISS' ? parsed.data.note : undefined;
    }

    // Postgres cannot store U+0000 in a text column and trim() does not treat it
    // as whitespace, so a NUL pasted from a spreadsheet reaches the driver and
    // 500s. Measured on the intake endpoint; the same shared stripper runs here.
    it('strips NUL and other control characters', () => {
      // Escapes rather than literal control bytes: a raw NUL in a source file
      // is invisible in review and does not survive every editor round-trip —
      // the C1 case below silently lost its character exactly that way.
      expect(note('checked\u0000 the registration')).toBe('checked the registration');
      expect(note('bell\u0007here')).toBe('bellhere');
      expect(note('c1\u0085here')).toBe('c1here');
    });

    it('keeps tab, newline and carriage return', () => {
      expect(note('one\ttwo\nthree\r\nfour')).toBe('one\ttwo\nthree\r\nfour');
    });

    it('leaves astral characters intact', () => {
      // for..of iteration, so an emoji is not split into surrogate halves.
      expect(note('resolved 🎯 done')).toBe('resolved 🎯 done');
    });

    // Stripped BEFORE trimming, so control-only input collapses to '' and is
    // rejected rather than stored as an empty string that reads like no note was
    // ever demanded.
    it('rejects a note that is nothing but control characters', () => {
      expect(UpdateReportDto.safeParse({ action: 'DISMISS', note: '\u0000\u0007 ' }).success).toBe(
        false,
      );
    });

    it('trims before applying the 500-character cap', () => {
      const padded = `  ${'a'.repeat(500)}  `;
      expect(note(padded)).toBe('a'.repeat(500));
      expect(UpdateReportDto.safeParse({ action: 'DISMISS', note: 'a'.repeat(501) }).success).toBe(
        false,
      );
    });
  });

  it('rejects an unknown action', () => {
    expect(UpdateReportDto.safeParse({ action: 'ESCALATE' }).success).toBe(false);
    expect(UpdateReportDto.safeParse({ action: 'DELETE' }).success).toBe(false);
    expect(UpdateReportDto.safeParse({}).success).toBe(false);
  });

  // A client must not be able to smuggle its own reviewer or status through.
  it('rejects columns the client has no business setting', () => {
    expect(
      UpdateReportDto.safeParse({ action: 'ACTION', reviewedById: 1 }).success,
    ).toBe(false);
    expect(UpdateReportDto.safeParse({ action: 'ACTION', status: 'DISMISSED' }).success).toBe(
      false,
    );
  });
});
