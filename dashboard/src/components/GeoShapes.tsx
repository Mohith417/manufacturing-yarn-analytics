export type GeoGlyphKind = "circle" | "triangle" | "square" | "ring";

/** One flat geometric mark, used on feature cards. */
export function GeoGlyph({ kind }: { kind: GeoGlyphKind }) {
  return <span className={`geo-glyph geo-glyph--${kind}`} aria-hidden="true" />;
}

/**
 * Decorative composition behind a panel: a solid disc, a semicircle, a
 * triangle, a ring, a dot grid and a bar. Purely ornamental, so it is hidden
 * from assistive tech and never carries meaning on its own.
 */
export default function GeoShapes({
  variant = "hero",
}: {
  variant?: "hero" | "band" | "cta";
}) {
  return (
    <div className={`geo-art geo-art--${variant}`} aria-hidden="true">
      <span className="geo-art__blob" />
      <span className="geo-art__half" />
      <span className="geo-art__tri" />
      <span className="geo-art__ring" />
      <span className="geo-art__dots" />
      <span className="geo-art__bar" />
    </div>
  );
}
