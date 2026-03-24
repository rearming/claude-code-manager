# cnvrg visual style - transferrable guide

## philosophy
- dark, angular, elegant. no rounded corners. ever. (`rounded-none` everywhere)
- lowercase text is a deliberate style choice
- simple but pleasant ux: lucide icons, subtle transparency (`bg-black/50`, `bg-black/80`)
- zinc palette with thin borders and elegant accents
- minimal, not busy. let content breathe

## color system (tailwind v4 `@theme` block)
```css
@theme {
  --color-primary: var(--color-zinc-700);
  --color-secondary: var(--color-zinc-800);
  --color-border: var(--color-zinc-600);
  --color-destructive: var(--color-red-900);
  --color-background: var(--color-black);
  --color-warning: var(--color-yellow-900);
  --color-input: var(--color-zinc-600);
  --color-ring: var(--color-zinc-500);
  --color-tabs-active: var(--color-zinc-800);
  --color-popover: var(--color-black);
}
```

- background: pure black `#000000`
- text: light warm gray `rgb(216, 211, 220)`
- accents: zinc-600 borders, zinc-700/800 surfaces
- destructive: deep red-900
- overlays: `bg-black/70` to `bg-black/80`

## typography
- **headings**: `Playfair Display SC` (serif, small caps) - imported from google fonts
- **body**: `Source Sans Pro` (sans-serif) - imported from google fonts
- tailwind config extends `fontFamily: { playfair: ['Playfair Display SC', 'serif'] }`
- utility class `.font-title` for applying heading font inline
- line-height: 1.2 for headings, 1.5 for body

## component library: shadcn/ui (customized)
- lives at `src/components/shadcn/` with subdirs: `ui/`, `hooks/`, `lib/`
- import pattern: `import { Button } from "@/components/shadcn/ui/button"`
- utility: `cn()` from `lib/utils.ts` using `clsx` + `tailwind-merge`
- all components use `rounded-none` (no border-radius anywhere)

### key component customizations

**button** (class-variance-authority):
- default variant: `bg-black/80 text-zinc-200 border-primary border-1 hover:bg-zinc-800`
- outline: `border border-primary shadow-sm hover:bg-accent`
- ghost: `hover:bg-accent`
- destructive: `bg-destructive/50`
- custom variants: `bottom` (border-b), `top` (border-t), `animated` (hover-scale)
- default variant is `outline`, not `default`
- all buttons: `cursor-pointer`, `focus:ring-0`, `disabled:opacity-65`

**card**: `border border-border bg-card shadow`, tight padding (`p-2` content, `p-4` header)

**dialog**: `bg-background border border-border p-2`, overlay `bg-black/80`, z-250

**input**: `bg-transparent border border-input rounded-none`, focus ring via `ring-ring`

**tabs**: `rounded-none`, active state `bg-tabs-active`

**switch**: `rounded-none`, unchecked `bg-zinc-900`, thumb `bg-zinc-400 rounded-none`

**tooltip**: `bg-zinc-900/95 text-xs`, z-500

**scroll-area**: custom `enableScrollbar` prop, thumb `bg-border rounded-none`

**sheet**: overlay `bg-black/70`

## tailwind plugins
- `tailwindcss-animate` - for enter/exit animations on dialogs, popovers, etc.
- `@tailwindcss/typography` - prose styling
- `tailwind-scrollbar` - custom scrollbar styling

## css utilities
```css
.hover-scale {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.hover-scale:hover { transform: scale(1.05); }

.animate-shimmer {
  animation: shimmer 1.5s ease-in-out infinite;
  /* background-position animation for loading states */
}
```

## key dependencies needed
```
tailwindcss (v4)
tailwindcss-animate
@tailwindcss/typography
tailwind-scrollbar
class-variance-authority
clsx
tailwind-merge
@radix-ui/react-* (dialog, tabs, scroll-area, switch, tooltip, popover, etc.)
lucide-react
```

## rules to follow
1. **never use rounded** - always `rounded-none`
2. **use lowercase text** - deliberate style
3. **prefer tailwind** for styling, CSS only when tailwind gets too verbose
4. **zinc palette** with thin borders for everything
5. **`bg-black/50`-style transparency** for layered surfaces
6. **lucide icons** for all iconography
7. **no `any` types** - use `unknown` if absolutely necessary
8. **shadcn components** for all UI primitives, don't reinvent
9. **focus:ring-0** or minimal ring styling, not default blue rings

## what changes for claude-code-manager
the current project uses:
- pure custom CSS (1600+ lines in styles.css) with CSS variables
- no tailwind, no component library, no shadcn
- react + mobx + vite

to adopt this style we need to:
1. add tailwind v4 + all plugins
2. copy over the full `shadcn/` component directory
3. replace custom CSS with tailwind classes using the cnvrg theme
4. swap all custom components to use shadcn primitives
5. add google fonts (Playfair Display SC, Source Sans Pro)
6. add lucide-react for icons
