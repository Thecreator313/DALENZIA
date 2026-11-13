'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

interface ReportingRevealCanvasProps {
  /** Increment this counter to trigger a 3D celebration burst + ring spin-up. */
  revealTrigger: number;
  /** Whether the code letter has been revealed. */
  isRevealed: boolean;
}

/**
 * Interactive Three.js + GSAP WebGL backdrop for the Participant Reporting Spotlight.
 * Renders a floating crystalline vault core, dual orbital rings, and a celebration
 * particle burst triggered via GSAP when a code letter is assigned or scratched open.
 */
export function ReportingRevealCanvas({
  revealTrigger,
  isRevealed,
}: ReportingRevealCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const burstFnRef = useRef<((celebrate: boolean) => void) | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 240;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.5);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    keyLight.position.set(4, 4, 5);
    scene.add(keyLight);

    const goldLight = new THREE.PointLight(0xfbbf24, 3.0, 16);
    goldLight.position.set(-3.5, 2, 3);
    scene.add(goldLight);

    const emeraldLight = new THREE.PointLight(0x10b981, 2.6, 16);
    emeraldLight.position.set(3.5, -2.5, 2.5);
    scene.add(emeraldLight);

    // Core vault group
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const coreGeo = new THREE.OctahedronGeometry(1.05, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#6366f1'),
      emissive: new THREE.Color('#312e81'),
      emissiveIntensity: 0.4,
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(coreMesh);

    const wireGeo = new THREE.IcosahedronGeometry(1.38, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38bdf8'),
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    coreGroup.add(wireMesh);

    const ring1Geo = new THREE.TorusGeometry(1.95, 0.025, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fbbf24'),
      emissive: new THREE.Color('#d97706'),
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.8,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.set(Math.PI / 3.4, 0.3, 0);
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.32, 0.02, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#10b981'),
      emissive: new THREE.Color('#059669'),
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.8,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.set(-Math.PI / 3.2, -0.4, 0.2);
    coreGroup.add(ring2);

    // Particle field (bursts outward on reveal)
    const particleCount = 110;
    const basePositions = new Float32Array(particleCount * 3);
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const palette = [
      new THREE.Color('#fbbf24'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#10b981'),
      new THREE.Color('#a855f7'),
    ];

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.0 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta) * 0.65;
      const z = radius * Math.cos(phi) * 0.7;

      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    const burstState = { expand: 1, spinBoost: 0 };

    burstFnRef.current = (celebrate: boolean) => {
      if (prefersReducedMotion) return;

      gsap.killTweensOf(burstState);
      gsap.killTweensOf(coreGroup.scale);

      if (celebrate) {
        coreMat.color.set('#10b981');
        coreMat.emissive.set('#047857');
        wireMat.color.set('#fbbf24');
      } else {
        coreMat.color.set('#6366f1');
        coreMat.emissive.set('#312e81');
        wireMat.color.set('#38bdf8');
      }

      gsap.fromTo(
        burstState,
        { expand: 0.35, spinBoost: celebrate ? 0.14 : 0.08 },
        { expand: celebrate ? 1.55 : 1.15, spinBoost: 0, duration: 1.2, ease: 'power3.out' }
      );

      gsap.fromTo(
        coreGroup.scale,
        { x: 0.78, y: 0.78, z: 0.78 },
        { x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1, 0.55)' }
      );
    };

    // Mouse parallax
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    container.addEventListener('pointermove', onPointerMove);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        coreMesh.rotation.y += 0.008 + burstState.spinBoost;
        coreMesh.rotation.x += 0.004;
        wireMesh.rotation.y -= 0.005 + burstState.spinBoost * 0.5;
        ring1.rotation.z += 0.007 + burstState.spinBoost;
        ring2.rotation.z -= 0.006 + burstState.spinBoost;

        coreGroup.position.y = Math.sin(t * 1.4) * 0.08;
        coreGroup.rotation.y += (pointer.x * 0.25 - coreGroup.rotation.y) * 0.05;
        coreGroup.rotation.x += (-pointer.y * 0.2 - coreGroup.rotation.x) * 0.05;

        particles.rotation.y = t * 0.08;
        const posAttr = particlesGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          posAttr.setXYZ(
            i,
            basePositions[i * 3] * burstState.expand,
            basePositions[i * 3 + 1] * burstState.expand,
            basePositions[i * 3 + 2] * burstState.expand
          );
        }
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      gsap.killTweensOf(burstState);
      gsap.killTweensOf(coreGroup.scale);

      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    burstFnRef.current?.(isRevealed);
  }, [revealTrigger, isRevealed]);

  if (webglUnavailable) {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-emerald-500/15 pointer-events-none" />
    );
  }

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}

