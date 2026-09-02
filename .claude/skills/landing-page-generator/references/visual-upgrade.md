# Visual Upgrade System

Take the neutral monochrome page and redesign it into something that looks like a real, shipped landing page. Not a theme applied on top, but a proper visual pass with personality.

## Iron Rules

1. **Never change copy.** All text, headlines, CTAs, testimonials stay exactly as written.
2. **Never change structure.** Section order, layout grids, and content hierarchy stay intact.
3. **Only change visual presentation:** colors, fonts, shadows, backgrounds, spacing, hover states, and decorative elements.
4. **Stay self-contained.** One HTML file. Tailwind CDN + Google Fonts only. No build step.
5. **Save as numbered variations:** `{slug}-landing-page-v1.html`, `v2.html`, etc. Keep the original neutral file intact. Each iteration gets a new number so progress is never lost.
6. **Never use `@apply`.** It does not work with the Tailwind CDN script tag. All classes must be inline on elements. No custom CSS class names that reference Tailwind utilities.

## Step 1: Prompt for Direction

Before touching code, ask the user via AskUserQuestion which visual direction to take. Present 2-3 options tailored to their product, each a coherent combination of:

- **Aesthetic direction** (Clean SaaS, Editorial, Playful, Luxury, Brutally Minimal, Bold Startup)
- **Hero mood** (light or dark)
- **Button shape** (sharp `rounded-lg`, soft `rounded-xl`, pill `rounded-full`)
- **Color approach** (restrained ~10%, balanced ~15%, expressive ~20%)

Example prompt:
"I'll visually upgrade your page. Which direction fits your product?

A) **Clean & Professional** — light hero, sharp buttons, restrained color, geometric display font
B) **Bold & Modern** — dark hero, soft buttons, balanced color, strong sans-serif display font
C) **Warm & Approachable** — light hero with brand-50 tint, pill buttons, balanced color, rounded display font"

Adapt the options to the product. A dev tool shouldn't get "Warm & Approachable." A wellness app shouldn't get "Brutally Minimal."

## Design Tokens (after direction is chosen)

**Hero mood:**
- **Light hero:** `bg-white` for a clean look, or `bg-brand-50` for a warmer tinted feel. Both work. Pick based on direction.
- **Dark hero:** `bg-dark-950`

**Button shape** — pick ONE and use it consistently for every button on the page.

**Card borders** — default to clean outside borders: `border border-black/10 rounded-2xl`. This works on any background (white, neutral-50, brand-50) without looking dirty. Add `hover:shadow-soft transition-all duration-300` for interactivity.

## Design Principles

**The page should feel designed, not themed.** A theme is "pick green, apply everywhere." A designed page uses a neutral foundation with brand color appearing in specific, intentional moments.

**Each section is its own room.** Alternate section backgrounds so sections feel distinct. The palette: `white`, `neutral-50`, off-black (`dark-950`), and optionally ONE section in `brand-50`. Give sections generous vertical spacing: `py-24 md:py-32`. Never place `brand-50` next to `neutral-50` — the two light tints look muddy together. Always separate them with a `white` or `dark` section between them.

**Typography does the heavy lifting.** The display font must be legible at large sizes, not just "interesting." Hero headlines use `clamp(2.5rem, 5vw, 4.5rem)` and should fill 2 lines, not 3. Section headlines use `clamp(1.75rem, 3.5vw, 3rem)`. Use CSS `<style>` for clamp values. Container: `max-w-7xl`, hero headline area: `max-w-4xl`. Always add `text-balance` to headlines so line breaks distribute evenly.

**Brand color is rare, so it pops.** On light backgrounds, brand color appears ONLY on:
- Eyebrow labels (the small uppercase text above headlines)
- Primary CTA buttons
- Icon containers (light tinted bg + darker icon)
- Metric/stat numbers in testimonials
- One highlight card (e.g. a key feature gets `bg-brand-600` with white text)

Everything else stays neutral (`neutral-900`, `neutral-500`, `neutral-400`).

## Dark Sections

Use 1-2 dark sections. If you picked a dark hero, the CTA can also be dark (or light for contrast). If you picked a light hero, the CTA should be dark to bookend the page. The "positive" half of a before/after can also be dark.

