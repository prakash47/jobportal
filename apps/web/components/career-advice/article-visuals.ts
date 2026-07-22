import {
  Briefcase,
  FileText,
  GraduationCap,
  IndianRupee,
  Send,
  Sparkles,
} from '@jobportal/ui/icons';
import type { ComponentType, SVGProps } from 'react';

// ── The "Index Plate" visual system ────────────────────────────────────────
// Image-less articles get a designed cover plate instead of an empty slot: a
// flat navy/tint field + a large per-topic glyph + a decorative folio numeral +
// a flat SVG dot texture + one cyan editorial rule. 100% derived from real
// metadata (tag + recency), never a fabricated photo, never a gradient.

export type CoverVariant = 'ink' | 'paper' | 'rule';

export interface VariantStyle {
  /** field + border on the plate */
  field: string;
  kicker: string;
  title: string;
  titleHover: string;
  excerpt: string;
  meta: string;
  metaChip: string;
  seam: string;
  numeral: string;
  glyph: string;
  /** rgba dot colour for the flat SVG texture; null = no texture (clean field) */
  dot: string | null;
  /** cyan spine on the 'rule' variant; null otherwise */
  topBar: string | null;
}

export const VARIANT_STYLES: Record<CoverVariant, VariantStyle> = {
  ink: {
    field: 'bg-[var(--color-primary-900)] border border-[var(--color-primary-700)]',
    kicker: 'text-[var(--color-accent-400)]',
    title: 'text-white',
    titleHover: 'group-hover:text-[var(--color-accent-200)]',
    excerpt: 'text-[var(--color-primary-100)]',
    meta: 'text-[var(--color-primary-100)]',
    metaChip: 'bg-white/15 text-white',
    seam: 'border-[var(--color-primary-700)]',
    numeral: 'text-white/[0.09]',
    glyph: 'text-white/[0.06]',
    dot: 'rgba(255,255,255,0.08)',
    topBar: null,
  },
  paper: {
    field: 'bg-[var(--color-primary-50)] border border-[var(--color-primary-200)]',
    kicker: 'text-[var(--color-accent-700)]',
    title: 'text-[var(--color-primary-900)]',
    titleHover: 'group-hover:text-[var(--color-primary-700)]',
    excerpt: 'text-[var(--color-fg-muted)]',
    meta: 'text-[var(--color-fg-muted)]',
    metaChip: 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]',
    seam: 'border-[var(--color-primary-200)]',
    numeral: 'text-[var(--color-primary-200)]',
    glyph: 'text-[var(--color-primary-200)]',
    dot: 'rgba(25,34,73,0.06)',
    topBar: null,
  },
  rule: {
    field: 'bg-[var(--color-bg-elevated)] border border-[var(--color-border)]',
    kicker: 'text-[var(--color-accent-700)]',
    title: 'text-[var(--color-fg)]',
    titleHover: 'group-hover:text-[var(--color-primary-600)]',
    excerpt: 'text-[var(--color-fg-muted)]',
    meta: 'text-[var(--color-fg-muted)]',
    metaChip: 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]',
    seam: 'border-[var(--color-border)]',
    numeral: 'text-[var(--color-primary-100)]',
    glyph: 'text-[var(--color-primary-100)]',
    dot: null,
    topBar: 'bg-[var(--color-accent-500)]',
  },
};

const VARIANT_KEYS: CoverVariant[] = ['ink', 'paper', 'rule'];

// Stable per-slug hash so a plate's field doesn't shuffle when new articles
// shift positions. (Adjacent-collision tie-break is applied by the page.)
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function coverVariant(slug: string): CoverVariant {
  return VARIANT_KEYS[hashSlug(slug) % VARIANT_KEYS.length]!;
}

/** Rotate to the next variant — used to break adjacent-tile collisions. */
export function nextVariant(v: CoverVariant): CoverVariant {
  const i = VARIANT_KEYS.indexOf(v);
  return VARIANT_KEYS[(i + 1) % VARIANT_KEYS.length]!;
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

// Per-topic glyph — a recognizable mark per tag, so topics are differentiated
// by iconography rather than a rainbow of hues (which would break the flat
// two-hue brand). Falls back to Sparkles for unmapped tags.
const TOPIC_GLYPHS: Record<string, IconType> = {
  salary: IndianRupee,
  'early-career': GraduationCap,
  fresher: GraduationCap,
  resume: FileText,
  applying: Send,
  interview: Send,
  portfolio: Briefcase,
};

export function topicGlyph(tag: string | undefined): IconType {
  if (!tag) return Sparkles;
  return TOPIC_GLYPHS[tag] ?? Sparkles;
}
