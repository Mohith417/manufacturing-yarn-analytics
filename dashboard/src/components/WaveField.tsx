import { useEffect, useRef } from "react";
import "../styles-wave.css";

type Variant = "hero" | "ambient";

const RING_COUNT: Record<Variant, number> = { hero: 116, ambient: 68 };
const PER_RING: Record<Variant, number> = { hero: 260, ambient: 150 };
const RING_STEP = 0.27;

/**
 * A field of glowing points arranged in concentric rings. A vertex shader
 * displaces every point with a sum of radial sine waves, so rings ripple
 * outward from the centre the way the reference animation does.
 *
 * Everything here is drawn from scratch: only the geometry and two shader
 * strings are ours, no asset is copied. The module is loaded lazily by
 * `import("three")`, so the 3D library stays out of the initial bundle.
 *
 * Safety:
 *  - devicePixelRatio is capped at 2;
 *  - the loop stops when the tab is hidden or the canvas leaves the viewport;
 *  - prefers-reduced-motion renders one still frame and never animates;
 *  - a machine without WebGL simply keeps the CSS gradient underneath;
 *  - every GPU resource is disposed when the component unmounts.
 */
export default function WaveField({ variant = "hero" }: { variant?: Variant }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let frame = 0;
    let visible = true;
    let onScreen = true;
    let cleanup: (() => void) | null = null;

    const reduceMotion = (() => {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        return false;
      }
    })();

    const start = async () => {
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return;
      }
      if (disposed || !hostRef.current) {
        return;
      }

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
      } catch {
        // No WebGL: the gradient behind the canvas is the fallback.
        return;
      }

      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      renderer.setClearAlpha(0);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        variant === "hero" ? 40 : 46,
        width / height,
        0.1,
        220,
      );

      // ------------------------------------------------------------ ripples --
      const ringCount = RING_COUNT[variant];
      const perRing = PER_RING[variant];
      const total = ringCount * perRing;
      const positions = new Float32Array(total * 3);
      const rings = new Float32Array(total);
      const angles = new Float32Array(total);
      const seeds = new Float32Array(total);
      const random = (() => {
        // Deterministic noise so a reload draws the identical field.
        let state = 20260101;
        return () => {
          state = (state * 1664525 + 1013904223) % 4294967296;
          return state / 4294967296;
        };
      })();

      let index = 0;
      for (let ring = 1; ring <= ringCount; ring += 1) {
        const radius = ring * RING_STEP;
        // Stagger each ring so the dots never line up into spokes.
        const offset = random() * Math.PI * 2;
        for (let step = 0; step < perRing; step += 1) {
          const angle = (step / perRing) * Math.PI * 2 + offset;
          rings[index] = radius;
          angles[index] = angle;
          seeds[index] = random();
          positions[index * 3] = Math.cos(angle) * radius;
          positions[index * 3 + 1] = 0;
          positions[index * 3 + 2] = Math.sin(angle) * radius;
          index += 1;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aRing", new THREE.BufferAttribute(rings, 1));
      geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

      const uniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: dpr },
        uSize: { value: variant === "hero" ? 3.5 : 2.2 },
        uOpacity: { value: variant === "hero" ? 1 : 0.72 },
        uColorA: { value: new THREE.Color("#f08a4b") },
        uColorB: { value: new THREE.Color("#9ec6d8") },
      };

      const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uPixelRatio;
          uniform float uSize;
          attribute float aRing;
          attribute float aAngle;
          attribute float aSeed;
          varying float vGlow;

          void main() {
            float t = uTime;
            float radius = aRing;
            // Inner rings turn a little faster, as on the reference record.
            float spin = 0.045 + 0.03 * aSeed;
            float angle = aAngle + t * spin * (1.5 - radius * 0.028);

            // Three travelling waves sum into one smooth outward ripple.
            float falloff = smoothstep(0.0, 2.6, radius) * exp(-radius * 0.032);
            float w1 = sin(radius * 0.78 - t * 1.9);
            float w2 = sin(radius * 0.44 + t * 1.15 + aSeed * 1.7);
            float w3 = sin(radius * 2.35 - t * 0.75 + aSeed);
            float wave = (w1 * 0.58 + w2 * 0.3 + w3 * 0.12) * falloff;

            float breathe = 1.0 + sin(t * 0.55) * 0.018;
            vec3 point = vec3(
              cos(angle) * radius * breathe,
              wave * 1.9,
              sin(angle) * radius * breathe
            );

            vec4 view = modelViewMatrix * vec4(point, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = uSize * uPixelRatio
              * (0.5 + 0.95 * clamp(wave * 0.5 + 0.5, 0.0, 1.0))
              * (32.0 / max(1.0, -view.z));
            vGlow = clamp(wave * 0.95 + 0.45, 0.0, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform float uOpacity;
          varying float vGlow;

          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float distanceToCentre = length(uv);
            if (distanceToCentre > 0.5) discard;
            float core = smoothstep(0.5, 0.02, distanceToCentre);
            float alpha = pow(core, 2.1) * uOpacity * (0.4 + 0.6 * vGlow);
            vec3 colour = mix(uColorA, uColorB, clamp(vGlow * 1.2, 0.0, 1.0));
            gl_FragColor = vec4(colour * alpha, alpha);
          }
        `,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      if (variant === "ambient") {
        points.rotation.x = 0.06;
      }
      scene.add(points);

      const cameraAt = (time: number) => {
        const drift = reduceMotion ? 0 : time;
        if (variant === "hero") {
          // Steeper and closer than the ambient field: the record fills the
          // frame while the camera drifts by a couple of degrees at most.
          // Almost edge-on, like a record: the rings read as concentric
          // ellipses instead of a bowl of dots.
          camera.position.set(
            Math.sin(drift * 0.09) * 0.9,
            3.1 + Math.cos(drift * 0.07) * 0.2,
            21.5 + Math.sin(drift * 0.045) * 0.4,
          );
          camera.lookAt(0, 0, 0);
        } else {
          camera.position.set(
            Math.sin(drift * 0.055) * 1.4,
            11.5,
            30.5,
          );
          camera.lookAt(0, -1.2, 0);
        }
      };

      const renderOnce = () => {
        cameraAt(uniforms.uTime.value);
        renderer.render(scene, camera);
      };

      // performance.now(), not THREE.Clock: Clock is deprecated in three 0.187
      // and warns on every mount.
      const startedAt = performance.now();
      const tick = () => {
        frame = 0;
        if (disposed) {
          return;
        }
        uniforms.uTime.value = (performance.now() - startedAt) / 1000;
        cameraAt(uniforms.uTime.value);
        renderer.render(scene, camera);
        if (visible && onScreen) {
          frame = window.requestAnimationFrame(tick);
        }
      };

      const play = () => {
        if (reduceMotion || disposed || frame !== 0 || !visible || !onScreen) {
          return;
        }
        frame = window.requestAnimationFrame(tick);
      };

      const stop = () => {
        if (frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      };

      const resize = () => {
        if (!hostRef.current) {
          return;
        }
        const nextWidth = hostRef.current.clientWidth || 1;
        const nextHeight = hostRef.current.clientHeight || 1;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight, false);
        renderOnce();
      };

      const onVisibility = () => {
        visible = document.visibilityState !== "hidden";
        if (visible) {
          play();
        } else {
          stop();
        }
      };

      let observer: IntersectionObserver | null = null;
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            if (onScreen) {
              play();
            } else {
              stop();
            }
          },
          { threshold: 0.01 },
        );
        observer.observe(host);
      }

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      } else {
        window.addEventListener("resize", resize);
      }
      document.addEventListener("visibilitychange", onVisibility);

      renderOnce();
      play();

      cleanup = () => {
        stop();
        observer?.disconnect();
        resizeObserver?.disconnect();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibility);
        scene.remove(points);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss?.();
        if (renderer.domElement.parentNode === host) {
          host.removeChild(renderer.domElement);
        }
      };
    };

    void start();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [variant]);

  return (
    <div
      className={`wavefield wavefield--${variant}`}
      ref={hostRef}
      aria-hidden="true"
    >
      <span className="wavefield__glow" />
    </div>
  );
}
