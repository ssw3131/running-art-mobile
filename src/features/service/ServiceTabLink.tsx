import { Link, type LinkProps } from 'expo-router';
import { openServiceTab } from './open-service-tab';

export function ServiceTabLink({ href, onPress, ...props }: LinkProps) {
  return <Link {...props} href={href} onPress={event => {
    onPress?.(event);
    if (!event.defaultPrevented) { event.preventDefault(); openServiceTab(href); }
  }} />;
}
