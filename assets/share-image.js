export function shareImageURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const address = new URL(value);
    return address.protocol === "https:" && !address.username && !address.password ? address.href : null;
  } catch {
    return null;
  }
}
