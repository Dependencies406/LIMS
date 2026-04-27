# PDF Template Editor - Alignment Tools

This module provides a visual PDF template editor with multi-selection and alignment tools.

## Components

### `PdfTemplateEditor`

Main editor component for designing PDF report templates.

**Features:**
- Multi-selection with Shift+Click
- Visual selection indicators (blue borders)
- Alignment toolbar (appears when 2+ elements selected)
- Undo/Redo support (Ctrl+Z / Ctrl+Y)
- Delete selected elements (Delete key)
- Real-time template updates

**Props:**
```typescript
interface PdfTemplateEditorProps {
  template: ReportTemplate;              // Current template state
  onTemplateChange: (template: ReportTemplate) => void;  // Callback when template changes
  scale?: number;                        // Canvas scale factor (default: 1)
}
```

**Usage:**
```tsx
import { PdfTemplateEditor } from './components/pdf';
import { ReportTemplate } from './types/pdfTemplate';

function MyTemplateEditor() {
  const [template, setTemplate] = useState<ReportTemplate>(initialTemplate);

  return (
    <PdfTemplateEditor
      template={template}
      onTemplateChange={setTemplate}
      scale={1.5}  // Optional: zoom in
    />
  );
}
```

### `AlignmentToolbar`

Floating toolbar that appears when multiple elements are selected.

**Features:**
- Horizontal alignment: Left, Center, Right
- Vertical alignment: Top, Middle, Bottom
- Distribution: Vertical, Horizontal (requires 3+ elements)

**Props:**
```typescript
interface AlignmentToolbarProps {
  selectedCount: number;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignMiddle: () => void;
  onAlignBottom: () => void;
  onDistributeVertically: () => void;
  onDistributeHorizontally: () => void;
}
```

## Alignment Functions

The `pdfAlignmentHelpers.ts` module provides coordinate calculation functions:

- `alignLeft(elements)` - Aligns all elements to the leftmost X coordinate
- `alignCenterHorizontal(elements)` - Centers elements horizontally
- `alignRight(elements)` - Aligns all elements to the rightmost edge
- `alignTop(elements)` - Aligns all elements to the topmost Y coordinate
- `alignMiddleVertical(elements)` - Centers elements vertically
- `alignBottom(elements)` - Aligns all elements to the bottommost edge
- `distributeVertically(elements)` - Evenly distributes elements vertically (requires 3+)
- `distributeHorizontally(elements)` - Evenly distributes elements horizontally (requires 3+)

## Multi-Selection

**Single Selection:**
- Click an element to select it (deselects others)

**Multi-Selection:**
- Shift+Click to add/remove element from selection
- Click canvas background to clear selection

**Visual Indicators:**
- Selected elements show a blue border (`#3b82f6`)
- Selected elements have a light blue background overlay

## Keyboard Shortcuts

- `Ctrl+Z` - Undo
- `Ctrl+Y` or `Ctrl+Shift+Z` - Redo
- `Delete` - Delete selected elements

## History/Undo Support

All alignment operations and deletions are automatically added to the history stack. Each operation creates a single history entry, so undoing an alignment operation restores all elements to their previous positions.

## Element Positioning

The editor handles different element types with different positioning schemes:

- **Elements with `position` property**: Uses `position.x` and `position.y` (most elements)
- **RectangleElement**: Uses direct `x` and `y` properties
- **LineElement**: Uses `startX`, `startY`, `endX`, `endY` coordinates

The alignment functions automatically detect and handle these different positioning schemes.

## Example: Using Alignment Tools

```tsx
import { PdfTemplateEditor } from './components/pdf';
import { ReportTemplate } from './types/pdfTemplate';

function TemplateDesigner() {
  const [template, setTemplate] = useState<ReportTemplate>({
    id: 'template-1',
    name: 'My Template',
    version: '1.0.0',
    pageSettings: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      showPageNumbers: false,
    },
    sections: [
      {
        id: 'header',
        type: 'header',
        elements: [
          {
            id: 'text-1',
            type: 'static-text',
            content: 'Title',
            position: { x: 50, y: 20 },
            styling: { fontSize: 16, fontWeight: 'bold' },
          },
          {
            id: 'text-2',
            type: 'static-text',
            content: 'Subtitle',
            position: { x: 50, y: 40 },
            styling: { fontSize: 12 },
          },
        ],
      },
    ],
  });

  return (
    <div className="h-screen">
      <PdfTemplateEditor
        template={template}
        onTemplateChange={setTemplate}
      />
    </div>
  );
}
```

## Notes

- All coordinates are in millimeters (mm)
- The editor converts mm to pixels for display (1mm ≈ 3.78px at 96 DPI)
- The scale prop allows zooming in/out
- Selection state is managed internally by the component
- Template updates trigger the `onTemplateChange` callback immediately





