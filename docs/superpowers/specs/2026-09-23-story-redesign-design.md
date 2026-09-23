# Story-driven redesign — design spec (2026-09-23)

## What was asked (user's words, condensed)

1. The page should tell a story on mobile, tablet and desktop.
2. On first load, papers flutter in the air and then come together to form the layout.
3. Layered imagery with depth (z-index), without clutter, with ample whitespace and a structure that reflects the brand.
4. "03 · Zusammenarbeit": seamless transitions with bold, innovative UI/UX animation.
5. The page looks monotonous; enhance the whole design without a chaotic mix of colours.
6. Modern, digital-forward, professional; a serious commitment to quality.

Standing preferences from earlier feedback: no cursor effects, minimal UI chrome, fast access, short one-shot animations, reduced-motion respected.

## Assumptions (made autonomously, easy to revise)

- The narrative is **"paper → system"**: scattered documents (the client's requirements and evidence) become an ordered system and finally a certificate. Every visual motif serves that line.
- The existing hero video stays (the owner asked for it to be sped up); it becomes the front layer of a layered document stack.
- No photography is invented. Imagery is built from paper-like cards and the logo colours.
- Palette stays in the brand family: navy, blue, a bright blue for accents on dark, plus three neutrals (white, cool mist, warm paper). The per-norm tints in the configurator (blue, green, amber) remain because they carry meaning.
- The intro plays on every load of `/` (owner decision, 2026-09-23); a reload starts at the top. It never plays with reduced motion. Any click, key, wheel, touch or scroll skips it.
- Copy stays as approved; new microcopy only repeats facts already on the site (over two decades of experience, the listed qualifications, the free first consultation).

## Surfaces and rhythm

| Section | Surface |
|---|---|
| Header + hero | white |
| 01 Audit & Zertifizierung | cool mist |
| 02 SCC-Schulung & Zertifizierung | warm paper |
| 03 Zusammenarbeit | deep navy, full-bleed, pinned |
| 04 Persönliche Begleitung | warm paper |
| Kontakt | white with a navy call-to-action panel |
| Footer | white |

## Components

- **Header**: sticky; hides while scrolling down, returns on scroll up or keyboard focus; solid white background after the hero; active-section indicator for the four nav links.
- **Hero**: eyebrow with the three norms, the existing headline, lead and two actions, a three-item trust row, and a layered visual (two document sheets behind the video card and a round seal in front). Layers drift at different speeds while scrolling (desktop and tablet only).
- **Paper intro** (`PaperIntro`): an inline gate in `index.html` adds `html.intro` before first paint when the rules above allow it. Hero parts marked `data-paper` stay hidden. Paper sheets start scattered above the viewport, flutter (sway, tumble), then fly onto the exact rectangles of those parts and fade as each part appears. Parts land in reading order, so the headline is visible first. A fallback timer removes the gate if JavaScript fails.
- **01 Configurator**: unchanged behaviour; two paper sheets peek out behind the card; mist surface.
- **02 SCC-Schulung & Zertifizierung** (replaced the ASZ training journey on owner request): same timeline, four stage cards for Dok. 017 / Dok. 018, self-drawing icons, ends in "Angebot anfordern" and "Termin vereinbaren".
- **03 Zusammenarbeit** (`Story`, replaces `Process`): a 420svh section with a sticky 100svh stage.
  - *Entry*: while the section rises into view, a navy circle blooms from the upper centre until it covers the screen.
  - *Chapters*, driven by scroll progress: nine document cards move through three formations. **Verstehen**: scattered, with an analysis ring drifting over them. **Ordnen**: sorted into three columns labelled Prozesse, Nachweise and Maßnahmen. **Umsetzen**: collapsed into one stack topped by a certificate whose check mark draws itself.
  - Text panels change with a masked slide. A huge outlined chapter number rolls, a light scan line sweeps the stage on each chapter change, and a three-part rail fills with progress.
  - *Exit*: the navy stage scales slightly and rounds its corners, lifting away like a card onto the warm paper of the next section.
  - Without JavaScript, or with reduced motion, it renders as a static navy section with the three steps.
- **04 Expertise**: navy disc with a concentric orbit, a round "5+ Jahre Erfahrung" badge on its edge and a paper quote card, with slight depth on scroll; qualifications as four icon tiles.
- **Kontakt**: navy panel with a paper "letter" breaking out of its top edge, then four contact tiles and the network links.

## Motion rules

One vocabulary (Kicker, Wipe, Rise, Stagger, Depth). All reveals run once and are driven by the shared geometry watcher in `src/reveal.ts`, which avoids the IntersectionObserver edge cases found on 2026-09-17. Only transforms, opacity and clip-path are animated, except the intro sheets' width and height (fixed elements, under 1.5 s). With `prefers-reduced-motion: reduce` there is no intro, no pinning and no parallax.

## Constraints

No new dependencies. SEO prerendering keeps every text in the HTML, including all three story chapters. The mail endpoint, configurator logic and audit pages keep their behaviour. There are no horizontal scrollbars from 320px to 1920px.

## Build order

1. Tokens and surfaces (`src/theme.css`); dead CSS removed (old training catalogue, old process, expertise and contact rules).
2. Header.
3. Hero and layered visual, with `data-paper` targets.
4. Paper intro: gate script, component, styles.
5. Story section.
6. Configurator, training, expertise and contact refresh.
7. Verification: `tsc`, lint, build and prerender. Screenshots at 390, 768, 1024 and 1440 widths; intro frames and skip; the three story chapters; reduced-motion emulation; configurator flow against the PHP mock; console clean.

## Changes during implementation

- The scrolled header is solid white instead of glass: the logo removes its white background with a multiply blend, which fails over a translucent layer.
- Scroll-linked styles read from a JavaScript copy of the scroll progress (`useScrollCopy`), because framer-motion's native ViewTimeline acceleration produced wrong values for the pinned story.
- Reveal primitives always start in their hidden variant (like the server render) and reveal immediately with reduced motion; the earlier `initial={false}` pattern left prerendered content invisible for those visitors.
- On tablets and phones the action-plan sheet in the hero is wider and shown further below the video, so its title and chips stay readable.
- Owner review (2026-09-23): intro on every page load, no grid backgrounds anywhere, experience shown as "5+ Jahre Erfahrung", experience composition rebuilt (concentric orbit, typographic quote mark, round badge).
- Owner request (2026-09-23): the training section now covers SCC Dok. 017 and Dok. 018 with verified exam facts and ends in quote and appointment buttons that open preset enquiry dialogs.
