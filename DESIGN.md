---
name: Eclipse Dark UI
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c5d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e909f'
  outline-variant: '#444654'
  surface-tint: '#b8c4ff'
  primary: '#b8c4ff'
  on-primary: '#002584'
  primary-container: '#0033ad'
  on-primary-container: '#96aaff'
  inverse-primary: '#3254ca'
  secondary: '#c3c7cd'
  on-secondary: '#2c3136'
  secondary-container: '#454a4f'
  on-secondary-container: '#b4b9bf'
  tertiary: '#bec6e0'
  on-tertiary: '#283044'
  tertiary-container: '#394156'
  on-tertiary-container: '#a6adc6'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#0e39b2'
  secondary-fixed: '#dfe3e9'
  secondary-fixed-dim: '#c3c7cd'
  on-secondary-fixed: '#171c20'
  on-secondary-fixed-variant: '#43474c'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-xl:
    fontFamily: Sora
    fontSize: 72px
    fontWeight: '700'
    lineHeight: 80px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Sora
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Sora
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Sora
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Sora
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

## Brand & Style

This design system is built for high-performance fintech and crypto platforms. The brand personality is authoritative, precise, and sophisticated, utilizing a **Corporate Modern** style with **Glassmorphism** accents. 

The visual narrative focuses on "The Eclipse"—a study in light and shadow. We use deep, monochromatic backgrounds to create a sense of vast space, punctuated by high-intensity "celestial" light sources and vibrant blue interactive elements. The aesthetic prioritizes data density and technical clarity, ensuring that complex information feels manageable and professional. Key characteristics include:
- **Atmospheric Depth:** Using gradients and radial blurs to simulate light emerging from darkness.
- **Precision:** Tight grids and sharp, tech-focused typography (Sora).
- **Subtle Materiality:** Semi-transparent containers that indicate hierarchy without cluttering the UI.

## Colors

The palette is anchored in a true-black neutral (`#070707`) to maximize OLED contrast and power efficiency. 

- **Primary (Electric Blue):** Used strictly for CTAs, active states, and critical data visualizations. The base blue (`#0033AD`) is highly saturated to "pop" against the dark background.
- **Secondary (Technical Greys):** A range of cool-toned greys used for borders, secondary text, and iconography.
- **Surfaces:** UI surfaces are not flat; they utilize subtle radial gradients that start slightly lighter at the top-left to imply a light source, transitioning into deep obsidian.
- **Utility:** Use high-contrast white for primary headers to ensure immediate legibility against dark backgrounds.

## Typography

This system uses **Sora** exclusively to maintain a cohesive, technical aesthetic. Sora’s geometric structure and wide apertures make it exceptionally readable in dark mode, even at small sizes.

- **Display & Headlines:** Use tight letter-spacing and bold weights to create a strong visual anchor.
- **Body Text:** Use `body-md` for standard descriptions. Ensure a color contrast ratio of at least 7:1 by using secondary grey scales for long-form text to reduce eye strain.
- **Labels:** Use `label-sm` with uppercase styling for metadata, tags, and small section headers to differentiate from body content.

## Layout & Spacing

The design system utilizes a **12-column Fluid Grid** for desktop and a **4-column grid** for mobile. 

- **The 8px Rhythm:** All spacing (padding, margins, gap) must be multiples of 8px to maintain mathematical harmony.
- **Sectioning:** Large sections of the landing page should be separated by significant vertical padding (120px to 160px) to allow the "atmospheric" gradients space to breathe.
- **Density:** Dashboard and data-heavy views should transition to a 4px increment system to increase information density while maintaining alignment.

## Elevation & Depth

In a dark UI, depth is communicated through **Tonal Layers** and **Glassmorphism**, rather than traditional drop shadows.

- **Surface Levels:** 
    - Level 0: Pure Black (`#070707`) - Background.
    - Level 1: Deep Navy/Grey (`#111827`) - Card backgrounds.
    - Level 2: Soft Grey (`#1F2937`) - Hover states and active fields.
- **Borders:** Use low-opacity white borders (e.g., `rgba(255, 255, 255, 0.08)`) to define element boundaries without creating visual noise.
- **Blur:** For modal overlays or navigation bars, use a `20px` backdrop blur with a `rgba(7, 7, 7, 0.7)` fill to maintain context of the underlying content.

## Shapes

The shape language is **Soft** but disciplined. We avoid overly organic "bubble" shapes in favor of a professional, engineered look.

- **Standard Radius:** 4px (0.25rem) for small components like checkboxes and small buttons.
- **Component Radius:** 8px (0.5rem) for primary cards and input fields.
- **Large Radius:** 12px (0.75rem) for hero sections and main containers.
- **Pill Shapes:** Used exclusively for tags, chips, and "Switch" toggles.

## Components

### Buttons
- **Primary:** High-intensity blue (`#0033AD`) with white text. No shadow; instead, use a subtle inner glow on hover.
- **Secondary:** Ghost style with a 1px border (`Secondary-30`) and white text.
- **Tertiary:** Text-only with an arrow icon for "Learn More" links.

### Input Fields
- **Default State:** Dark fill (`#111827`) with a subtle 1px border.
- **Focus State:** Border color changes to Primary Blue with a soft blue outer glow (3px spread).

### Cards
- Use a very subtle linear gradient (Top-Left to Bottom-Right) from `#111827` to `#070707`.
- Always include a 1px border using `rgba(255, 255, 255, 0.05)`.

### Data Visualization
- Line charts should use the Primary Blue with a gradient area fill below the line that fades to transparent.
- Interactive points on charts should have a "glow" effect to emphasize focus.

### Navigation
- Sticky header with a backdrop blur (`20px`) and a thin bottom divider to separate it from the content.