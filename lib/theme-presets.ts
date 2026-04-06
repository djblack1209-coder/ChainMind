// ChainMind Theme Presets
// Inspired by Cherry Studio theme marketplace pattern

export interface ThemePreset {
  id: string;
  name: string;
  nameEn: string;
  author?: string;
  base: 'dark' | 'light';
  vars: Record<string, string>;
}

export const builtinPresets: ThemePreset[] = [
  {
    id: 'default-dark',
    name: '默认深色',
    nameEn: 'Default Dark',
    base: 'dark',
    vars: {},
  },
  {
    id: 'default-light',
    name: '默认浅色',
    nameEn: 'Default Light',
    base: 'light',
    vars: {},
  },
  {
    id: 'ocean-dark',
    name: '深海蓝',
    nameEn: 'Ocean Dark',
    base: 'dark',
    vars: {
      '--brand-primary': '#4facfe',
      '--brand-primary-hover': '#6fbfff',
      '--brand-primary-light': 'rgba(79, 172, 254, 0.18)',
      '--brand-primary-soft': 'rgba(79, 172, 254, 0.1)',
      '--brand-secondary': '#00f2fe',
      '--brand-secondary-light': 'rgba(0, 242, 254, 0.14)',
      '--bg-root': '#0a0e1a',
      '--bg-primary': 'rgba(12, 18, 32, 0.92)',
      '--bg-secondary': 'rgba(18, 26, 44, 0.8)',
      '--border-primary': 'rgba(79, 172, 254, 0.34)',
      '--border-hover': 'rgba(111, 191, 255, 0.42)',
      '--shadow-glow': '0 0 0 1px rgba(79, 172, 254, 0.08), 0 22px 56px rgba(79, 172, 254, 0.18)',
    },
  },
  {
    id: 'forest-dark',
    name: '森林绿',
    nameEn: 'Forest Dark',
    base: 'dark',
    vars: {
      '--brand-primary': '#4ade80',
      '--brand-primary-hover': '#6ee7a0',
      '--brand-primary-light': 'rgba(74, 222, 128, 0.18)',
      '--brand-primary-soft': 'rgba(74, 222, 128, 0.1)',
      '--brand-secondary': '#a3e635',
      '--brand-secondary-light': 'rgba(163, 230, 53, 0.14)',
      '--bg-root': '#060a06',
      '--bg-primary': 'rgba(10, 18, 10, 0.92)',
      '--bg-secondary': 'rgba(16, 28, 16, 0.8)',
      '--border-primary': 'rgba(74, 222, 128, 0.34)',
      '--border-hover': 'rgba(110, 231, 160, 0.42)',
      '--shadow-glow': '0 0 0 1px rgba(74, 222, 128, 0.08), 0 22px 56px rgba(74, 222, 128, 0.18)',
    },
  },
  {
    id: 'purple-dark',
    name: '暗夜紫',
    nameEn: 'Purple Night',
    base: 'dark',
    vars: {
      '--brand-primary': '#a78bfa',
      '--brand-primary-hover': '#c4b5fd',
      '--brand-primary-light': 'rgba(167, 139, 250, 0.18)',
      '--brand-primary-soft': 'rgba(167, 139, 250, 0.1)',
      '--brand-secondary': '#e879f9',
      '--brand-secondary-light': 'rgba(232, 121, 249, 0.14)',
      '--bg-root': '#0c0612',
      '--bg-primary': 'rgba(16, 10, 24, 0.92)',
      '--bg-secondary': 'rgba(24, 16, 36, 0.8)',
      '--border-primary': 'rgba(167, 139, 250, 0.34)',
      '--border-hover': 'rgba(196, 181, 253, 0.42)',
      '--shadow-glow': '0 0 0 1px rgba(167, 139, 250, 0.08), 0 22px 56px rgba(167, 139, 250, 0.18)',
    },
  },
  {
    id: 'rose-light',
    name: '玫瑰浅色',
    nameEn: 'Rose Light',
    base: 'light',
    vars: {
      '--brand-primary': '#e11d48',
      '--brand-primary-hover': '#be123c',
      '--brand-primary-light': 'rgba(225, 29, 72, 0.12)',
      '--brand-primary-soft': 'rgba(225, 29, 72, 0.08)',
      '--brand-secondary': '#f43f5e',
      '--bg-root': '#fdf2f4',
      '--bg-primary': 'rgba(255, 255, 255, 0.92)',
      '--border-primary': 'rgba(225, 29, 72, 0.3)',
      '--border-hover': 'rgba(225, 29, 72, 0.4)',
    },
  },
];

const CUSTOM_PRESETS_KEY = 'chainmind-custom-themes';

export function getCustomPresets(): ThemePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(preset: ThemePreset): void {
  const existing = getCustomPresets();
  const idx = existing.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    existing[idx] = preset;
  } else {
    existing.push(preset);
  }
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
}

export function deleteCustomPreset(id: string): void {
  const existing = getCustomPresets().filter((p) => p.id !== id);
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
}

export function getAllPresets(): ThemePreset[] {
  return [...builtinPresets, ...getCustomPresets()];
}

export function applyPreset(preset: ThemePreset): void {
  const root = document.documentElement;
  // Set base theme
  root.setAttribute('data-theme', preset.base);
  // Apply custom CSS variables
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(key, value);
  }
  // Store active preset
  localStorage.setItem('chainmind-active-preset', preset.id);
}

export function clearPresetOverrides(): void {
  const root = document.documentElement;
  // Remove all inline style overrides
  root.removeAttribute('style');
}

export function getActivePresetId(): string {
  if (typeof window === 'undefined') return 'default-dark';
  return localStorage.getItem('chainmind-active-preset') || 'default-dark';
}

export function exportPreset(preset: ThemePreset): string {
  return JSON.stringify(preset, null, 2);
}

export function importPreset(json: string): ThemePreset | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.id || !parsed.name || !parsed.base || !parsed.vars) return null;
    return parsed as ThemePreset;
  } catch {
    return null;
  }
}
