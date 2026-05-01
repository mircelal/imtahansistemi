import DOMPurify from "dompurify";

type Props = {
  html: string;
  className?: string;
};

/**
 * Saxlanılmış HTML-i təhlükəsiz göstərir (sual mətni, variant mətnləri).
 */
export function SafeHtml({ html, className }: Props) {
  const clean = DOMPurify.sanitize(html || "", {
    USE_PROFILES: { html: true }
  });
  return (
    <div
      className={[
        "bank-html max-w-none text-sm leading-relaxed [&_p]:my-1 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
        className ?? ""
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
