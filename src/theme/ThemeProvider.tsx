import { createContext, useContext, type PropsWithChildren } from 'react';
import { colors } from './tokens';

export type ThemeColors = { [Key in keyof typeof colors]: string };
const ThemeContext = createContext<ThemeColors>(colors);
/** Explicit theme boundary; additional palettes must be verified before shipping. */
export function ThemeProvider({ children, palette = colors }: PropsWithChildren<{ palette?: ThemeColors }>) {
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}
export const useThemeColors = () => useContext(ThemeContext);
