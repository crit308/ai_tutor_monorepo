import type { WBObject } from '@aitutor/whiteboard-schema';

export async function loadTemplate(name: string): Promise<WBObject[]> {
  const url = `/whiteboard_templates/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Template ${name} not found`);
  const data = await res.json();
  return data as WBObject[];
} 