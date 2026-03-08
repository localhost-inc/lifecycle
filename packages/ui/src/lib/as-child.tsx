import * as React from "react";

function getAsChildRenderElement(children: React.ReactNode): React.ReactElement {
  return React.Children.only(children) as React.ReactElement;
}

export { getAsChildRenderElement };
