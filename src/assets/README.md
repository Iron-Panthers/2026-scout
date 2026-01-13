# Assets Folder

This folder contains static assets used in the application.

## Field Image

To display the field image on the Scouting page:

1. Add your field image to this folder with the name `field.png` (or `field.jpg`)
2. Update the Scouting.tsx component to import and use the image:

```tsx
import fieldImage from "@/assets/field.png";

// Then in the component, replace the placeholder with:
<img 
  src={fieldImage} 
  alt="FRC Field" 
  className="w-full h-full object-contain"
/>
```

## Supported Formats

- PNG
- JPG/JPEG
- SVG
- WebP
