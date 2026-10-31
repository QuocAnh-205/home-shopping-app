import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBath, faBed, faCouch, faHouseChimney, faKitchenSet, faPlug } from '@fortawesome/free-solid-svg-icons';

const CATEGORY_ICON: Record<string, IconDefinition> = {
  'nha-bep': faKitchenSet,
  'phong-khach': faCouch,
  'phong-ngu': faBed,
  'dien-gia-dung': faPlug,
  'phong-tam': faBath,
};

export function categoryIcon(slug?: string): IconDefinition {
  return (slug && CATEGORY_ICON[slug]) || faHouseChimney;
}

/** Ảnh đại diện danh mục (file tĩnh trong public/images/site) */
export function categoryImage(slug: string): string | null {
  return slug in CATEGORY_ICON ? `/images/site/cat-${slug}.webp` : null;
}
