/** Figma UI + component. Keep action and selection oranges distinct. */
export const colors = {
  background: '#FFFFFF', surface: '#FFFFFF', navigation: '#F4F6FA',
  text: '#000000', muted: '#757575', subtle: '#828387', placeholder: '#B3B3B3',
  action: '#FB5603', selected: '#FC5602', onAction: '#FFFFFF',
  secondary: '#D9D9D9', outlineText: '#999999', border: '#D9D9D9',
  outline: '#B3B3B3', divider: '#E0E0E0', inactive: '#8C8C94',
  danger: '#B3261E', overlay: 'rgba(0,0,0,0.4)',
} as const;

export const darkColors: { [K in keyof typeof colors]: string } = {
  background: '#121212', surface: '#1D1D1F', navigation: '#26262A', text: '#F5F5F5',
  muted: '#B5B5BC', subtle: '#BFC0C7', placeholder: '#919199', action: '#FB5603', selected: '#FF9A61', onAction: '#FFFFFF',
  secondary: '#414145', outlineText: '#C7C7CC', border: '#52525A', outline: '#888892', divider: '#414149', inactive: '#B0B0B8',
  danger: '#FFB4AB', overlay: 'rgba(0,0,0,0.65)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 } as const;
export const radius = { field: 8, compact: 10, card: 20, outline: 28, button: 30, pill: 999 } as const;
export const size = { touch: 48, button: 60, secondaryButton: 50, field: 50, popupButton: 35 } as const;
export const fonts = {
  noto: { regular: 'NotoSansKR_400Regular', medium: 'NotoSansKR_500Medium', semibold: 'NotoSansKR_600SemiBold', bold: 'NotoSansKR_700Bold', black: 'NotoSansKR_900Black' },
  roboto: { regular: 'Roboto_400Regular', medium: 'Roboto_500Medium', semibold: 'Roboto_600SemiBold', bold: 'Roboto_700Bold', black: 'Roboto_900Black' },
} as const;
export type FontFamily = keyof typeof fonts;
export type FontWeight = keyof typeof fonts.noto;
export const typography = {
  title: { fontSize: 24, lineHeight: 35 }, heading: { fontSize: 20, lineHeight: 29 },
  body: { fontSize: 16, lineHeight: 24 }, label: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 18 }, navigation: { fontSize: 11, lineHeight: 17 },
  metric: { fontSize: 36, lineHeight: 44 },
} as const;
