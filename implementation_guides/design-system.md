# Iron Panthers Scouting App - Design System Implementation Guide

## Brand Overview

### Team Identity

- **Team**: 5026 Iron Panthers
- **Primary Function**: FRC Robotics Competition Scouting Application
- **Target Users**: Team members collecting and analyzing competition data

### Brand Personality

The Iron Panthers scouting app embodies **efficiency meets approachability**. It's a tool built by team members, for team members - professional enough for high-stakes competition data collection, yet friendly enough for seamless collaboration during the intensity of competition day.

**Key Attributes:**

- **Focused & Efficient**: Clean interfaces that prioritize data collection speed and accuracy
- **Modern & Technical**: Reflects the precision of robotics engineering without feeling cold
- **Team-Oriented**: Friendly and collaborative, reducing barriers for scouts of all experience levels
- **Reliable**: Solid, dependable aesthetics that inspire confidence in data integrity

**NOT:**

- Overly playful or casual (no emojis, excessive animations)
- AI-generated aesthetic (no gradients, no glossy effects, no blur effects)
- Cluttered or overwhelming (information hierarchy is critical)
- Corporate or enterprise-feeling (this is for the team, by the team)

---

## Color System

### Primary Colors

#### Panther Red

- **Primary**: `hsl(0, 84%, 48%)` - #DC2626 (Tailwind red-600)

  - Use for: Primary actions, active states, important CTAs, team branding
  - The core brand color representing the Iron Panthers identity

- **Primary Hover**: `hsl(0, 84%, 42%)` - #B91C1C (Tailwind red-700)

  - Interactive state for primary buttons and links

- **Primary Muted**: `hsl(0, 70%, 35%)` - Darker, less saturated red
  - Use for: Secondary emphasis, borders on important elements

#### Neutrals (Dark Mode Foundation)

- **Background**: `hsl(0, 0%, 7%)` - #121212

  - Main app background, provides deep contrast

- **Surface**: `hsl(0, 0%, 10%)` - #1A1A1A

  - Cards, modals, elevated surfaces

- **Surface Elevated**: `hsl(0, 0%, 13%)` - #212121

  - Hover states, dropdowns, popovers

- **Border**: `hsl(0, 0%, 18%)` - #2E2E2E

  - Default borders, dividers, subtle separation

- **Border Subtle**: `hsl(0, 0%, 14%)` - #242424
  - Very subtle divisions, grid lines

#### Text Colors

- **Foreground**: `hsl(0, 0%, 98%)` - #FAFAFA

  - Primary text, headings, most readable content

- **Foreground Secondary**: `hsl(0, 0%, 70%)` - #B3B3B3

  - Secondary text, descriptions, labels

- **Foreground Muted**: `hsl(0, 0%, 50%)` - #808080
  - Placeholder text, disabled states, de-emphasized content

#### Accent & Semantic Colors

- **White Accent**: `hsl(0, 0%, 98%)` - #FAFAFA

  - Use sparingly for high-contrast elements, inverse buttons

- **Success**: `hsl(142, 76%, 36%)` - #16A34A (Tailwind green-600)

  - Successful actions, positive metrics, completed states

- **Warning**: `hsl(38, 92%, 50%)` - #F59E0B (Tailwind amber-500)

  - Warnings, attention-needed items, moderate priority alerts

- **Destructive**: `hsl(0, 84%, 60%)` - #EF4444 (Tailwind red-500)

  - Delete actions, errors, critical alerts

- **Info**: `hsl(217, 91%, 60%)` - #3B82F6 (Tailwind blue-500)
  - Information callouts, neutral status indicators

---

## Typography

### Font Stack

```css
/* Primary Font (UI & Body) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif;

/* Monospace (Data, Codes, Technical) */
font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas,
  "Liberation Mono", monospace;
```

**Rationale**: System fonts ensure fast loading, native feel, and excellent readability. Monospace for team numbers, match codes, and technical data reinforces precision.

### Type Scale

