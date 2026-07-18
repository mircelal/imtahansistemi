/** Paylaşılan imtahan sihirbazı addım etiketləri və qısa təsvirlər */
export const examWizardStepMeta = [
  {
    label: "İmtahan",
    description: "Başlıq, sual sayı, variant sayı və imtahan parametrləri.",
  },
  {
    label: "Suallar və fənnlər",
    description: "Cavab kartı sahələri, suallar və sual kitabçası.",
  },
  {
    label: "Cavab açarı",
    description: "Hər sual üçün düzgün cavab və xal balını təyin edin.",
  },
  {
    label: "Təsdiqlənmiş kart",
    description: "Cavab kartı PDF-i yaradın və skana hazırlayın.",
  },
] as const;

export const examWizardSteps = examWizardStepMeta.map((s) => s.label);

export type ExamWizardStepLabel = (typeof examWizardSteps)[number];

/** Step 1 (Suallar və fənnlər) daxili alt-bölmələr */
export type ExamStep1SubSection = "kart" | "suallar" | "kitabca";

export const examStep1SubSections: { id: ExamStep1SubSection; label: string; hint: string }[] = [
  {
    id: "kart",
    label: "Kart və fənnlər",
    hint: "Cavab kartı şəxsiyyət sahələri, fənn kodları və bal bölgüsü.",
  },
  {
    id: "suallar",
    label: "Suallar",
    hint: "CSV, sual bazası və ya tək-tək sual əlavə edin.",
  },
  {
    id: "kitabca",
    label: "Sual kitabçası",
    hint: "DİM standartında PDF/Word sual kitabçası endirin.",
  },
];
