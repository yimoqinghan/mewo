# Design QA

source visual truth path: `/var/folders/s9/wn9_zbns6pjgdfwnvjv9sxmh0000gn/T/codex-clipboard-6f7b509a-02a9-4944-94cb-0a881fc10c18.png`
implementation screenshot path: WeChat Developer Tools live preview for `pages/index/index` (captured through CUA on 2026-11-09; the CUA screenshot was not persisted as a workspace file)
hero character reference path: `/var/folders/s9/wn9_zbns6pjgdfwnvjv9sxmh0000gn/T/codex-clipboard-d94a3f1f-52fa-44ea-a446-6008d3d56b0a.png`
generated turnaround reference path: `/Users/niuxingxing/Desktop/MeWo/art/yanmiao-cat-turnaround.png`
touch turnaround reference path: `/Users/niuxingxing/Desktop/MeWo/art/yanmiao-cat-touch-turnaround.png`
menu turnaround reference path: `/Users/niuxingxing/Desktop/MeWo/art/yanmiao-cat-menu-turnaround.png`
viewport: WeChat Developer Tools, iPhone 12/13 (Pro) simulator, 88%
source pixels: 1170 x 780, three reference states in one image
implementation pixels: simulator preview captured at the same mobile route; device chrome excluded from the app-owned comparison
CSS size and density: WXSS `rpx`, simulator device scale handled by WeChat Developer Tools
state: home, touch feedback, and menu states checked

## Full-view comparison evidence

- The implementation uses independent WXML/WXSS layers for sky, cloud assets, sun, lower color-field asset, logo, controls, character states, menu board, and photo preview.
- The primary home state preserves the reference hierarchy: blue sky, left-aligned brand/slogan, large black cat hero, yellow camera CTA, and pink/yellow lower color fields.
- The current homepage deliberately renders the approved flat character layers first; the Blender GLB and Three.js path remain retained for the later 3D phase. This keeps the visual comparison focused on the supplied design states instead of the still-unapproved procedural model.
- The touch state swaps to a separate cat asset and adds an editable speech bubble, touch hand, and touch ring.
- The menu state uses a separate chest-up cat asset/GLB and five independently clickable menu rows.

## Focused region comparison evidence

- Header: logo, status area, voice/message circular controls, and notification dot are separate elements; the voice and bell buttons now use dedicated transparent image layers.
- Hero: `cat-home.png`, `cat-blink.png`, `cat-touch.png`, and `cat-menu.png` are standalone transparent raster layers rather than a page screenshot.
- Bottom CTA: album, camera, chat, drawer trigger, and camera hint are separate controls; album and chat now use dedicated image layers instead of glyph placeholders.
- Menu: five rows, copy, arrow controls, panel, and `cat-menu.png` are independently editable; all five menu illustrations are separate transparent assets.

## Fidelity surfaces

- Fonts and typography: system Chinese sans-serif with bold display hierarchy; slogan uses rotated, outlined text to match the reference treatment.
- Spacing and layout rhythm: mobile-first WXSS uses rpx, rounded controls, centered camera CTA, and layered lower color fields.
- Colors and visual tokens: sky blue, cream yellow, pink, lavender, white, and deep plum are mapped directly in page styles.
- Image quality and asset fidelity: logo, camera icon, cloud, lower color fields, and character states are local assets; all cat poses are separate RGBA PNGs; no full reference screenshot is used as a background.
- Motion fidelity: the flat homepage now uses a restrained breathing scale only in the default state; touch feedback is a one-shot micro-reaction with a smooth crossfade, speech-bubble entrance, and hand overlay. Continuous left/right rotation and repeated vertical shaking were removed.
- Copy and content: brand copy and menu labels follow the provided design reference and the product name remains “言喵”.

## Interaction evidence

- Clicked the cat in the simulator: touch feedback state appeared with `喵～好舒服！♡`, including the hand overlay.
- Opened the menu state: the chest-up cat and five independently clickable rows appeared; the existing handle returns to home.
- Verified the home state has a periodic blink frame and a subtle idle breathing animation; tapping the cat remains in touch state until the user taps the cat again or chooses another action.
- Recompiled after the WXSS selector cleanup: no compilation error from the current implementation; remaining console warnings are existing simulator/platform notices.

## Findings

- The three Blender GLBs remain in the project with one skin, six embedded material images, and named animation clips, but the current homepage intentionally uses the separate flat PNG layers first so visual fidelity can be corrected before 3D is re-enabled.
- The GLB visual match is still not a pass for the requested 100% standard: the current geometry remains a first procedural pass and its head expression, fur volume, accessory proportions, and rear continuation still require art-direction calibration against approved turnarounds.

## Comparison history

- Iteration 1: the page rendered the earlier procedural GLB; P1 findings were incorrect head/eye proportions, simplified fur volume, and missing design-level accessory fidelity.
- Iteration 2: rebuilt and re-exported all three GLBs with embedded per-material maps, UVs, a skin, and named animation clips; the page still renders the same underlying procedural silhouette, so the P1 visual-fidelity finding remains open. The implementation screenshot was re-captured in WeChat Developer Tools after export and showed the updated GLB as the primary layer.

## Iteration notes

- P0.5 blocker: approve `art/yanmiao-cat-turnaround.png`, `art/yanmiao-cat-touch-turnaround.png`, and `art/yanmiao-cat-menu-turnaround.png`, or provide corrected side/back renders. Without approved turnarounds, “100% 360° restoration” is not objectively verifiable from the supplied front images alone.
- P3 follow-up: the current prototype still uses local glyph-based marks for a few secondary utility icons; replacing those with final production icon assets can be done when the brand icon set is available.
- The camera and album controls call the existing WeChat `wx.chooseImage` flow; upload and AI generation remain intentionally outside this prototype scope.
- Iteration 3: recalibrated the sky/sun/cloud positions, raised the lower pink/yellow/lilac wave layer, tightened the menu board spacing, and changed the irregular menu row silhouettes to better match the reference. The current flat preview package successfully generated at 1.8 MB.
- Iteration 4: separated the home/touch/menu vertical baselines, moved the menu cat and entry board upward, enlarged and raised the touch-state character, and replaced the default sway/touch bob with restrained breathing and a one-shot reaction. The preview package generated successfully, but the newly launched DevTools window could not be captured because desktop automation still resolved a different Electron process; visual approval remains blocked until a fresh simulator screenshot is compared.
- Iteration 5: removed the default mini-program navigation bar from the homepage with page-level `navigationStyle: custom`, removed the duplicate hand-drawn `9:41`/status glyph layer, and preserved the safe-area spacer so the design's single native status bar remains aligned. The preview package regenerated successfully at 1.8 MB; screenshot comparison is still pending because the DevTools simulator capture is not persisted by the current desktop automation mapping.

## Implementation Checklist

- [x] Separate visual layers rather than a flattened screenshot.
- [x] Home, touch, and menu states implemented.
- [x] Tap, swipe, menu, photo preview, and create-page navigation wired.
- [x] Static JavaScript, JSON, and asset-reference checks passed.
- [x] Verified the flat homepage preview package after recompilation; the package is 1.8 MB and within the 2 MB preview limit.

final result: blocked — the homepage still needs a fresh simulator screenshot comparison at the target viewport, and the later 3D visual fidelity is not approved as a 100% match yet.
