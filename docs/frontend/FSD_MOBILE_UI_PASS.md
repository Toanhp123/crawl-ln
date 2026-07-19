# Frontend Mobile UI Pass

## Goal

Pause feature development and make the current web UI feel native enough on Android/Termux browser instead of looking like a desktop dashboard squeezed onto a phone.

## Changes

- Home page is now single-column first on mobile.
- Analyze form, stats, library, workspace and task list stack naturally.
- Header is shorter and less desktop-heavy on small screens.
- Hero title/description sizes are reduced for phone width.
- Cards use tighter padding/radius on mobile and restore larger spacing on tablet/desktop.
- Library cards use horizontal scrolling only when there are saved novels; empty state no longer creates awkward desktop-like width.
- Bottom tabs are shorter and safer for Android browser chrome.
- Inputs use `font-size: 16px` to prevent browser zoom on focus.
- Mobile spacing tokens are tighter while desktop tokens remain comfortable.

## Notes

This pass intentionally avoids new product features. The next UI pass should focus on chapter reader comfort: font controls, line-height, dark reader surface and long-content performance.
