/**
 * PDF Alignment Helper Functions
 * Coordinate math for aligning multiple PDF template elements
 */

import { ReportElement, BaseElement } from '../types/pdfTemplate';

/**
 * Get the bounding box (x, y, width, height) of an element
 * Handles different element types with different position/size properties
 */
export function getElementBounds(element: ReportElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  // Elements with direct x, y, width, height (RectangleElement)
  if ('x' in element && 'y' in element && 'width' in element && 'height' in element) {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
  }

  // Elements with position property (most elements)
  if (element.position) {
    const x = element.position.x;
    const y = element.position.y;
    
    // Get dimensions if available
    let width = 0;
    let height = 0;
    
    if ('dimensions' in element && element.dimensions) {
      width = element.dimensions.width || 0;
      height = element.dimensions.height || 0;
    }
    
    // Line elements have start/end coordinates
    if ('startX' in element && 'startY' in element && 'endX' in element && 'endY' in element) {
      const minX = Math.min(element.startX, element.endX);
      const minY = Math.min(element.startY, element.endY);
      const maxX = Math.max(element.startX, element.endX);
      const maxY = Math.max(element.startY, element.endY);
      
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    
    return { x, y, width, height };
  }

  // Fallback: no position info
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Set the position of an element
 * Handles different element types with different position properties
 */
export function setElementPosition(
  element: ReportElement,
  x: number,
  y: number
): ReportElement {
  // Elements with direct x, y properties (RectangleElement)
  if ('x' in element && 'y' in element) {
    return {
      ...element,
      x,
      y,
    };
  }

  // Elements with position property
  if (element.position) {
    return {
      ...element,
      position: {
        ...element.position,
        x,
        y,
      },
    };
  }

  // Elements without position - add it
  return {
    ...element,
    position: { x, y },
  };
}

/**
 * Get the bounding box of multiple selected elements
 */
export function getSelectionBounds(elements: ReportElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  if (elements.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  const bounds = elements.map(getElementBounds);
  
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.width));
  const maxY = Math.max(...bounds.map(b => b.y + b.height));

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX,
    centerY,
  };
}

/**
 * Align Left: Set all elements' X to the leftmost element's X
 */
export function alignLeft(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const bounds = elements.map(getElementBounds);
  const minX = Math.min(...bounds.map(b => b.x));

  return elements.map(element => setElementPosition(element, minX, getElementBounds(element).y));
}

/**
 * Align Center (Horizontal): Align all elements to the center of the selection bounding box
 */
export function alignCenterHorizontal(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const selectionBounds = getSelectionBounds(elements);
  const centerX = selectionBounds.centerX;

  return elements.map(element => {
    const bounds = getElementBounds(element);
    const newX = centerX - bounds.width / 2;
    return setElementPosition(element, newX, bounds.y);
  });
}

/**
 * Align Right: Set all elements' X to align with the rightmost element's right edge
 */
export function alignRight(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const bounds = elements.map(getElementBounds);
  const maxRight = Math.max(...bounds.map(b => b.x + b.width));

  return elements.map(element => {
    const bounds = getElementBounds(element);
    const newX = maxRight - bounds.width;
    return setElementPosition(element, newX, bounds.y);
  });
}

/**
 * Align Top: Set all elements' Y to the topmost element's Y
 */
export function alignTop(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const bounds = elements.map(getElementBounds);
  const minY = Math.min(...bounds.map(b => b.y));

  return elements.map(element => {
    const bounds = getElementBounds(element);
    return setElementPosition(element, bounds.x, minY);
  });
}

/**
 * Align Middle (Vertical): Align all elements to the vertical center of the selection bounding box
 */
export function alignMiddleVertical(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const selectionBounds = getSelectionBounds(elements);
  const centerY = selectionBounds.centerY;

  return elements.map(element => {
    const bounds = getElementBounds(element);
    const newY = centerY - bounds.height / 2;
    return setElementPosition(element, bounds.x, newY);
  });
}

/**
 * Align Bottom: Set all elements' Y to align with the bottommost element's bottom edge
 */
export function alignBottom(elements: ReportElement[]): ReportElement[] {
  if (elements.length === 0) return elements;

  const bounds = elements.map(getElementBounds);
  const maxBottom = Math.max(...bounds.map(b => b.y + b.height));

  return elements.map(element => {
    const bounds = getElementBounds(element);
    const newY = maxBottom - bounds.height;
    return setElementPosition(element, bounds.x, newY);
  });
}

/**
 * Distribute Vertically: Evenly distribute elements vertically between first and last
 */
export function distributeVertically(elements: ReportElement[]): ReportElement[] {
  if (elements.length <= 2) return elements; // Need at least 3 elements to distribute

  // Sort elements by Y position
  const sorted = [...elements].sort((a, b) => {
    const boundsA = getElementBounds(a);
    const boundsB = getElementBounds(b);
    return boundsA.y - boundsB.y;
  });

  const firstBounds = getElementBounds(sorted[0]);
  const lastBounds = getElementBounds(sorted[sorted.length - 1]);

  const firstY = firstBounds.y;
  const lastY = lastBounds.y + lastBounds.height;
  
  // Calculate total height of all elements (excluding first and last)
  const middleHeights = sorted.slice(1, -1).reduce((sum, el) => {
    return sum + getElementBounds(el).height;
  }, 0);

  // Calculate available space for distribution
  const availableSpace = lastY - firstY - firstBounds.height - getElementBounds(sorted[sorted.length - 1]).height;
  const gapSize = availableSpace / (sorted.length - 1);

  // Distribute elements
  const result = [...elements];
  let currentY = firstY + firstBounds.height + gapSize;

  for (let i = 1; i < sorted.length - 1; i++) {
    const element = sorted[i];
    const bounds = getElementBounds(element);
    const index = elements.indexOf(element);
    
    result[index] = setElementPosition(element, bounds.x, currentY);
    currentY += bounds.height + gapSize;
  }

  return result;
}

/**
 * Distribute Horizontally: Evenly distribute elements horizontally between leftmost and rightmost
 */
export function distributeHorizontally(elements: ReportElement[]): ReportElement[] {
  if (elements.length <= 2) return elements; // Need at least 3 elements to distribute

  // Sort elements by X position
  const sorted = [...elements].sort((a, b) => {
    const boundsA = getElementBounds(a);
    const boundsB = getElementBounds(b);
    return boundsA.x - boundsB.x;
  });

  const firstBounds = getElementBounds(sorted[0]);
  const lastBounds = getElementBounds(sorted[sorted.length - 1]);

  const firstX = firstBounds.x;
  const lastX = lastBounds.x + lastBounds.width;
  
  // Calculate total width of all elements (excluding first and last)
  const middleWidths = sorted.slice(1, -1).reduce((sum, el) => {
    return sum + getElementBounds(el).width;
  }, 0);

  // Calculate available space for distribution
  const availableSpace = lastX - firstX - firstBounds.width - getElementBounds(sorted[sorted.length - 1]).width;
  const gapSize = availableSpace / (sorted.length - 1);

  // Distribute elements
  const result = [...elements];
  let currentX = firstX + firstBounds.width + gapSize;

  for (let i = 1; i < sorted.length - 1; i++) {
    const element = sorted[i];
    const bounds = getElementBounds(element);
    const index = elements.indexOf(element);
    
    result[index] = setElementPosition(element, currentX, bounds.y);
    currentX += bounds.width + gapSize;
  }

  return result;
}





