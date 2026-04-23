export function slugifyHeading(input: string): string {
  const plain = input
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '');
  return plain.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}
