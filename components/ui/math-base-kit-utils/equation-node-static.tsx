import "katex/dist/katex.min.css";

import { getEquationHtml } from "@platejs/math";
import { type TEquationElement } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { cn } from "@/lib/utils";

export function EquationElementStatic(props: SlateElementProps<TEquationElement>) {
  const html = getEquationHtml({
    element: props.element,
    options: { displayMode: true, throwOnError: false, trust: false },
  });

  return (
    <SlateElement {...props} className={cn("relative max-w-full overflow-x-auto overflow-y-hidden", props.className)}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {props.children}
    </SlateElement>
  );
}

export function InlineEquationElementStatic(props: SlateElementProps<TEquationElement>) {
  const html = getEquationHtml({
    element: props.element,
    options: { displayMode: false, throwOnError: false, trust: false },
  });

  return (
    <SlateElement {...props} as="span" className={cn("align-baseline", props.className)}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {props.children}
    </SlateElement>
  );
}
