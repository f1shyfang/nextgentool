import fs from "node:fs";
import path from "node:path";
import parse, { attributesToProps, domToReact } from "html-react-parser";
import Header from "./Header";

/**
 * Shared React renderer for the migrated page content. Static design markup is
 * kept separate from client behavior, so the reference's exact responsive
 * geometry survives without loading its original application or analytics.
 */
export default function ReferencePage({ record }) {
  const html = fs.readFileSync(
    path.join(process.cwd(), "content", `${record.key}.html`),
    "utf8",
  );
  const options = {
    replace(node) {
      if (!node.attribs) return;
      if (node.attribs["data-replica-header"]) {
        return (
          <div {...attributesToProps(node.attribs)}>
            <Header route={record.route} />
          </div>
        );
      }
      if (
        node.name === "ul" &&
        /replica-marquee/.test(node.attribs.class || "")
      ) {
        // Duplicate the strip in React for a seamless local CSS animation.
        const props = attributesToProps(node.attribs);
        // Local CSS sizes the duplicated strip instead of the captured viewport width.
        if (props.style) {
          delete props.style.width;
          delete props.style.maxWidth;
        }
        return (
          <ul {...props}>
            {domToReact(node.children, options)}
            {node.children
              .filter((child) => child.type !== "text")
              .map((child, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: The duplicated, immutable HTML strip has no state or reordering.
                <li key={`copy-${index}`} aria-hidden="true">
                  {domToReact(child.children || [], options)}
                </li>
              ))}
          </ul>
        );
      }
    },
  };
  return (
    <>
      <link rel="stylesheet" href={`/styles/${record.key}.css`} />
      <div id="main">{parse(html, options)}</div>
    </>
  );
}