| Element        | Size             | Weight         | Line Height | Usage                         |
| -------------- | ---------------- | -------------- | ----------- | ----------------------------- |
| **H1**         | 2rem (32px)      | 700 (Bold)     | 1.2         | Page titles, major sections   |
| **H2**         | 1.5rem (24px)    | 600 (Semibold) | 1.3         | Section headers, card titles  |
| **H3**         | 1.25rem (20px)   | 600 (Semibold) | 1.4         | Subsection headers            |
| **H4**         | 1.125rem (18px)  | 600 (Semibold) | 1.4         | Small section headers         |
| **Body**       | 0.875rem (14px)  | 400 (Regular)  | 1.5         | Default text, paragraphs      |
| **Body Large** | 1rem (16px)      | 400 (Regular)  | 1.5         | Emphasis text, important body |
| **Small**      | 0.8125rem (13px) | 400 (Regular)  | 1.4         | Captions, metadata            |
| **Tiny**       | 0.75rem (12px)   | 400 (Regular)  | 1.3         | Timestamps, fine print        |
| **Code/Data**  | 0.875rem (14px)  | 500 (Medium)   | 1.4         | Team numbers, match codes     |

### Text Styling Guidelines

- **Headings**: Use bold weights (600-700) for clear hierarchy
- **Body text**: Regular weight (400) with ample line-height (1.5) for readability
- **Links**: Red on hover, underline optional based on context
- **Data/Numbers**: Consider monospace for alignment and technical feel
- **Labels**: Uppercase tiny text (0.75rem, 500 weight, letter-spacing: 0.05em) for form labels and categories

---

## Component Guidelines

### Buttons

#### Primary Button

