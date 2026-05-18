# LocalConvert

LocalConvert is a private, client-side image converter built with React and Vite. It converts images directly in the browser, so files are not uploaded to a server.

## Features

- Convert batches to JPG, PNG, or WEBP
- Drag and drop, file picker, and clipboard paste support
- Source previews with per-file status and output size
- ZIP download for completed batches
- Optional resize bounds with quick presets
- JPG quality control and background fill color
- Filename prefixing for exported files
- Browser-side support for common image sources including JPG, PNG, WEBP, SVG, BMP, GIF, and AVIF when supported by the browser

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Privacy

All conversion work happens inside your browser tab. The app does not upload your images.
