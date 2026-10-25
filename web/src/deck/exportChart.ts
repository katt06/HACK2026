// Download a chart for slides. The SVG already carries hex colors and its own background, so the file
// renders the same anywhere. PNG is drawn at 2× for crisp projection. No libraries.
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serialize(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[data-export-hide]").forEach((el) => el.remove()); // hover crosshair etc.
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  save(new Blob([serialize(svg)], { type: "image/svg+xml" }), `${filename}.svg`);
}

export async function downloadPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const { width, height } = svg.viewBox.baseVal;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialize(svg))}`;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: width * scale, height: height * scale });
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => blob && save(blob, `${filename}.png`), "image/png");
}
