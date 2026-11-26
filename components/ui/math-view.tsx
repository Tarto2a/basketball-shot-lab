import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type Value } from "platejs";
import { createStaticEditor, PlateStatic } from "platejs/static";

import { BaseMathKit } from "@/components/ui/math-base-kit";

type MathViewProps = { expressions: readonly string[]; inline?: boolean };

export function MathView({ expressions, inline = false }: MathViewProps) {
  const [editor] = useState(() => createStaticEditor({ plugins: BaseMathKit }));
  const value: Value = expressions.map(texExpression =>
    inline
      ? { type: "p", children: [
          { text: "" },
          { type: "inline_equation", texExpression, children: [{ text: "" }] },
          { text: "" },
        ] }
      : { type: "equation", texExpression, children: [{ text: "" }] },
  );

  return <PlateStatic editor={editor} value={value} className="shot-math max-w-full" />;
}

const mounts = new WeakMap<HTMLElement, { root: Root; source: string }>();

export function renderMath(id: string, source: string | readonly string[], inline = false) {
  const target = document.getElementById(id);
  if (!target) throw new Error("Missing equation container: " + id);

  const expressions = typeof source === "string" ? [source] : source;
  const key = JSON.stringify([inline, expressions]);
  let mount = mounts.get(target);
  if (mount?.source === key) return;
  if (!mount) {
    mount = { root: createRoot(target), source: "" };
    mounts.set(target, mount);
  }
  mount.source = key;
  mount.root.render(<MathView expressions={expressions} inline={inline} />);
}
