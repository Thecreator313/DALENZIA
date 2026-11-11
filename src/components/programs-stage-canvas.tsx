'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

interface ProgramsStageCanvasProps {
  programCount: number;
  onStageCount: number;
  offStageCount: number;
}

/**
 * Interactive Three.js WebGL stage sculpture for the Admin Programs hero banner.
 * Uses subtle mouse-parallax and GSAP-driven orbital energy without heavy post-processing.
 */
export function ProgramsStageCanvas({
  programCount,
  onStageCount,
  offStageCount,
}: ProgramsStageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pulseTriggerRef = useRef<(() => void) | null>(null);
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

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 260;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 6.2);

    // Lighting tailored for both light and dark UI backgrounds
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x60a5fa, 2.2);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xa855f7, 3.2, 18);
    rimLight.position.set(-4, -2.5, 3);
    scene.add(rimLight);

    const accentLight = new THREE.PointLight(0x22d3ee, 2.4, 15);
    accentLight.position.set(3, -3, 2);
    scene.add(accentLight);

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // Inner glowing faceted crystal core
    const coreGeo = new THREE.IcosahedronGeometry(1.12, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#3b82f6'),
      emissive: new THREE.Color('#1d4ed8'),
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.25,
      transmission: 0.35,
      transparent: true,
      opacity: 0.88,
      flatShading: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    stageGroup.add(coreMesh);

    // Crisp outer geodesic wireframe cage
    const wireGeo = new THREE.IcosahedronGeometry(1.36, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60a5fa'),
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    stageGroup.add(wireMesh);

    // Orbital ring 1 (On-Stage track)
    const ring1Geo = new THREE.TorusGeometry(1.92, 0.028, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#38bdf8'),
      emissive: new THREE.Color('#0284c7'),
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.8,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.set(Math.PI / 3.2, 0.35, 0);
    stageGroup.add(ring1);

    // Orbital ring 2 (Off-Stage track)
    const ring2Geo = new THREE.TorusGeometry(2.26, 0.022, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#a855f7'),
      emissive: new THREE.Color('#7e22ce'),
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.8,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.set(-Math.PI / 3.6, -0.5, 0.4);
    stageGroup.add(ring2);

    // Orbiting satellite nodes
    const satelliteGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const sat1Mat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const sat2Mat = new THREE.MeshBasicMaterial({ color: '#c084fc' });
    const sat1 = new THREE.Mesh(satelliteGeo, sat1Mat);
    const sat2 = new THREE.Mesh(satelliteGeo, sat2Mat);
    ring1.add(sat1);
    ring2.add(sat2);

    // Ambient floating particle field
    const particleCount = 110;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const palette = [
      new THREE.Color('#3b82f6'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#a855f7'),
    ];

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.4 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.72;
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const c = palette[i % palette.length];
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
    const particleField = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particleField);

    // GSAP entrance pop
    if (!prefersReducedMotion) {
      gsap.fromTo(
        stageGroup.scale,
        { x: 0.55, y: 0.55, z: 0.55 },
        { x: 1, y: 1, z: 1, duration: 1.1, ease: 'elastic.out(1, 0.65)' }
      );
    }

    pulseTriggerRef.current = () => {
      if (prefersReducedMotion) return;
      gsap.to(stageGroup.rotation, {
        y: stageGroup.rotation.y + Math.PI * 0.65,
        duration: 0.9,
        ease: 'power3.out',
      });
      gsap.fromTo(
        coreMesh.scale,
        { x: 1.18, y: 1.18, z: 1.18 },
        { x: 1, y: 1, z: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' }
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
        coreMesh.rotation.y = t * 0.35;
        coreMesh.rotation.x = Math.sin(t * 0.4) * 0.25;
        wireMesh.rotation.y = -t * 0.22;
        wireMesh.rotation.z = t * 0.15;

        ring1.rotation.z = t * 0.45;
        ring2.rotation.z = -t * 0.34;
        sat1.position.set(Math.cos(t * 1.4) * 1.92, Math.sin(t * 1.4) * 1.92, 0);
        sat2.position.set(Math.cos(-t * 1.1) * 2.26, Math.sin(-t * 1.1) * 2.26, 0);

        particleField.rotation.y = t * 0.06;
        stageGroup.position.y = Math.sin(t * 1.3) * 0.09;
      }

      stageGroup.rotation.x += (targetTilt.x - stageGroup.rotation.x) * 0.06;
      stageGroup.rotation.y += (targetTilt.y - stageGroup.rotation.y) * 0.06;

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
      satelliteGeo.dispose();
      sat1Mat.dispose();
      sat2Mat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Trigger a celebratory kinetic pulse whenever program stats change
  useEffect(() => {
    pulseTriggerRef.current?.();
  }, [programCount, onStageCount, offStageCount]);

  if (webglUnavailable) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-36 w-36 rounded-full bg-gradient-to-tr from-blue-500/30 via-indigo-500/25 to-purple-500/30 blur-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={() => pulseTriggerRef.current?.()}
      title="Interactive 3D Stage"
      className="h-full w-full cursor-pointer select-none"
    />
  );
}

