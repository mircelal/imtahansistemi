/** HTML mətnindən təmiz mətn (cieşmə və siyahılarda önbaxış üçün). */
export function plainTextFromHtml(html: string): string {
  if (!html?.trim()) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}
