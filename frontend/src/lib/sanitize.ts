const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

const HTML_ESCAPE_REGEX = /[&<>"'`]/g;

export function sanitizeHtml(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }

  return input.replace(
    HTML_ESCAPE_REGEX,
    (char) => HTML_ESCAPE_MAP[char] ?? char,
  );
}
