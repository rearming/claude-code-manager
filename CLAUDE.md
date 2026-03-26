# claude-code-manager

## project

A web-based session browser for Claude Code conversations. Browse, search, and fork sessions stored in your local ~/.claude/ directory.

monorepo (server + client workspaces). react + mobx + vite frontend, node backend. 

### Features

Browse sessions — View all Claude Code conversations across projects
Search & filter — Find sessions by content, project, slug, or session ID
Markdown rendering — Syntax-highlighted code blocks and GitHub-flavored markdown
Resume sessions — Get the CLI command to continue any session
Fork conversations — Branch off at any message to explore a different direction, preserving full context up to that point

## styling rules

- **never use rounded corners** - always `rounded-none`, no exceptions
- **lowercase text** - deliberate design choice
- **zinc palette** with thin borders (`border-zinc-600`) for everything
- **transparency for layered surfaces** - `bg-black/50`, `bg-black/80` style
- **lucide icons** for all iconography (`lucide-react`)
- **shadcn components** for all UI primitives - import from `@/components/shadcn/ui/`
- **prefer tailwind** over raw CSS. CSS only when tailwind gets too verbose
- **focus:ring-0** or minimal ring styling, never default blue rings
- **no `any` types** - use `unknown` if absolutely necessary

## color system

- background: pure black `#000000`
- text: light warm gray `rgb(216, 211, 220)`
- surfaces: zinc-700 (primary), zinc-800 (secondary)
- borders: zinc-600
- destructive: red-900
- overlays: `bg-black/70` to `bg-black/80`

## typography

- headings: `Playfair Display SC` (serif, small caps) via `.font-title`
- body: `Source Sans Pro` (sans-serif)

## component patterns

- `cn()` from `lib/utils.ts` for class merging (clsx + tailwind-merge)
- button default variant is `outline`, not `default`
- all buttons: `cursor-pointer`, `focus:ring-0`, `disabled:opacity-65`
- dialog overlay: `bg-black/80`, z-250
- tooltip: `bg-zinc-900/95 text-xs`, z-500
- **stateful UI** - user-adjustable UI state (sizes, positions, toggles, preferences) must persist across page reloads via `localStorage`

## code style

- no `any` types
- keep it minimal - let content breathe
