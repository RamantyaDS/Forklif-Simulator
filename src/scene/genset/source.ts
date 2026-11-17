// The detailed 2250 kVA set from the Genset Simulator, used here as cargo: engine stopped, assembled, not clickable.
// This file stands in for the genset site's simulation state, view settings and DSE screen.
import { createContext, useContext } from 'react';
import type * as THREE from 'three';

interface CargoState {
  rpm: number;
  exhaust: number;
  firing: boolean;
  starter: boolean;
  genKw: number;
}

export interface GensetSource {
  s: CargoState;
  shaft: { angle: number };
  plant: boolean;
  view: () => { explode: 0 | 1 | 2; xray: boolean };
  pick?: () => boolean;
  bare?: boolean;
  block?: THREE.MeshStandardMaterial;
}

const still: CargoState = { rpm: 0, exhaust: 30, firing: false, starter: false, genKw: 0 };
const VIEW = { explode: 0 as const, xray: false };

// Clicks on the cargo do nothing (`pick` swallows them); the panel refreshes slowly (`plant`).
export const GensetCtx = createContext<GensetSource>({ s: still, shaft: { angle: 0 }, plant: true, view: () => VIEW, pick: () => true });
export const useGenset = () => useContext(GensetCtx);

export const useUI = { getState: () => ({ set: (_: object) => undefined }) };

// The controller is switched off in transport: a dark screen with the module's frame.
export const W = 1010;
export const H = 800;
export function drawModule(g: CanvasRenderingContext2D, _s?: CargoState) {
  g.fillStyle = '#0b0f0d';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d2621';
  g.fillRect(70, 60, W - 140, 330);
}
