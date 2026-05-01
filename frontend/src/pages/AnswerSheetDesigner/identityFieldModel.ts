import type { SheetConfig } from "./hooks/useSheetConfig";

/** Sürüklənə bilən blok identifikatorları (backend identity_fields sırasına çevrilir). */
export type IdentityBlockId =
  | "digit_groups"
  | "mcq_groups"
  | "letters_ad"
  | "letters_sn"
  | "letters_fn";

/** Referans PDF: əvvəl ad sahələri (yan-yana yerləşəndə dizaynerdə üst sıra), sonra rəqəm, sonra meta */
export const DEFAULT_IDENTITY_ORDER: IdentityBlockId[] = [
  "letters_ad",
  "letters_sn",
  "letters_fn",
  "digit_groups",
  "mcq_groups",
];

const LABELS: Record<IdentityBlockId, string> = {
  digit_groups: "Rəqəm sahələri (şagird kodu, məktəb, sinif)",
  mcq_groups: "Qrup, variant, bölmə",
  letters_ad: "ADINIZ (şaquli A–Z kod)",
  letters_sn: "SOYADINIZ (şaquli A–Z kod)",
  letters_fn: "ATA ADI (şaquli A–Z kod)",
};

export function blockTitle(id: IdentityBlockId): string {
  return LABELS[id];
}

export function identityOrderToApiFields(
  order: IdentityBlockId[],
  cfg: SheetConfig,
  digitTwoRows: boolean
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const bid of order) {
    if (bid === "digit_groups") {
      const o: Record<string, unknown> = {
        kind: "digit_groups",
        compact: cfg.identity_digit_compact,
        groups: [
          { id: "student_code", label: "Şagird kodu", count: 6 },
          { id: "sch", label: "Məktəb №", count: 3 },
          { id: "cl", label: "Sinif", count: 2 },
        ],
      };
      if (digitTwoRows) {
        o.layout = "two_rows";
      }
      out.push(o);
    } else if (bid === "mcq_groups") {
      out.push({
        kind: "mcq_groups",
        groups: [
          { id: "grp", label: "Qrup", options: ["1", "2", "3", "4", "5"] },
          { id: "var", label: "Variant", options: ["A", "B"] },
          { id: "sec", label: "Bölmə", options: ["Az", "RU", "GÜ"] },
        ],
      });
    } else if (bid === "letters_ad") {
      out.push({
        kind: "vertical_letters",
        id: "ad",
        label: "ADINIZ",
        columns: 7,
        col_pitch_mm: Math.max(cfg.identity_letter_d_mm + 0.12, cfg.identity_letter_hgap_mm),
      });
    } else if (bid === "letters_sn") {
      out.push({
        kind: "vertical_letters",
        id: "sn",
        label: "SOYADINIZ",
        columns: 8,
        col_pitch_mm: Math.max(cfg.identity_letter_d_mm + 0.12, cfg.identity_letter_hgap_mm),
      });
    } else if (bid === "letters_fn") {
      out.push({
        kind: "vertical_letters",
        id: "fn",
        label: "ATA ADI",
        columns: 6,
        col_pitch_mm: Math.max(cfg.identity_letter_d_mm + 0.12, cfg.identity_letter_hgap_mm),
      });
    }
  }
  return out;
}
