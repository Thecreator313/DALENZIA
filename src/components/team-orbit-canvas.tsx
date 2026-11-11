'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

interface TeamOrbitCanvasProps {
  variant?: 'dashboard' | 'participants' | 'assignments' | 'festival' | 'admin';
  pulseKey?: string | number;
}

const VARIANT_PALETTES = {
  dashboard: {
    core: '#3b82f6',
    emissive: '#1d4ed8',
    wire: '#60a5fa',
    ring1: '#38bdf8',
    ring2: '#818cf8',
  },
  participants: {
    core: '#06b6d4',
    emissive: '#0e7490',
    wire: '#22d3ee',
    ring1: '#34d399',
    ring2: '#38bdf8',
  },
  assignments: {
    core: '#6366f1',
    emissive: '#4338ca',
    wire: '#818cf8',
    ring1: '#a855f7',
    ring2: '#38bdf8',
  },
  festival: {
    core: '#f59e0b',
    emissive: '#b45309',
    wire: '#fbbf24',
    ring1: '#8b5cf6',
    ring2: '#ec4899',
  },
  admin: {
    core: '#6366f1',
    emissive: '#312e81',
    wire: '#38bdf8',
    ring1: '#a855f7',
    ring2: '#f59e0b',
  },
};

/**
 * Interactive Three.js 3D crest & orbital sculpture for Team Portal pages.
 */
export function TeamOrbitCanvas({
  variant = 'dashboard',
  pulseKey = 0,
}: TeamOrbitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pulseTriggerRef = useRef<(() => void) | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const palette = VARIANT_PALETTES[variant];

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

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 250;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 6.2);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x93c5fd, 2.2);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(palette.ring1, 3.0, 16);
    rimLight.position.set(-4, -2, 3);
    scene.add(rimLight);

    const accentLight = new THREE.PointLight(palette.ring2, 2.4, 15);
    accentLight.position.set(3.5, 2.5, 2.5);
    scene.add(accentLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const coreGeo = new THREE.DodecahedronGeometry(1.06, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(palette.core),
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9,
      flatShading: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    const wireGeo = new THREE.IcosahedronGeometry(1.38, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.wire),
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    rootGroup.add(wireMesh);

    const ring1Geo = new THREE.TorusGeometry(1.94, 0.025, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.ring1),
      emissive: new THREE.Color(palette.ring1),
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.25,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.set(Math.PI / 3.1, 0.3, 0);
    rootGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.26, 0.02, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.ring2),
      emissive: new THREE.Color(palette.ring2),
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.25,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.set(-Math.PI / 3.4, -0.45, 0.35);
    rootGroup.add(ring2);

    const satGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const sat1Mat = new THREE.MeshBasicMaterial({ color: palette.ring1 });
    const sat2Mat = new THREE.MeshBasicMaterial({ color: palette.ring2 });
    const sat1 = new THREE.Mesh(satGeo, sat1Mat);
    const sat2 = new THREE.Mesh(satGeo, sat2Mat);
    ring1.add(sat1);
    ring2.add(sat2);

    const particleCount = 96;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const colorPool = [
      new THREE.Color(palette.core),
      new THREE.Color(palette.ring1),
      new THREE.Color(palette.ring2),
    ];

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.4 + Math.random() * 2.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.72;
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const c = colorPool[i % colorPool.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particlesMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    if (!prefersReducedMotion) {
      gsap.fromTo(
        rootGroup.scale,
        { x: 0.55, y: 0.55, z: 0.55 },
        { x: 1, y: 1, z: 1, duration: 1.05, ease: 'elastic.out(1, 0.65)' }
      );
    }

    pulseTriggerRef.current = () => {
      if (prefersReducedMotion) return;
      gsap.to(rootGroup.rotation, {
        y: rootGroup.rotation.y + Math.PI * 0.6,
        duration: 0.85,
        ease: 'power3.out',
      });
      gsap.fromTo(
        coreMesh.scale,
        { x: 1.18, y: 1.18, z: 1.18 },
        { x: 1, y: 1, z: 1, duration: 0.65, ease: 'elastic.out(1, 0.5)' }
      );
    };

    const targetTilt = { x: 0, y: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetTilt.y = nx * 0.45;
      targetTilt.x = -ny * 0.3;
    };
    const handlePointerLeave = () => {
      targetTilt.x = 0;
      targetTilt.y = 0;
    };

    const parentEl = container.parentElement;
    parentEl?.addEventListener('pointermove', handlePointerMove);
    parentEl?.addEventListener('pointerleave', handlePointerLeave);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 1);
      const h = Math.max(entry.contentRect.height, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        coreMesh.rotation.y = t * 0.36;
        coreMesh.rotation.x = Math.sin(t * 0.4) * 0.22;
        wireMesh.rotation.y = -t * 0.2;
        wireMesh.rotation.z = t * 0.14;

        ring1.rotation.z = t * 0.42;
        ring2.rotation.z = -t * 0.32;
        sat1.position.set(Math.cos(t * 1.35) * 1.94, Math.sin(t * 1.35) * 1.94, 0);
        sat2.position.set(Math.cos(-t * 1.05) * 2.26, Math.sin(-t * 1.05) * 2.26, 0);

        particles.rotation.y = t * 0.055;
        rootGroup.position.y = Math.sin(t * 1.25) * 0.08;
      }

      rootGroup.rotation.x += (targetTilt.x - rootGroup.rotation.x) * 0.06;
      rootGroup.rotation.y += (targetTilt.y - rootGroup.rotation.y) * 0.06;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      parentEl?.removeEventListener('pointermove', handlePointerMove);
      parentEl?.removeEventListener('pointerleave', handlePointerLeave);
      pulseTriggerRef.current = null;

      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      satGeo.dispose();
      sat1Mat.dispose();
      sat2Mat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [palette.core, palette.emissive, palette.wire, palette.ring1, palette.ring2]);

  useEffect(() => {
    pulseTriggerRef.current?.();
  }, [pulseKey]);

  if (webglUnavailable) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-36 w-36 rounded-full bg-gradient-to-tr from-blue-500/25 via-cyan-500/20 to-indigo-500/25 blur-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={() => pulseTriggerRef.current?.()}
      title={
        variant === 'festival'
          ? 'Interactive 3D Fest Crest'
          : variant === 'admin'
          ? 'Interactive 3D Admin Command Core'
          : 'Interactive 3D Team Crest'
      }
      className="h-full w-full cursor-pointer select-none"
    />
  );
}

