'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

interface AccessShieldCanvasProps {
  userCount: number;
  activeRole: string;
}

const ROLE_COLORS: Record<string, string> = {
  all: '#3b82f6',
  admin: '#ef4444',
  judges: '#eab308',
  team: '#3b82f6',
  stagecontroller: '#a855f7',
};

/**
 * Interactive Three.js WebGL security core with 4 role-colored orbital satellites
 * (Admin, Judges, Team, Stage Control) and smooth pointer parallax.
 */
export function AccessShieldCanvas({ userCount, activeRole }: AccessShieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<(() => void) | null>(null);
  const coreColorRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const wireColorRef = useRef<THREE.MeshBasicMaterial | null>(null);
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

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 260;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 6.4);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x93c5fd, 2.2);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimRed = new THREE.PointLight(0xef4444, 2.6, 16);
    rimRed.position.set(-4, 2.5, 3);
    scene.add(rimRed);

    const rimPurple = new THREE.PointLight(0xa855f7, 2.8, 16);
    rimPurple.position.set(3.5, -3, 3);
    scene.add(rimPurple);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Central faceted vault octahedron
    const coreGeo = new THREE.OctahedronGeometry(1.08, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(ROLE_COLORS.all),
      emissive: new THREE.Color('#1e3a8a'),
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
      flatShading: true,
    });
    coreColorRef.current = coreMat;
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    // Protective outer shield wireframe
    const shieldGeo = new THREE.IcosahedronGeometry(1.42, 1);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60a5fa'),
      wireframe: true,
      transparent: true,
      opacity: 0.36,
    });
    wireColorRef.current = shieldMat;
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    rootGroup.add(shieldMesh);

    // Two intersecting gyroscopic rings with 4 role satellites
    const ringGeo1 = new THREE.TorusGeometry(2.0, 0.024, 16, 100);
    const ringMat1 = new THREE.MeshStandardMaterial({
      color: '#60a5fa',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.55,
      metalness: 0.8,
      roughness: 0.25,
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.set(Math.PI / 3, 0.28, 0);
    rootGroup.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(2.32, 0.02, 16, 100);
    const ringMat2 = new THREE.MeshStandardMaterial({
      color: '#c084fc',
      emissive: '#6b21a8',
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.25,
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.set(-Math.PI / 3.4, -0.42, 0.35);
    rootGroup.add(ring2);

    const nodeGeo = new THREE.SphereGeometry(0.095, 16, 16);
    const roleNodeColors = ['#ef4444', '#eab308', '#3b82f6', '#a855f7'];
    const nodeMats = roleNodeColors.map((hex) => new THREE.MeshBasicMaterial({ color: hex }));
    const adminNode = new THREE.Mesh(nodeGeo, nodeMats[0]);
    const judgeNode = new THREE.Mesh(nodeGeo, nodeMats[1]);
    const teamNode = new THREE.Mesh(nodeGeo, nodeMats[2]);
    const stageNode = new THREE.Mesh(nodeGeo, nodeMats[3]);
    ring1.add(adminNode, judgeNode);
    ring2.add(teamNode, stageNode);

    // Security starfield particles
    const particleCount = 96;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const palette = roleNodeColors.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.4 + Math.random() * 2.1;
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
      opacity: 0.8,
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

    pulseRef.current = () => {
      if (prefersReducedMotion) return;
      gsap.to(rootGroup.rotation, {
        y: rootGroup.rotation.y + Math.PI * 0.6,
        duration: 0.85,
        ease: 'power3.out',
      });
      gsap.fromTo(
        coreMesh.scale,
        { x: 1.2, y: 1.2, z: 1.2 },
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
        coreMesh.rotation.y = t * 0.42;
        coreMesh.rotation.x = Math.sin(t * 0.45) * 0.22;
        shieldMesh.rotation.y = -t * 0.22;
        shieldMesh.rotation.z = t * 0.14;

        ring1.rotation.z = t * 0.4;
        ring2.rotation.z = -t * 0.32;

        adminNode.position.set(Math.cos(t * 1.2) * 2.0, Math.sin(t * 1.2) * 2.0, 0);
        judgeNode.position.set(Math.cos(t * 1.2 + Math.PI) * 2.0, Math.sin(t * 1.2 + Math.PI) * 2.0, 0);
        teamNode.position.set(Math.cos(-t * 0.95) * 2.32, Math.sin(-t * 0.95) * 2.32, 0);
        stageNode.position.set(Math.cos(-t * 0.95 + Math.PI) * 2.32, Math.sin(-t * 0.95 + Math.PI) * 2.32, 0);

        particles.rotation.y = t * 0.05;
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
      pulseRef.current = null;
      coreColorRef.current = null;
      wireColorRef.current = null;

      coreGeo.dispose();
      coreMat.dispose();
      shieldGeo.dispose();
      shieldMat.dispose();
      ringGeo1.dispose();
      ringMat1.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      nodeGeo.dispose();
      nodeMats.forEach((m) => m.dispose());
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Shift crystal color & pulse smoothly when active role filter or user count changes
  useEffect(() => {
    const targetColor = new THREE.Color(ROLE_COLORS[activeRole] || ROLE_COLORS.all);
    if (coreColorRef.current) {
      gsap.to(coreColorRef.current.color, {
        r: targetColor.r,
        g: targetColor.g,
        b: targetColor.b,
        duration: 0.45,
      });
    }
    if (wireColorRef.current) {
      gsap.to(wireColorRef.current.color, {
        r: targetColor.r,
        g: targetColor.g,
        b: targetColor.b,
        duration: 0.45,
      });
    }
    pulseRef.current?.();
  }, [userCount, activeRole]);

  if (webglUnavailable) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-36 w-36 rounded-full bg-gradient-to-tr from-red-500/25 via-blue-500/25 to-purple-500/25 blur-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={() => pulseRef.current?.()}
      title="Interactive 3D Role Vault"
      className="h-full w-full cursor-pointer select-none"
    />
  );
}

