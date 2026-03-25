export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

const MIRROR_STYLE_PROPS = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize",
  "whiteSpace",
  "wordWrap",
  "wordBreak",
] as const;

/**
 * Get the pixel coordinates of a character position inside a textarea using the
 * mirror-div technique. Returns coordinates relative to the textarea element.
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoordinates {
  const div = document.createElement("div");
  const style = div.style;
  const computed = getComputedStyle(textarea);

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflow = "hidden";

  for (const prop of MIRROR_STYLE_PROPS) {
    style.setProperty(prop, computed.getPropertyValue(prop));
  }

  div.textContent = textarea.value.substring(0, position);

  const marker = document.createElement("span");
  // Use a zero-width space so the span has measurable height.
  marker.textContent = "\u200b";
  div.appendChild(marker);

  document.body.appendChild(div);

  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  const height = marker.offsetHeight;

  document.body.removeChild(div);

  return { top, left, height };
}
