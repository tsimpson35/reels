# JoinLinks Screens (Figma plugin)

Rebuilds every JoinLinks 3.0 prototype screen as native Figma layers, then lays out each change with Matt's old screen next to the new one.

## Use it
1. Figma desktop: Plugins → Development → Import plugin from manifest → pick `manifest.json` in this folder.
2. Open the page you want, then Plugins → Development → JoinLinks Screens → Build the 3.0 designs.

It loads the screens from https://joinlinks-hub.vercel.app/designs/figma/.

## Refresh the screens after the prototype changes
`extract/run.js` opens each screen of `designs/v3.html` (served locally on :8899) in headless Chrome, reads every box, text run, image and icon with `extract/extractor.js`, and writes one JSON per screen. Copy those into `designs/figma/` and push. `extract/shots.json` lists the screen states; `names.json` their labels.