- **Background**: Panther Red (#DC2626)
- **Text**: White
- **Hover**: Darker red (#B91C1C)
- **Height**: 40px (md), 36px (sm), 44px (lg)
- **Padding**: 16px horizontal
- **Border Radius**: 6px
- **Font**: 14px, medium weight (500)
- **Use**: Main CTAs, form submissions, important actions

#### Secondary Button

- **Background**: Surface Elevated (#212121)
- **Text**: Foreground (#FAFAFA)
- **Border**: 1px solid Border (#2E2E2E)
- **Hover**: Lighter surface, border becomes more prominent
- **Use**: Alternative actions, cancel buttons

#### Ghost Button

- **Background**: Transparent
- **Text**: Foreground Secondary (#B3B3B3)
- **Hover**: Surface (#1A1A1A)
- **Use**: Tertiary actions, icon buttons, navigation items

#### Destructive Button

- **Background**: Destructive (#EF4444)
- **Text**: White
- **Hover**: Darker destructive
- **Use**: Delete, remove, critical actions requiring confirmation

### Cards

- **Background**: Surface (#1A1A1A)
- **Border**: 1px solid Border (#2E2E2E)
- **Border Radius**: 8px
- **Padding**: 24px (lg), 16px (md), 12px (sm)
- **Shadow**: Minimal or none (prefer borders over shadows for clarity)
- **Hover State**: Border becomes slightly lighter, optional subtle shadow

**Card Variants**:

- **Elevated Card**: Background Surface Elevated for nested content
- **Interactive Card**: Cursor pointer, hover state, clickable surface
- **Data Card**: Monospace numbers, clear labels, compact spacing

### Forms

#### Input Fields

- **Background**: Background (#121212) or transparent
- **Border**: 1px solid Border (#2E2E2E)
- **Border Radius**: 6px
- **Height**: 40px
- **Padding**: 12px horizontal
- **Focus State**: Red border (#DC2626), optional subtle red glow
- **Disabled**: Muted border, muted text, cursor not-allowed

#### Labels

- **Style**: Uppercase tiny text (12px, 500 weight, 0.05em letter-spacing)
- **Color**: Foreground Secondary (#B3B3B3)
- **Spacing**: 8px margin bottom

#### Checkboxes/Radio

- **Size**: 20x20px
- **Border**: 2px solid Border
- **Checked**: Red background, white checkmark
- **Focus**: Red ring

#### Select Dropdowns

- **Match input styling**
- **Chevron icon**: Right-aligned, muted color
- **Dropdown**: Surface Elevated background, border, max-height with scroll

### Navigation

#### Top Navigation Bar

- **Background**: Surface (#1A1A1A)
- **Border Bottom**: 1px solid Border (#2E2E2E)
- **Height**: 64px
- **Content**: Logo/team identifier (left), nav items (center), user/settings (right)
- **Active State**: Red underline or red text

#### Sidebar Navigation

- **Background**: Surface (#1A1A1A)
- **Width**: 240px (expanded), 64px (collapsed)
- **Items**:
  - Height 40px
  - Padding 12px
  - Hover: Surface Elevated background
  - Active: Red left border (4px), Surface Elevated background
  - Icon + text layout

### Tables/Data Grids

- **Header**: Surface Elevated background, semibold text, 12px uppercase labels
- **Rows**:
  - Height: 48px
  - Padding: 12px
  - Border bottom: 1px Border Subtle
  - Hover: Surface background
  - Alternate rows: Optional subtle background variation
- **Cell Alignment**: Left for text, right for numbers
- **Sortable Headers**: Icon indicator, clickable
- **Monospace**: Team numbers, match codes, precise metrics

### Badges/Tags

- **Small**: Height 24px, padding 6px 10px, border-radius 4px
- **Variants**:
  - **Default**: Border subtle, foreground muted text
  - **Red**: Red background (muted), red text (lighter)
  - **Success**: Green background (muted), green text
  - **Warning**: Amber background (muted), amber text
- **Text**: 12px, medium weight

### Modals/Dialogs

- **Overlay**: rgba(0, 0, 0, 0.8)
- **Container**: Surface Elevated background, border, border-radius 12px
- **Max Width**: 500px (sm), 700px (md), 900px (lg)
- **Padding**: 24px
- **Header**: H2 title, optional close button (top-right)
- **Footer**: Right-aligned buttons, 16px gap

### Tooltips

- **Background**: Surface Elevated (#212121)
- **Text**: Foreground, 13px
- **Border**: 1px Border
- **Border Radius**: 6px
- **Padding**: 8px 12px
- **Arrow**: Matching background
- **Delay**: 300ms

---

## Spacing System

Use a consistent 4px base unit with a scale:

| Token | Size | Usage                          |
| ----- | ---- | ------------------------------ |
| `xs`  | 4px  | Tight spacing, icon gaps       |
| `sm`  | 8px  | Small gaps, compact layouts    |
| `md`  | 16px | Default spacing, standard gaps |
| `lg`  | 24px | Section spacing, card padding  |
| `xl`  | 32px | Large section breaks           |
| `2xl` | 48px | Major section dividers         |
| `3xl` | 64px | Page-level spacing             |

---

## Layout Guidelines

### Grid System

- **Container Max Width**: 1280px
- **Breakpoints**:
  - Mobile: < 640px
  - Tablet: 640px - 1024px
  - Desktop: > 1024px
- **Gutter**: 16px (mobile), 24px (tablet+)

### Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│  Top Nav (Logo | Dashboard | Manager | Settings)│
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Greeting Card   │  │  Settings Shortcut │  │
│  └──────────────────┘  └────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  Planned Matches Section                  │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐              │  │
│  │  │Match │ │Match │ │Match │  [+ Join]    │  │
│  │  └──────┘ └──────┘ └──────┘              │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Data Input Layout

- **Single column form** (max-width 600px, centered)
- **Clear section breaks** with headings
- **Logical grouping** of related fields
- **Fixed bottom bar** with Save/Cancel buttons
- **Progress indicator** if multi-step

---

## Iconography

### Icon Library

Use **Lucide React** (already installed) for consistent, clean icons.

### Icon Guidelines

- **Size**: 20px (default), 16px (small), 24px (large)
- **Stroke Width**: 2px (matches Lucide default)
- **Color**: Match text color of surrounding context
- **Spacing**: 8px gap from adjacent text

### Common Icons

- Dashboard: `LayoutDashboard`
- Users/Manager: `Users`, `UserCog`
- Settings: `Settings`
- Add/Join: `Plus`, `UserPlus`
- Data Input: `ClipboardList`, `FileText`
- Save: `Check`, `Save`
- Cancel/Close: `X`
- Edit: `Pencil`
- Delete: `Trash2`
- Search: `Search`
- Filter: `Filter`
- Sort: `ArrowUpDown`
- Navigation: `ChevronRight`, `ChevronDown`

---

## Animation & Interaction

### Principles

- **Subtle and fast**: Animations should feel responsive, not decorative
- **Consistent timing**: Use standard durations across similar interactions
- **Purpose-driven**: Animate to guide attention or indicate state changes

### Timing

- **Instant**: 0ms (immediate feedback like active states)
- **Fast**: 150ms (button hovers, simple transitions)
- **Default**: 200-250ms (dropdowns, modals, page transitions)
- **Slow**: 300-400ms (complex layout changes, only when necessary)

### Easing

- **Ease-out**: Most UI interactions (elements entering view)
- **Ease-in**: Elements exiting view
- **Ease-in-out**: Smooth transitions between states

### What to Animate

- Button hovers (background, border color)
- Dropdown opening (opacity + translateY)
- Modal appearance (opacity + scale)
- Page transitions (opacity + slight translateY)
- Tooltips (opacity + scale from pointer)
- Focus rings (appearance)

### What NOT to Animate

- Avoid: Spinning loaders (use progress bars or skeleton states)
- Avoid: Excessive bounce or spring effects
- Avoid: Gradient animations
- Avoid: Complex parallax or 3D transforms

---

## Accessibility Guidelines

### Color Contrast

- All text must meet **WCAG AA** standards (4.5:1 for normal text, 3:1 for large text)
- Red primary on dark backgrounds meets requirements
- Test all color combinations, especially muted text

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Visible focus states (red ring, 2px, 2px offset)
- Logical tab order
- Escape key closes modals

### Screen Readers

- Semantic HTML (nav, main, article, section, header)
- Proper heading hierarchy (h1 -> h2 -> h3)
- ARIA labels for icon-only buttons
- Form labels properly associated

### Touch Targets

- Minimum 44x44px for mobile touch targets
- Adequate spacing between interactive elements

---

## Implementation with shadcn/ui

### Theme Configuration

Update `components.json` to reflect the Iron Panthers design system:

```json
{
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral"
  }
}
```

### CSS Variables Setup

In `src/index.css`, define the custom color variables:

```css
@layer base {
  :root {
    /* Dark mode colors (default) */
    --background: 0 0% 7%; /* #121212 */
    --foreground: 0 0% 98%; /* #FAFAFA */

    --card: 0 0% 10%; /* #1A1A1A */
    --card-foreground: 0 0% 98%;

    --popover: 0 0% 13%; /* #212121 */
    --popover-foreground: 0 0% 98%;

    --primary: 0 84% 48%; /* Panther Red #DC2626 */
    --primary-foreground: 0 0% 98%;

    --secondary: 0 0% 13%; /* #212121 */
    --secondary-foreground: 0 0% 98%;

    --muted: 0 0% 13%;
    --muted-foreground: 0 0% 70%; /* #B3B3B3 */

    --accent: 0 0% 13%;
    --accent-foreground: 0 0% 98%;

    --destructive: 0 84% 60%; /* #EF4444 */
    --destructive-foreground: 0 0% 98%;

    --border: 0 0% 18%; /* #2E2E2E */
    --input: 0 0% 18%;
    --ring: 0 84% 48%; /* Focus ring - red */

    --radius: 0.375rem; /* 6px default radius */
  }
}

/* Additional semantic colors */
.text-secondary {
  color: hsl(0 0% 70%);
}

.text-muted {
  color: hsl(0 0% 50%);
}

.bg-surface {
  background-color: hsl(0 0% 10%);
}

.bg-surface-elevated {
  background-color: hsl(0 0% 13%);
}

.border-subtle {
  border-color: hsl(0 0% 14%);
}
```

### Component Installation Order

Install shadcn/ui components as needed:

```bash
# Core navigation and layout
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu

# Forms
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add radio-group
npx shadcn@latest add textarea

# Feedback
npx shadcn@latest add badge
npx shadcn@latest add tooltip
npx shadcn@latest add toast

# Data display
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add separator
```

### Customization Notes

After installing components, customize them:

- Adjust border-radius values to match design (6px for most, 8px for cards)
- Ensure button heights match spec (40px default)
- Verify color mappings use the correct CSS variables
- Update hover states to use defined color transitions

---

## Design Patterns

### Dashboard Welcome Section

- **Greeting**: "Welcome back, [Name]" or "Ready to scout, [Name]?"
- **Time-based**: Adjust based on time of day if desired
- **Accent**: Large heading (H1), red accent underline or red text for name

### Match Cards

- **Compact**: Show match number, time, teams involved
- **Status indicator**: Badge for upcoming/in-progress/completed
- **Action**: Single prominent "Join" button (red) or "View Results" (secondary)

### Settings Access

- **Icon button**: Ghost button with settings gear icon
- **Position**: Top-right of navigation
- **Dropdown**: User name, role, settings link, sign out

### Empty States

- **Icon**: Large, centered, muted color icon
- **Message**: Clear explanation of why empty + action to take
- **CTA**: Red button encouraging first action

### Loading States

- **Skeleton screens**: Use grey rectangles matching content layout
- **Progress bar**: Horizontal red bar for determinate progress
- **Spinner**: Minimal, rotating red ring (only for indeterminate short waits)

---

## Future Considerations

### Data Visualization

When implementing charts and graphs:

- Use red as the primary data color
- Use white/grey for secondary data or comparison
- Avoid gradients; use solid fills
- Ensure proper axis labels and legends
- Consider dark mode readability for all chart types

### Mobile Optimization

- Bottom navigation bar for key sections
- Simplified match cards (stacked layout)
- Larger touch targets (minimum 44px)
- Collapsible sections to manage vertical space
- Consider single-column layouts

### Offline Support

- Clear indicators when offline (yellow banner)
- Disable actions that require connectivity
- Local storage indicator/confirmation
- Sync status visible when connection restored

---

## Brand Voice & Messaging

### Writing Style

- **Clear & Direct**: "Join Match" not "Would you like to participate?"
- **Action-Oriented**: Use verbs in buttons and CTAs
- **Technical but Accessible**: Use FRC terminology but don't assume knowledge
- **Supportive**: Error messages should guide, not blame

### Example Microcopy

- **Success**: "Match data saved successfully"
- **Error**: "Unable to save. Check your connection and try again."
- **Empty State**: "No upcoming matches. Check back soon or contact your manager."
- **Confirmation**: "Are you sure you want to delete this data? This cannot be undone."

---

## Summary

The Iron Panthers scouting app design system centers on:

- **Efficiency**: Clean, uncluttered interfaces optimized for fast data collection
- **Identity**: Strong red brand color balanced with professional dark neutrals
- **Clarity**: High contrast, readable typography, and logical information hierarchy
- **Reliability**: Solid, trustworthy design that inspires confidence in data accuracy

This design system provides a foundation for building a modern, focused scouting tool that team members will want to use. Every design decision supports the core mission: collecting accurate competition data quickly and reliably during the intensity of FRC competitions.

---

**Next Steps**:

1. Configure tailwind colors and CSS variables
2. Install required shadcn/ui components
3. Build out component library with customizations
4. Implement dashboard layout as proof of concept
5. Test accessibility and color contrast
6. Gather team feedback and iterate
