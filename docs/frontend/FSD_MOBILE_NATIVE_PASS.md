# FSD Mobile Native Pass

## Problem

The app looked like a desktop dashboard scaled down on Android because `index.html` did not define a mobile viewport. Mobile browsers used a wide layout viewport, so Tailwind `md:` breakpoints were activated and the whole UI appeared tiny.

## Fix

- Add `meta viewport` with `width=device-width, initial-scale=1, viewport-fit=cover`.
- Increase mobile tokens for page padding, cards, inputs, buttons and bottom navigation.
- Make mobile text sizes readable without relying on browser zoom.
- Keep desktop breakpoints for larger screens.

## Rule

Any mobile UI regression check must first verify the viewport meta tag before changing component layout.
