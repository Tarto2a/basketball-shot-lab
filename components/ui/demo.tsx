import { type Value } from "platejs";
import { createStaticEditor, PlateStatic } from "platejs/static";

import { BaseMathKit } from "@/components/ui/math-base-kit";

const value: Value = [
  {
    type: "p",
    children: [
      { text: "Mass–energy equivalence: " },
      {
        type: "inline_equation",
        texExpression: "E = mc^2",
        children: [{ text: "" }],
      },
      { text: "." },
    ],
  },
  {
    type: "equation",
    texExpression: "\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)",
    children: [{ text: "" }],
  },
];

export default function MathBaseKitDemo() {
  const editor = createStaticEditor({ plugins: BaseMathKit, value });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PlateStatic editor={editor} />
    </div>
  );
}
