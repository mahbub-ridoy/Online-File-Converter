# LocalConvert

LocalConvert is a private, client-side image converter built with React and Vite. It converts images directly in the browser, so files are not uploaded to a server.

## Features

- Convert batches to JPG, PNG, or WEBP
- Drag and drop, file picker, and clipboard paste support
- Source previews with per-file status and output size
- ZIP download for completed batches
- Aurora and midnight themes with an animated gradient mesh UI
- Cleaner step-based converter layout with upload, output choice, conversion, and grouped option cards
- Optional fit, exact-crop, padded-canvas, or stretch resize modes with quick presets for 4K, HD, square, story, and avatar exports
- JPG quality presets, background fill color, and output-size savings
- Image finish filters, manual brightness, contrast, saturation, padding, rotation, horizontal flip, and vertical flip
- Filename prefixing and suffixing for exported files
- Optional auto-convert on add, reconvert completed files, and include originals in ZIP
- Browser-side support for common image sources including JPG, PNG, WEBP, SVG, BMP, GIF, and AVIF when supported by the browser

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Privacy

All conversion work happens inside your browser tab. The app does not upload your images.
