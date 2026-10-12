import { router, type Href } from 'expo-router';

/** Pop detail/callback screens before targeting a tab, retaining mounted state. */
export function openServiceTab(href: Href) {
  router.dismissAll();
  router.navigate(href);
}
