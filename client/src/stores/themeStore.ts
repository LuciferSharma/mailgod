import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
}

function getInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('qr-mailer-theme') as Theme) || 'dark';
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Apply immediately on import
apply(getInitial());

export const useTheme = create<ThemeStore>((set) => ({
  theme: getInitial(),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('qr-mailer-theme', next);
      apply(next);
      return { theme: next };
    }),
}));
