# Auto-Reply image fonts

Bundled so Thai shaping and emoji work on deployments without system fonts.

- `Sarabun-Regular.ttf`: https://github.com/google/fonts/tree/main/ofl/sarabun (SIL OFL 1.1, see `Sarabun-OFL.txt`).
- `NotoColorEmoji.ttf`: https://github.com/googlefonts/noto-emoji/tree/main/fonts (SIL OFL 1.1, see `NotoColorEmoji-LICENSE.txt`).

`next.config.ts` explicitly includes these files in the relevant server bundles.
