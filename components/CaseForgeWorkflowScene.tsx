"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Three from "three";

type CaseForgeWorkflowSceneProps = {
  activeCases: number;
  reviewedCases: number;
  automationReady: number;
  attentionItems: number;
};

const workflowNodes = [
  { label: "Source", tone: "#14b8a6", x: -4.8, y: 0.35, z: 0 },
  { label: "Manual cases", tone: "#0ea5e9", x: -2.35, y: -0.35, z: 0.25 },
  { label: "Review", tone: "#f59e0b", x: 0, y: 0.4, z: -0.15 },
  { label: "Automation", tone: "#22c55e", x: 2.35, y: -0.32, z: 0.18 },
  { label: "Reports", tone: "#64748b", x: 4.8, y: 0.32, z: 0 },
];

export default function CaseForgeWorkflowScene({
  activeCases,
  reviewedCases,
  automationReady,
  attentionItems,
}: CaseForgeWorkflowSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const metricLabels = useMemo(
    () => [
      { label: "Active", value: activeCases },
      { label: "Reviewed", value: reviewedCases },
      { label: "Automation", value: automationReady },
      { label: "Attention", value: attentionItems },
    ],
    [activeCases, automationReady, attentionItems, reviewedCases],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const mountScene = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const THREE = (await import("three")) as typeof Three;
      if (disposed || !canvasRef.current) return;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        preserveDrawingBuffer: true,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 1.1, 9.2);

      const root = new THREE.Group();
      scene.add(root);

      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(3, 6, 5);
      scene.add(keyLight);
      const edgeLight = new THREE.DirectionalLight(0x99f6e4, 1.3);
      edgeLight.position.set(-5, 3, 4);
      scene.add(edgeLight);

      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(11.7, 0.08, 2.7),
        new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          metalness: 0.15,
          roughness: 0.62,
          transparent: true,
          opacity: 0.82,
        }),
      );
      platform.position.set(0, -1.12, -0.12);
      root.add(platform);

      const nodeMeshes: Three.Mesh[] = [];
      workflowNodes.forEach((node, index) => {
        const color = new THREE.Color(node.tone);
        const nodeGroup = new THREE.Group();
        nodeGroup.position.set(node.x, node.y, node.z);

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(index === 1 ? 1.35 : 1.08, 0.72, 0.72),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.12,
            metalness: 0.18,
            roughness: 0.42,
          }),
        );
        nodeGroup.add(body);
        nodeMeshes.push(body);

        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.025, 12, 48),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.44,
          }),
        );
        halo.rotation.x = Math.PI / 2;
        halo.position.y = -0.48;
        nodeGroup.add(halo);

        root.add(nodeGroup);
      });

      const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0x0f766e,
        transparent: true,
        opacity: 0.62,
      });

      for (let index = 0; index < workflowNodes.length - 1; index += 1) {
        const from = workflowNodes[index];
        const to = workflowNodes[index + 1];
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(from.x + 0.55, from.y - 0.02, from.z),
          new THREE.Vector3((from.x + to.x) / 2, 0.78, 0.42),
          new THREE.Vector3(to.x - 0.55, to.y - 0.02, to.z),
        ]);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.018, 8, false), lineMaterial));
      }

      const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(320, Math.floor(bounds.width));
        const height = Math.max(190, Math.floor(bounds.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      const animate = (time: number) => {
        const seconds = time / 1000;
        root.rotation.y = Math.sin(seconds * 0.28) * 0.07;
        nodeMeshes.forEach((mesh, index) => {
          mesh.rotation.y = seconds * 0.34 + index * 0.28;
          mesh.position.y = Math.sin(seconds * 1.2 + index) * 0.04;
        });
        renderer.render(scene, camera);
        if (!mediaQuery.matches) {
          frameRef.current = window.requestAnimationFrame(animate);
        }
      };

      resize();
      renderer.render(scene, camera);
      setSceneReady(true);

      if (!mediaQuery.matches) {
        frameRef.current = window.requestAnimationFrame(animate);
      }

      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      cleanup = () => {
        observer.disconnect();
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        scene.traverse((item) => {
          const mesh = item as Three.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material?.dispose();
          }
        });
        renderer.dispose();
      };
    };

    void mountScene();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <section
      className="relative min-h-[260px] overflow-hidden border-y border-zinc-200/80 bg-[linear-gradient(135deg,_rgba(240,253,250,0.95),_rgba(248,250,252,0.92)_48%,_rgba(239,246,255,0.88))] dark:border-zinc-800 dark:bg-[linear-gradient(135deg,_rgba(6,78,59,0.22),_rgba(9,9,11,0.94)_54%,_rgba(30,41,59,0.72))]"
      aria-label="CaseForge 3D workflow map"
      data-testid="caseforge-3d-workflow-scene"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        data-testid="caseforge-3d-workflow-canvas"
      />
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
        <div className="flex flex-wrap justify-center gap-2">
          {metricLabels.map((item) => (
            <span
              key={item.label}
              className="rounded-full border border-white/80 bg-white/82 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/64 dark:text-zinc-200"
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {workflowNodes.map((node) => (
          <div
            key={node.label}
            className="min-h-[42px] rounded-xl border border-white/80 bg-white/86 px-3 py-2 text-center text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/68 dark:text-zinc-100"
          >
            {node.label}
          </div>
        ))}
      </div>
      {!sceneReady ? (
        <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          Loading workflow map
        </div>
      ) : null}
    </section>
  );
}