**Off-black, not black.** Define custom dark colors in Tailwind config with just a whisper of the brand hue:
```
dark: { 700: '#1a1f1c', 800: '#141816', 900: '#0f1210', 950: '#0a0d0b' }
```
Use `bg-dark-950` for backgrounds, `border-dark-700` for borders.

**Text on dark backgrounds: always `text-white` at opacity.** This is the most important rule for dark sections. Never use colored text (like `text-brand-300`) or neutral scale (like `text-neutral-400`) on dark backgrounds. White at different opacities blends smoothly against any dark bg:
- Headlines: `text-white`
- Body text: `text-white/60`
- Secondary buttons: `text-white/70` with `border-white/20`
- Eyebrows/labels: `text-white/40`
- Trust badges / fine print: `text-white/30`
- The only exception: small accent icons (checkmarks, etc.) can use `text-brand-400`

**Buttons on dark backgrounds:**
- Primary: `bg-brand-500 text-white` (same as light sections)
- Secondary: `text-white/70 border border-white/20 hover:border-white/40 hover:text-white`

## Light Sections

**Text on light backgrounds: always use the neutral scale.** Never use opacity modifiers on text over light backgrounds. Never use brand colors for body text or headlines.
- Headlines: `text-neutral-900`
- Body / descriptions: `text-neutral-500`
- Secondary labels / roles: `text-neutral-400`
- Section header eyebrows: `text-brand-600` (one of the few brand color uses)

## Shadows and Depth

Define shadow tokens in Tailwind config using plain black rgba (not brand-tinted):
```
'soft': '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)'
'lifted': '0 2px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)'
'hero': '0 8px 30px rgba(0,0,0,0.15), 0 32px 80px rgba(0,0,0,0.2)'
```

Cards get `border border-black/10 rounded-2xl`. This border works cleanly on any background (white, neutral-50, brand-50) without looking muddy. On hover: `hover:shadow-soft transition-all duration-300`. The hero screenshot gets `shadow-hero`.

## Hero Treatment

**Always include a nav bar** at the top of the hero section: product name/logo on the left, 2-3 nav links + a CTA button on the right. Keep it simple, not sticky. Use `py-5` padding, place it inside the hero section's container so it shares the hero background.

The hero should feel important but not monopolize the viewport. Use `py-24 md:py-32` for the hero content (below the nav), NOT `min-h-screen`. The user should see the beginning of the next section without scrolling.

**Dark hero:**
- `bg-dark-950` with a subtle ambient glow: `absolute` div with `bg-brand-500/[0.06] blur-[120px]`
- Screenshot mock in dark tones (`bg-dark-900`, `border-dark-700`) breaking into next section with `translate-y-16`
- Next section compensates with `pt-32`

**Light hero:**
- `bg-white` or `bg-neutral-50`, no glow needed
- Screenshot mock in light tones (`bg-neutral-100`, `border border-black/10`, `shadow-hero`) breaking into next section with `translate-y-16`
- Buttons: primary is `bg-brand-500 text-white`, secondary is `text-neutral-600 border border-neutral-300`
- Text: headline `text-neutral-900`, body `text-neutral-500`, eyebrow `text-brand-600`

## Anti-Slop Checklist

Before saving, verify NONE of these are present:
- `@apply` anywhere in `<style>` tags (breaks with Tailwind CDN)
- Custom CSS class names used on elements (`.card`, `.btn-primary`, etc.)
- `font-display` or `font-body` classes WITHOUT matching `fontFamily` in the Tailwind config (if you use these classes, the config MUST define them)
- Inline `style="font-family:..."` scattered across elements (put fonts in the Tailwind config `fontFamily` and use `font-display`/`font-body` classes instead)
- Mixing native Tailwind colors (e.g. `bg-rose-50`) with custom `brand` colors for the same hue (use `brand-*` everywhere for the accent color)
- Brand-colored text for headlines, body copy, or testimonial quotes
- `text-neutral-*` or `text-brand-*` on dark backgrounds (use `text-white/*` instead)
- Opacity modifiers on text over light backgrounds (use neutral scale instead)
- Purple-to-blue gradient backgrounds
- Decorative blob SVGs or floating gradient shapes
- Brand color on more than ~10% of elements
- Body background in brand-50 (too much theme, use white or neutral-50)
- `min-h-screen` on the hero (too tall, use `py-24 md:py-32` instead)
- 3+ lines where 2 would work (widen the container or bump font size)
- Every page looking the same (vary hero mood, button shape, card style)
- Cool gray text (`text-neutral-300/400`) on warm-tinted backgrounds (`brand-50`, amber-50, etc.) — gray looks dirty next to warm tones. Use `text-neutral-500` minimum or `text-brand-700` on warm backgrounds.
- Text smaller than `text-sm` (`text-xs`) on white/light backgrounds — too small to read comfortably. `text-xs` is only OK for labels inside cards, never for standalone body text.
- `text-neutral-400` or lighter for any text on white backgrounds — minimum contrast for readable body text is `text-neutral-500`. Use `text-neutral-400` only for metadata (dates, roles, captions) that sits next to darker text.
- `brand-50` section adjacent to `neutral-50` section — two light tints side by side look muddy. Always put a `white` or `dark` section between them.
- Missing nav bar — every page needs a simple header with product name + CTA button.

