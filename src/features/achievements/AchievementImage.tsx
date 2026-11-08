import { useEffect, useRef } from 'react';
import { Image, type ImageProps } from 'expo-image';

/** Retry a transient asset/decoder failure before surfacing it to the card. */
export function AchievementImage({ onError, ...props }: ImageProps) {
  const image = useRef<Image>(null);
  const attempts = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(true);
  const generation = useRef(0);
  const sourceKey = JSON.stringify(props.source);
  useEffect(() => {
    active.current = true; attempts.current = 0;
    return () => { active.current = false; generation.current += 1; clearTimeout(timer.current); };
  }, [sourceKey]);
  return <Image {...props} ref={image} transition={0} cachePolicy="memory-disk" onError={event => {
    if (!active.current) return;
    if (attempts.current++ >= 2) { onError?.(event); return; }
    const request = generation.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (active.current && generation.current === request) void image.current?.reloadAsync().catch(() => { if (active.current && generation.current === request) onError?.(event); });
    }, 250 * attempts.current);
  }} />;
}
