import { Image } from 'expo-image';
import { useMemo } from 'react';
import { fromByteArray } from 'base64-js';
import { View } from 'react-native';
import { templateFor } from '@/modules/route-engine/engine';

const assets = {
  dog: { source: require('../../../assets/generation/dog.svg'), width: 38.0044, height: 39.9973 },
  person: { source: require('../../../assets/generation/person.svg'), width: 44.0063, height: 43.0002 },
  bone: { source: require('../../../assets/generation/bone.svg'), width: 46.0007, height: 25 },
  turtle: { source: require('../../../assets/generation/turtle.svg'), width: 48.0001, height: 28.9999 },
  icecream: { source: require('../../../assets/generation/icecream.svg'), width: 35.9999, height: 41 },
  strawberry: { source: require('../../../assets/generation/strawberry.svg'), width: 38, height: 38.0002 },
  cloud: { source: require('../../../assets/generation/cloud.svg'), width: 50.0017, height: 27.0006 },
  crown: { source: require('../../../assets/generation/crown.svg'), width: 52, height: 27 },
  image: { source: require('../../../assets/generation/image.svg'), width: 20, height: 20 },
  heart: { source: require('../../../assets/generation/heart.svg'), width: 40.0004, height: 34.0002 },
  star: { source: require('../../../assets/generation/star.svg'), width: 42.0003, height: 39 },
  cat: { source: require('../../../assets/generation/cat.svg'), width: 38.0479, height: 43.0035 },
  fish: { source: require('../../../assets/generation/fish.svg'), width: 48.0004, height: 29.9978 },
  locate: { source: require('../../../assets/generation/locate.svg'), width: 16, height: 16 },
  draw: { source: require('../../../assets/generation/draw.svg'), width: 20, height: 20 },
  generate: { source: require('../../../assets/generation/generate.svg'), width: 25.5, height: 24.666 },
  confirm: { source: require('../../../assets/generation/generate-confirm.svg'), width: 20, height: 20 },
  run: { source: require('../../../assets/generation/run.svg'), width: 22, height: 22 },
};
export function GenerationIcon({ name }: { name: keyof typeof assets }) {
  const asset = assets[name];
  if (name === 'generate') return <View accessible={false} style={{ width: 22, height: 22 }}>
    <Image source={asset.source} contentFit="contain" accessible={false}
      style={{ position: 'absolute', left: -2.5, top: -5 / 3, width: asset.width, height: asset.height }} />
  </View>;
  // Figma's star/cat/fish layers have a mirrored parent; preserve the original SVG dimensions.
  return <View accessible={false} style={{ width: asset.width, height: asset.height }}>
    <Image source={asset.source} contentFit="contain" accessible={false} style={{ width: asset.width, height: asset.height,
      transform: ['star', 'cat', 'fish', 'dog', 'person', 'bone', 'turtle', 'icecream', 'strawberry', 'cloud', 'crown'].includes(name) ? [{ scaleX: -1 }] : undefined }} />
  </View>;
}

/** Legacy engine shapes are dynamic previews, not replacements for Figma's new S2b shapes. */
export function LegacyShapeIcon({ shape }: { shape: string }) {
  const uri = useMemo(() => {
    const template = templateFor(shape);
    const xs = template.map(p => p.x), ys = template.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = 36 / Math.max(maxX - minX, maxY - minY);
    // Built-in templates use y-down coordinates and can exceed [-1, 1].
    const points = template.map(p => `${(22 + (p.x - (minX + maxX) / 2) * scale).toFixed(2)},${(22 + (p.y - (minY + maxY) / 2) * scale).toFixed(2)}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><polyline points="${points}" fill="none" stroke="#B3B3B3" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;base64,${fromByteArray(Uint8Array.from(svg, char => char.charCodeAt(0)))}`;
  }, [shape]);
  return <Image source={{ uri }} style={{ width: 44, height: 44 }} accessible={false} />;
}
