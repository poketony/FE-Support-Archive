export function selectDlcContent(mode, contentId) {
  const content = mode.collections?.find((item) => item.id === contentId);
  if (!content) return null;
  const conversations = mode.conversations.filter((item) => item.sourceLabel === content.label);
  const partners = new Map();
  for (const { characters: [first, second] } of conversations) {
    if (!partners.has(first)) partners.set(first, new Set());
    if (!partners.has(second)) partners.set(second, new Set());
    partners.get(first).add(second);
    partners.get(second).add(first);
  }
  return {
    ...mode,
    label: content.label,
    conversations,
    characters: mode.characters.filter((item) => partners.has(item.id))
      .map((item) => ({ ...item, partners: [...partners.get(item.id)] })),
  };
}