## Styled HTML Head (MUST use this structure)

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '{brand-50}', 100: '{brand-100}', 200: '{brand-200}',
          300: '{brand-300}', 400: '{brand-400}', 500: '{brand-500}',
          600: '{brand-600}', 700: '{brand-700}', 800: '{brand-800}',
          900: '{brand-900}', 950: '{brand-950}'
        },
        dark: { 700: '#1a1f1c', 800: '#141816', 900: '#0f1210', 950: '#0a0d0b' }
      },
      fontFamily: {
        display: ['{display-font}', 'system-ui', 'sans-serif'],
        body: ['{body-font}', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
        'lifted': '0 2px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)',
        'hero': '0 8px 30px rgba(0,0,0,0.15), 0 32px 80px rgba(0,0,0,0.2)',
      }
    }
  }
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={display-font}:wght@400;500;600;700&family={body-font}:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body { font-family: '{body-font}', system-ui, sans-serif; }
  .hero-headline { font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 1.05; letter-spacing: -0.03em; }
  .section-headline { font-size: clamp(1.75rem, 3.5vw, 3rem); line-height: 1.1; letter-spacing: -0.02em; }
</style>
```

## Font Selection

Pick `{display-font}` for headlines. It must be **legible at large sizes** and available on Google Fonts.

**Tested headline fonts by vibe** (all on Google Fonts, all legible at clamp sizes):

| Vibe | Fonts | Use when |
|------|-------|----------|
| Clean geometric | Space Grotesk, Plus Jakarta Sans, Outfit, Sora | SaaS, dev tools, dashboards |
| Warm friendly | Nunito, Quicksand, Rubik | Consumer apps, wellness, creative |
| Editorial serif | Instrument Serif, Fraunces, Lora, Source Serif 4 | Agencies, premium, legal, finance |
| Bold confident | DM Sans (700), Urbanist (700), Bricolage Grotesque | Startups, marketing, bold brands |
| Monospace | JetBrains Mono, IBM Plex Mono, Space Mono | Dev tools, technical, hacker energy |

Pick `{body-font}` for readability. Neutral, doesn't compete: Inter, DM Sans, Source Sans 3, IBM Plex Sans, Nunito Sans, Work Sans.

**Pairing rule:** don't pair two fonts from the same vibe. Serif display + sans body, or bold display + neutral body. Same-vibe pairs look like one font.

**Overused — avoid as display font:** Inter, Roboto, Poppins, Montserrat, Open Sans, Lato. Fine as body fonts, generic as headlines.

Pick the brand color family based on the product domain and voice. Avoid purple-to-blue (generic AI look). Use `500` for buttons, `600` for eyebrows/icons, `50` for icon container backgrounds, `400` for checkmarks on dark.

## After Styling

Open the styled file in the browser. Then ask via AskUserQuestion:

"Here's your visually upgraded page. The original neutral version is still at `{slug}-landing-page.html`.

What do you think?
A) Love it, keep this version
B) Tweak the colors (tell me what you want)
C) Different font pairing
D) More/less dark sections
E) Go back to the neutral version
F) Try a completely different visual direction"

If F: re-run the refinement with a different color family, different font pairing, and different dark section placement. Save as `{slug}-landing-page-styled-v2.html`.
