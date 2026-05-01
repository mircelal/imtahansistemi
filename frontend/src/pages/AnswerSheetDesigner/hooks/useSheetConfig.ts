import { useState } from "react";

export type PaperSize = "A4" | "A4L" | "A3" | "A3L";

export type SheetConfig = {
  question_count: number;
  options_per_question: 2 | 3 | 4 | 5;
  columns_count: 1 | 2 | 3 | 4 | 5 | 6;
  paper_size: PaperSize;
  title: string;
  /** Boşdursa PDF-də yalnız başlıq; lazım olanda magentanın alt sətri */
  header_subtitle: string;
  identity_ad_rows: number;
  identity_sn_rows: number;
  identity_fn_rows: number;
  /** Şəxsiyyət zonası — PDF ilə eyni açarlar (mm), backend `identity_*` */
  identity_letter_d_mm: number;
  identity_letter_hgap_mm: number;
  identity_letter_vgap_mm: number;
  identity_digit_d_mm: number;
  identity_digit_vgap_mm: number;
  identity_digit_col_gap_mm: number;
  identity_digit_compact: boolean;
  identity_handwrite_w_mm: number;
  identity_handwrite_h_mm: number;
  identity_handwrite_gap_mm: number;
  /** Şaquli hərf sütununda üst yazı xanası (mm); boşdursa identity_handwrite_h_mm */
  identity_vertical_handwrite_h_mm?: number;
  /** false olanda suallar sığmırsa PDF 2-ci səhifəyə keçir */
  single_page_layout: boolean;
  /**
   * Şaquli MCQ (DİM) olanda şəxsiyyət hərf/rəqəm balonlarını MCQ balon ölçüsünə uyğunlaşdır.
   * Söndürülsə, yalnız əl ilə verilmiş identity_* mm istifadə olunur.
   */
  identity_match_mcq_bubbles?: boolean;
  /** false olanda şəxsiyyət üstündəki DİQQƏT sətiri çəkilmir */
  identity_show_notice?: boolean;
  /** Boş olanda (və göstərmə açıqdırsa) avtomatik mətn; dolu olanda öz mətniniz */
  identity_notice_text?: string;
  /** MCQ: şaquli balon + sıra aralığı bir səhifəyə sığana qədər avtomatik kiçildilir */
  mcq_auto_fit: boolean;
  /** MCQ balon diametri mm (mcq_auto_fit=false) */
  mcq_bubble_d_mm: number;
  /** Variantlar arası üfüqi mərkəz–mərkəz mm (PDF + OMR; hər iki rejimdə) */
  mcq_hgap_mm: number;
  /** MCQ sətirlər arası mm (mcq_auto_fit=false) */
  mcq_vgap_mm: number;
  /**
   * vertical (defolt): DİM tipli — nömrə qutusu üstdə, A–E şaquli, soldan sağa sətir-sətir.
   * horizontal: köhnə — hər sətirdə sual, variantlar üfüqi.
   */
  mcq_options_layout?: "vertical" | "horizontal";
  /** İrəli DİM sıxlığı (mm) — opsional, boşdursa balon ölçüsündən hesablanır */
  mcq_num_cell_mm?: number;
  mcq_tower_band_gap_mm?: number;
  mcq_num_to_bubbles_pad_mm?: number;
  /** Şaquli A–E: mərkəz pitch ≥ balon Ø + bu (mm); PDF dim_sheet_layout ilə sinxron */
  mcq_tower_opt_min_clear_mm?: number;
};

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
  question_count: 100,
  options_per_question: 5,
  columns_count: 4,
  paper_size: "A4",
  title: "CAVAB KARTI",
  header_subtitle: "",
  identity_ad_rows: 4,
  identity_sn_rows: 5,
  identity_fn_rows: 4,
  identity_letter_d_mm: 3.05,
  identity_letter_hgap_mm: 3.35,
  identity_letter_vgap_mm: 5.0,
  identity_digit_d_mm: 4.0,
  identity_digit_vgap_mm: 4.15,
  identity_digit_col_gap_mm: 7.2,
  identity_digit_compact: true,
  identity_handwrite_w_mm: 13.0,
  identity_handwrite_h_mm: 5.0,
  identity_handwrite_gap_mm: 1.4,
  single_page_layout: true,
  identity_match_mcq_bubbles: true,
  identity_show_notice: true,
  mcq_auto_fit: true,
  mcq_bubble_d_mm: 6.0,
  /** Şaquli rejimdə sual sütunları arası (DİM sıxlığı; backend defolt 3.35) */
  mcq_hgap_mm: 3.35,
  mcq_vgap_mm: 8.0,
  mcq_options_layout: "vertical",
};

export function useSheetConfig() {
  const [config, setConfig] = useState<SheetConfig>({ ...DEFAULT_SHEET_CONFIG });

  return { config, setConfig };
}
