/**
 * STRIKEPOINT: Tactical Sniper
 * High-precision tactical sniper browser game featuring mil-dot scope physics,
 * procedural cyberpunk cityscapes, dynamic wind deflection, and Web Audio sound effects.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Crosshair,
  Wind,
  ShieldAlert,
  Award,
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Pause,
  Zap,
  Target,
  Flame,
  ChevronRight,
  Eye,
  Info,
  Clock,
  Sparkles,
  Layers,
  Radio
} from 'lucide-react';

// ==========================================
// TYPES & CONFIGURATION
// ==========================================

export type GameState = 'BRIEFING' | 'PLAYING' | 'PAUSED' | 'LEVEL_COMPLETE' | 'VICTORY' | 'GAME_OVER';

export type OpticMode = 'TACTICAL' | 'THERMAL' | 'NIGHT_VISION';

export interface TargetEntity {
  id: number;
  type: 'ROOFTOP' | 'WINDOW' | 'RUNNER' | 'COMMANDER';
  x: number;
  y: number;
  baseX: number;
  width: number;
  height: number;
  distance: number; // meters e.g. 250 - 550m
  speed: number;
  direction: number; // -1 or 1
  minX: number;
  maxX: number;
  isDead: boolean;
  deathTimer: number; // for collapse animation
  isHeadshot: boolean;
  isPeeking: boolean; // for window scouts
  peekTimer: number;
  maxHp: number;
  hp: number;
  colorSeed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  spark?: boolean;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  scale: number;
  life: number;
}

export interface LevelConfig {
  id: number;
  sectorName: string;
  codename: string;
  description: string;
  windSpeed: number; // positive = right, negative = left (km/h)
  targetCount: number;
  timeLimit: number; // seconds
  hasRunners: boolean;
  hasWindowScouts: boolean;
  hasCommander: boolean;
}

const CAMPAIGN_LEVELS: LevelConfig[] = [
  {
    id: 1,
    sectorName: 'SECTOR 01',
    codename: 'OPERATION NIGHTFALL',
    description: 'Neutralize syndicate perimeter spotters along the low-rise industrial roofs. Minimal wind sheer.',
    windSpeed: 4,
    targetCount: 4,
    timeLimit: 55,
    hasRunners: false,
    hasWindowScouts: false,
    hasCommander: false,
  },
  {
    id: 2,
    sectorName: 'SECTOR 02',
    codename: 'NEON ALLEYWAY',
    description: 'Syndicate couriers are transferring encrypted datadrives. Moderate crosswind from the west.',
    windSpeed: -8,
    targetCount: 5,
    timeLimit: 50,
    hasRunners: true,
    hasWindowScouts: false,
    hasCommander: false,
  },
  {
    id: 3,
    sectorName: 'SECTOR 03',
    codename: 'SKYLINE AMBUSH',
    description: 'Hostile marksmen occupying corporate tower windows and high water tanks. Strong easterly wind.',
    windSpeed: 13,
    targetCount: 6,
    timeLimit: 48,
    hasRunners: true,
    hasWindowScouts: true,
    hasCommander: false,
  },
  {
    id: 4,
    sectorName: 'SECTOR 04',
    codename: 'CIPHER DISTRICT',
    description: 'Heavy atmospheric turbulence over the communications hub. Hostiles are moving swiftly between cover.',
    windSpeed: -17,
    targetCount: 7,
    timeLimit: 45,
    hasRunners: true,
    hasWindowScouts: true,
    hasCommander: false,
  },
  {
    id: 5,
    sectorName: 'SECTOR 05',
    codename: 'APEX PROTOCOL',
    description: 'Eliminate the Syndicate Commander and elite vanguard in severe gale conditions. Maximum precision required.',
    windSpeed: 23,
    targetCount: 8,
    timeLimit: 42,
    hasRunners: true,
    hasWindowScouts: true,
    hasCommander: true,
  },
];

// ==========================================
// WEB AUDIO API SOUND SYNTHESIZER
// ==========================================

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playGunshot() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Sub-bass heavy thump (sine pitch drop)
    const kickOsc = this.ctx.createOscillator();
    const kickGain = this.ctx.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(220, now);
    kickOsc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
    kickGain.gain.setValueAtTime(1.0, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    kickOsc.connect(kickGain);
    kickGain.connect(this.ctx.destination);
    kickOsc.start(now);
    kickOsc.stop(now + 0.35);

    // Sharp ballistic noise crack
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1600, now);
    noiseFilter.Q.setValueAtTime(2.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    // City echo delay
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.14;
    const delayGain = this.ctx.createGain();
    delayGain.gain.value = 0.32;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseGain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(this.ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.5);
  }

  public playHeadshot() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // High crystalline metallic bell chime
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(2600, now);
    osc2.frequency.setValueAtTime(3920, now);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  }

  public playHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playReload() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Phase 1: Bolt pull (metallic click)
    const playClick = (time: number, freq: number, duration: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + duration);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };

    playClick(now, 900, 0.05); // Bolt latch open
    playClick(now + 0.25, 450, 0.08); // Cartridge chamber
    playClick(now + 0.85, 1200, 0.06); // Bolt slam shut
    playClick(now + 0.95, 750, 0.04); // Lock down
  }

  public playDryFire() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playHeartbeat() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playMissionSuccess() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.25, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.45);
    });
  }

  public playMissionFailed() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const notes = [320, 290, 240, 180];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      gain.gain.setValueAtTime(0.2, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.38);
    });
  }
}

const audio = new TacticalAudioEngine();

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game States
  const [gameState, setGameState] = useState<GameState>('BRIEFING');
  const [currentLevelIndex, setCurrentLevelIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('strikepoint_highscore') || '0', 10);
  });
  const [ammo, setAmmo] = useState<number>(5);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [reloadProgress, setReloadProgress] = useState<number>(0);
  const [combo, setCombo] = useState<number>(1);
  const [comboTimer, setComboTimer] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(50);
  const [totalKills, setTotalKills] = useState<number>(0);
  const [totalHeadshots, setTotalHeadshots] = useState<number>(0);
  const [totalShots, setTotalShots] = useState<number>(0);
  const [opticMode, setOpticMode] = useState<OpticMode>('TACTICAL');
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Breath / Steady Aim Mechanics
  const [isHoldingBreath, setIsHoldingBreath] = useState<boolean>(false);
  const [breathStamina, setBreathStamina] = useState<number>(100);

  // Targets & FX refs for tight RAF loop
  const currentLevel = CAMPAIGN_LEVELS[currentLevelIndex] || CAMPAIGN_LEVELS[0];
  const targetsRef = useRef<TargetEntity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  // Mouse & Scope Coordinates
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scopePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const recoilRef = useRef<{ x: number; y: number; flash: number }>({ x: 0, y: 0, flash: 0 });
  const hitmarkerRef = useRef<{ alpha: number; isHeadshot: boolean }>({ alpha: 0, isHeadshot: false });
  const lockTargetIdRef = useRef<number | null>(null);

  // Animation frame and timing
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const breatheTimeRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<number>(0);

  // Cityscape geometry cache
  interface Building {
    x: number;
    y: number;
    width: number;
    height: number;
    layer: number; // 0=distant, 1=mid, 2=foreground
    windows: { x: number; y: number; w: number; h: number; lit: boolean; color: string }[];
    hasAntenna?: boolean;
    hasWaterTower?: boolean;
    hasAcUnit?: boolean;
  }
  const cityscapeRef = useRef<Building[]>([]);

  // ------------------------------------------
  // PROCEDURAL CITYSCAPE GENERATION
  // ------------------------------------------
  const generateCityscape = useCallback((canvasWidth: number, canvasHeight: number) => {
    const buildings: Building[] = [];

    // Layer 0: Distant silhouettes
    const layer0Count = Math.ceil(canvasWidth / 70) + 4;
    for (let i = 0; i < layer0Count; i++) {
      const w = 60 + Math.random() * 50;
      const h = canvasHeight * 0.45 + Math.random() * (canvasHeight * 0.35);
      const x = i * 65 - 30;
      const y = canvasHeight - h;
      buildings.push({
        x,
        y,
        width: w,
        height: h,
        layer: 0,
        windows: [],
        hasAntenna: Math.random() > 0.4,
      });
    }

    // Layer 1: Midground corporate high-rises with glowing windows
    const layer1Count = Math.ceil(canvasWidth / 110) + 3;
    for (let i = 0; i < layer1Count; i++) {
      const w = 90 + Math.random() * 80;
      const h = canvasHeight * 0.38 + Math.random() * (canvasHeight * 0.28);
      const x = i * 115 - 20;
      const y = canvasHeight - h;

      const windows = [];
      const cols = Math.floor(w / 16);
      const rows = Math.floor((h - 40) / 22);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.35) {
            const litColors = ['#00f0ff', '#f59e0b', '#38bdf8', '#fbbf24', '#f1f5f9', '#a855f7'];
            const color = litColors[Math.floor(Math.random() * litColors.length)];
            windows.push({
              x: x + 10 + c * 15,
              y: y + 25 + r * 20,
              w: 8,
              h: 12,
              lit: true,
              color,
            });
          }
        }
      }

      buildings.push({
        x,
        y,
        width: w,
        height: h,
        layer: 1,
        windows,
        hasWaterTower: Math.random() > 0.6,
        hasAcUnit: true,
      });
    }

    // Layer 2: Foreground rooftops where targets stand/patrol
    const layer2Count = Math.ceil(canvasWidth / 180) + 2;
    for (let i = 0; i < layer2Count; i++) {
      const w = 150 + Math.random() * 100;
      const h = canvasHeight * 0.22 + Math.random() * (canvasHeight * 0.18);
      const x = i * 180 - 10;
      const y = canvasHeight - h;

      const windows = [];
      const cols = Math.floor(w / 24);
      const rows = Math.floor((h - 30) / 32);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isLargeWindow = true;
          windows.push({
            x: x + 16 + c * 24,
            y: y + 35 + r * 30,
            w: 14,
            h: 20,
            lit: Math.random() > 0.45,
            color: '#00f0ff',
          });
        }
      }

      buildings.push({
        x,
        y,
        width: w,
        height: h,
        layer: 2,
        windows,
        hasWaterTower: Math.random() > 0.5,
        hasAcUnit: true,
      });
    }

    cityscapeRef.current = buildings;
  }, []);

  // ------------------------------------------
  // SPAWN TARGETS FOR LEVEL
  // ------------------------------------------
  const spawnTargetsForLevel = useCallback((lvl: LevelConfig, canvasWidth: number, canvasHeight: number) => {
    const list: TargetEntity[] = [];
    const count = lvl.targetCount;

    // Use rooftop platforms from Layer 1 and Layer 2
    const foregroundBuildings = cityscapeRef.current.filter((b) => b.layer === 2);
    const midBuildings = cityscapeRef.current.filter((b) => b.layer === 1);

    for (let i = 0; i < count; i++) {
      let targetType: 'ROOFTOP' | 'WINDOW' | 'RUNNER' | 'COMMANDER' = 'ROOFTOP';
      if (lvl.hasCommander && i === count - 1) {
        targetType = 'COMMANDER';
      } else if (lvl.hasRunners && i % 2 === 1) {
        targetType = 'RUNNER';
      } else if (lvl.hasWindowScouts && i % 3 === 2) {
        targetType = 'WINDOW';
      }

      let spawnX = 0;
      let spawnY = 0;
      let minX = 0;
      let maxX = 0;
      let distance = 250 + Math.floor(Math.random() * 280); // meters

      if (targetType === 'WINDOW' && midBuildings.length > 0) {
        // Select an illuminated window from mid-layer
        const b = midBuildings[i % midBuildings.length];
        const litWins = b.windows.filter((w) => w.lit);
        if (litWins.length > 0) {
          const targetWin = litWins[Math.floor(Math.random() * litWins.length)];
          spawnX = targetWin.x + targetWin.w / 2;
          spawnY = targetWin.y + targetWin.h - 1;
        } else {
          spawnX = b.x + b.width * 0.5;
          spawnY = b.y + 40;
        }
        minX = spawnX - 2;
        maxX = spawnX + 2;
      } else if (targetType === 'RUNNER' && foregroundBuildings.length > 0) {
        const b = foregroundBuildings[i % foregroundBuildings.length];
        minX = b.x + 20;
        maxX = b.x + b.width - 25;
        spawnX = minX + Math.random() * (maxX - minX);
        spawnY = b.y; // on roof line
      } else {
        // Rooftop static guard
        const allRoofs = [...foregroundBuildings, ...midBuildings];
        const b = allRoofs[i % allRoofs.length];
        spawnX = b.x + 30 + Math.random() * (b.width - 60);
        spawnY = b.y;
        minX = spawnX - 10;
        maxX = spawnX + 10;
      }

      // Constrain inside visible play space
      spawnX = Math.max(80, Math.min(canvasWidth - 80, spawnX));
      spawnY = Math.max(120, Math.min(canvasHeight - 60, spawnY));

      const isCommander = targetType === 'COMMANDER';
      list.push({
        id: i + 1,
        type: targetType,
        x: spawnX,
        y: spawnY,
        baseX: spawnX,
        width: isCommander ? 26 : 20,
        height: isCommander ? 46 : 38,
        distance,
        speed: targetType === 'RUNNER' ? (1.2 + Math.random() * 1.4) : (0.3 + Math.random() * 0.3),
        direction: Math.random() > 0.5 ? 1 : -1,
        minX: Math.max(40, minX),
        maxX: Math.min(canvasWidth - 40, maxX),
        isDead: false,
        deathTimer: 0,
        isHeadshot: false,
        isPeeking: true,
        peekTimer: 0,
        maxHp: isCommander ? 2 : 1,
        hp: isCommander ? 2 : 1,
        colorSeed: Math.random(),
      });
    }

    targetsRef.current = list;
  }, []);

  // ------------------------------------------
  // START OR RESTART LEVEL
  // ------------------------------------------
  const startLevel = useCallback((levelIdx: number) => {
    const lvl = CAMPAIGN_LEVELS[levelIdx] || CAMPAIGN_LEVELS[0];
    setCurrentLevelIndex(levelIdx);
    setAmmo(5);
    setIsReloading(false);
    setReloadProgress(0);
    setTimeLeft(lvl.timeLimit);
    setGameState('PLAYING');
    setIsHoldingBreath(false);
    setBreathStamina(100);

    const canvas = canvasRef.current;
    if (canvas) {
      if (cityscapeRef.current.length === 0) {
        generateCityscape(canvas.width, canvas.height);
      }
      spawnTargetsForLevel(lvl, canvas.width, canvas.height);
    }
  }, [generateCityscape, spawnTargetsForLevel]);

  // Handle Mute Toggle
  const toggleMute = () => {
    audio.isMuted = !isMuted;
    setIsMuted(!isMuted);
  };

  // ------------------------------------------
  // RELOAD MECHANISM
  // ------------------------------------------
  const triggerReload = useCallback(() => {
    if (isReloading || ammo === 5) return;
    setIsReloading(true);
    setReloadProgress(0);
    audio.playReload();

    const reloadDuration = 1300; // ms
    const startTime = performance.now();

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / reloadDuration) * 100));
      setReloadProgress(progress);

      if (elapsed >= reloadDuration) {
        window.clearInterval(interval);
        setAmmo(5);
        setIsReloading(false);
        setReloadProgress(0);
      }
    }, 40);
  }, [isReloading, ammo]);

  // ------------------------------------------
  // SHOOTING & BALLISTICS
  // ------------------------------------------
  const handleShoot = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    if (isReloading) return;

    if (ammo <= 0) {
      audio.playDryFire();
      // Visual notification
      floatingTextsRef.current.push({
        id: Date.now(),
        text: 'MAGAZINE EMPTY [PRESS R]',
        x: scopePosRef.current.x,
        y: scopePosRef.current.y - 30,
        color: '#ef4444',
        alpha: 1,
        scale: 1,
        life: 0,
      });
      return;
    }

    // Deduct ammo & trigger kick
    setAmmo((prev) => prev - 1);
    setTotalShots((prev) => prev + 1);
    audio.playGunshot();

    // Recoil kick impulse
    recoilRef.current = {
      x: (Math.random() - 0.5) * 6,
      y: -18,
      flash: 1.0,
    };

    // Calculate actual bullet impact point with WIND DEFLECTION
    // Formula: wind deflection depends on wind speed and target depth
    const crosshairX = scopePosRef.current.x;
    const crosshairY = scopePosRef.current.y;
    const windSpeed = currentLevel.windSpeed; // km/h

    // Check hit against active targets
    let hitFound = false;
    const targets = targetsRef.current;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.isDead) continue;

      // Deflection formula for this target's distance:
      // Distance factor: 300m = ~1.0; 500m = ~1.6
      const distFactor = t.distance / 300;
      const horizontalWindDrift = windSpeed * distFactor * 2.2; // pixels of drift

      // The bullet lands at (crosshairX + horizontalWindDrift, crosshairY)
      const bulletX = crosshairX + horizontalWindDrift;
      const bulletY = crosshairY;

      // Target bounds
      const headRadius = (t.width * 0.45);
      const headCenterX = t.x;
      const headCenterY = t.y - t.height + headRadius;

      const bodyLeft = t.x - t.width / 2;
      const bodyRight = t.x + t.width / 2;
      const bodyTop = headCenterY + headRadius;
      const bodyBottom = t.y;

      // 1. Headshot check (distance to head center)
      const distToHead = Math.hypot(bulletX - headCenterX, bulletY - headCenterY);
      const isHeadshot = distToHead <= headRadius * 1.25;

      // 2. Body hit check
      const isBodyHit = (
        bulletX >= bodyLeft &&
        bulletX <= bodyRight &&
        bulletY >= bodyTop &&
        bulletY <= bodyBottom
      );

      if (isHeadshot || isBodyHit) {
        hitFound = true;
        t.hp -= (isHeadshot ? 2 : 1);

        // Sparks & bloodless cyber impact particles
        for (let p = 0; p < 24; p++) {
          particlesRef.current.push({
            x: bulletX,
            y: bulletY,
            vx: (Math.random() - 0.5) * 9,
            vy: (Math.random() - 0.8) * 8,
            life: 0,
            maxLife: 0.35 + Math.random() * 0.3,
            color: isHeadshot ? '#f59e0b' : '#00f0ff',
            size: 2 + Math.random() * 3,
            spark: true,
          });
        }

        if (t.hp <= 0) {
          // Elimination!
          t.isDead = true;
          t.isHeadshot = isHeadshot;
          t.deathTimer = 0;

          if (isHeadshot) {
            audio.playHeadshot();
            setTotalHeadshots((prev) => prev + 1);
          } else {
            audio.playHit();
          }

          setTotalKills((prev) => prev + 1);

          // Calculate score with combo
          const basePts = isHeadshot ? 350 : 150;
          const distBonus = Math.floor(t.distance / 8);
          const earnedPts = (basePts + distBonus) * combo;
          setScore((prev) => {
            const nextScore = prev + earnedPts;
            if (nextScore > highScore) {
              setHighScore(nextScore);
              localStorage.setItem('strikepoint_highscore', nextScore.toString());
            }
            return nextScore;
          });

          // Increase combo multiplier
          setCombo((prev) => Math.min(5, prev + 1));
          setComboTimer(3.8); // 3.8s window

          // Floating combat text
          floatingTextsRef.current.push({
            id: Date.now() + Math.random(),
            text: isHeadshot ? `HEADSHOT! +${earnedPts}` : `TARGET DOWN +${earnedPts}`,
            x: t.x,
            y: t.y - t.height - 20,
            color: isHeadshot ? '#fbbf24' : '#38bdf8',
            alpha: 1,
            scale: isHeadshot ? 1.3 : 1.0,
            life: 0,
          });

          // Hit marker visual
          hitmarkerRef.current = { alpha: 1.0, isHeadshot };

          // Check if all targets eliminated in this level
          const remaining = targets.filter((tg) => !tg.isDead && tg.id !== t.id).length;
          if (remaining === 0) {
            // Level cleared!
            setTimeout(() => {
              audio.playMissionSuccess();
              if (currentLevelIndex >= CAMPAIGN_LEVELS.length - 1) {
                setGameState('VICTORY');
              } else {
                setGameState('LEVEL_COMPLETE');
              }
            }, 800);
          }
        } else {
          // Armored commander took 1 hit
          audio.playHit();
          floatingTextsRef.current.push({
            id: Date.now() + Math.random(),
            text: 'ARMOR SHATTERED! +50',
            x: t.x,
            y: t.y - t.height - 15,
            color: '#f59e0b',
            alpha: 1,
            scale: 1,
            life: 0,
          });
          hitmarkerRef.current = { alpha: 0.8, isHeadshot: false };
        }
        break; // Hit one target per high-caliber bullet
      }
    }

    if (!hitFound) {
      // Bullet missed - concrete spark at impact wall
      const missDrift = windSpeed * 1.2 * 2.2;
      const missX = crosshairX + missDrift;
      const missY = crosshairY;

      for (let p = 0; p < 12; p++) {
        particlesRef.current.push({
          x: missX,
          y: missY,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 0,
          maxLife: 0.25,
          color: '#94a3b8',
          size: 1.8,
        });
      }

      // Break combo on miss
      setCombo(1);
      setComboTimer(0);
    }
  }, [gameState, isReloading, ammo, currentLevel, combo, highScore, currentLevelIndex]);

  // ------------------------------------------
  // INPUT LISTENERS (KEYBOARD & MOUSE)
  // ------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') {
        e.preventDefault();
        triggerReload();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        e.preventDefault();
        if (breathStamina > 10) {
          setIsHoldingBreath(true);
        }
      } else if (e.code === 'KeyN' || e.code === 'KeyV') {
        e.preventDefault();
        setOpticMode((prev) => {
          if (prev === 'TACTICAL') return 'THERMAL';
          if (prev === 'THERMAL') return 'NIGHT_VISION';
          return 'TACTICAL';
        });
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        setGameState((prev) => (prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        setIsHoldingBreath(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [triggerReload, breathStamina]);

  // Mouse move inside canvas
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      generateCityscape(canvas.width, canvas.height);
      if (gameState === 'PLAYING') {
        spawnTargetsForLevel(currentLevel, canvas.width, canvas.height);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [generateCityscape, spawnTargetsForLevel, currentLevel, gameState]);

  // ------------------------------------------
  // TIMER TICKER
  // ------------------------------------------
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const timerInterval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          audio.playMissionFailed();
          setGameState('GAME_OVER');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerInterval);
  }, [gameState]);

  // Combo decay ticker
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const comboInterval = window.setInterval(() => {
      setComboTimer((prev) => {
        if (prev <= 0.1) {
          setCombo(1);
          return 0;
        }
        return Math.max(0, prev - 0.1);
      });
    }, 100);

    return () => window.clearInterval(comboInterval);
  }, [gameState]);

  // ------------------------------------------
  // MAIN GAME LOOP (REQUEST ANIMATION FRAME)
  // ------------------------------------------
  useEffect(() => {
    const render = (time: number) => {
      const dt = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameIdRef.current = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrameIdRef.current = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      // 1. UPDATE BREATH & STAMINA
      if (isHoldingBreath && breathStamina > 0) {
        setBreathStamina((prev) => Math.max(0, prev - dt * 24));
        heartbeatTimerRef.current += dt;
        if (heartbeatTimerRef.current >= 0.75) {
          audio.playHeartbeat();
          heartbeatTimerRef.current = 0;
        }
      } else {
        if (isHoldingBreath && breathStamina <= 0) {
          setIsHoldingBreath(false);
        }
        setBreathStamina((prev) => Math.min(100, prev + dt * 18));
      }

      // 2. SCOPE POSITION WITH INERTIA & BREATH WOBBLE
      breatheTimeRef.current += dt;
      const bTime = breatheTimeRef.current;

      // Breathing wobble: Lissajous curve, dampened by 85% when holding breath
      const wobbleFactor = isHoldingBreath ? 0.15 : (breathStamina <= 5 ? 1.8 : 1.0);
      const swayX = (Math.sin(bTime * 1.3) * 6 + Math.cos(bTime * 2.7) * 2.5) * wobbleFactor;
      const swayY = (Math.cos(bTime * 1.0) * 4 + Math.sin(bTime * 1.9) * 2.0) * wobbleFactor;

      // Recoil recovery
      recoilRef.current.x *= 0.88;
      recoilRef.current.y *= 0.86;
      recoilRef.current.flash = Math.max(0, recoilRef.current.flash - dt * 4.5);

      // Smooth inertia lerp towards mouse
      const targetScopeX = mousePosRef.current.x + swayX + recoilRef.current.x;
      const targetScopeY = mousePosRef.current.y + swayY + recoilRef.current.y;

      scopePosRef.current.x += (targetScopeX - scopePosRef.current.x) * 0.18;
      scopePosRef.current.y += (targetScopeY - scopePosRef.current.y) * 0.18;

      const scopeX = scopePosRef.current.x;
      const scopeY = scopePosRef.current.y;

      // 3. UPDATE TARGETS (PATROL, RUN, COLLAPSE)
      const targets = targetsRef.current;
      let closestTargetUnderScope: TargetEntity | null = null;
      let minCrosshairDist = 65; // Lock-on threshold radius

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.isDead) {
          t.deathTimer += dt;
          continue;
        }

        // Runner movement
        if (t.type === 'RUNNER') {
          t.x += t.speed * t.direction * 55 * dt;
          if (t.x >= t.maxX) {
            t.x = t.maxX;
            t.direction = -1;
          } else if (t.x <= t.minX) {
            t.x = t.minX;
            t.direction = 1;
          }
        } else if (t.type === 'WINDOW') {
          t.peekTimer += dt;
          if (t.peekTimer > 4.5) {
            t.isPeeking = !t.isPeeking;
            t.peekTimer = 0;
          }
        } else {
          // Rooftop guard subtle scanning step
          t.x += t.speed * t.direction * 12 * dt;
          if (t.x >= t.maxX) {
            t.direction = -1;
          } else if (t.x <= t.minX) {
            t.direction = 1;
          }
        }

        // Check if under scope crosshair
        const distToScope = Math.hypot(scopeX - t.x, scopeY - (t.y - t.height / 2));
        if (distToScope < minCrosshairDist) {
          minCrosshairDist = distToScope;
          closestTargetUnderScope = t;
        }
      }
      lockTargetIdRef.current = closestTargetUnderScope ? closestTargetUnderScope.id : null;

      // 4. DRAW ENVIRONMENT
      ctx.clearRect(0, 0, width, height);

      // Sky gradient
      let skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (opticMode === 'THERMAL') {
        skyGrad.addColorStop(0, '#050510');
        skyGrad.addColorStop(1, '#0a1025');
      } else if (opticMode === 'NIGHT_VISION') {
        skyGrad.addColorStop(0, '#021208');
        skyGrad.addColorStop(1, '#052912');
      } else {
        skyGrad.addColorStop(0, '#050813');
        skyGrad.addColorStop(0.55, '#0b1324');
        skyGrad.addColorStop(1, '#0f1a30');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Stars in sky
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let s = 0; s < 40; s++) {
        const starX = ((s * 197) % width);
        const starY = ((s * 113) % (height * 0.45));
        ctx.fillRect(starX, starY, 1.5, 1.5);
      }

      // Distant neon billboard glow
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00f0ff';
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fillRect(width * 0.2, height * 0.22, 140, 45);
      ctx.restore();

      // Render procedural cityscape buildings
      const buildings = cityscapeRef.current;
      for (let b = 0; b < buildings.length; b++) {
        const bg = buildings[b];
        ctx.save();

        if (bg.layer === 0) {
          // Distant layer
          ctx.fillStyle = opticMode === 'THERMAL' ? '#0d1527' : opticMode === 'NIGHT_VISION' ? '#072410' : '#080d1a';
          ctx.fillRect(bg.x, bg.y, bg.width, bg.height);

          // Red beacon lights atop high antennas
          if (bg.hasAntenna) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bg.x + bg.width / 2, bg.y);
            ctx.lineTo(bg.x + bg.width / 2, bg.y - 25);
            ctx.stroke();

            // Blinking hazard light
            if (Math.floor(bTime * 2) % 2 === 0) {
              ctx.fillStyle = '#ef4444';
              ctx.beginPath();
              ctx.arc(bg.x + bg.width / 2, bg.y - 25, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (bg.layer === 1) {
          // Midground layer
          ctx.fillStyle = opticMode === 'THERMAL' ? '#141d33' : opticMode === 'NIGHT_VISION' ? '#0d381c' : '#0c1629';
          ctx.fillRect(bg.x, bg.y, bg.width, bg.height);

          // Roof parapet line
          ctx.strokeStyle = opticMode === 'THERMAL' ? '#213054' : opticMode === 'NIGHT_VISION' ? '#14532d' : '#1e293b';
          ctx.lineWidth = 2;
          ctx.strokeRect(bg.x, bg.y, bg.width, bg.height);

          // Windows
          for (let w = 0; w < bg.windows.length; w++) {
            const win = bg.windows[w];
            if (opticMode === 'THERMAL') {
              ctx.fillStyle = win.lit ? '#3b82f6' : '#0a0f1d';
            } else if (opticMode === 'NIGHT_VISION') {
              ctx.fillStyle = win.lit ? '#4ade80' : '#052e16';
            } else {
              ctx.fillStyle = win.lit ? win.color : '#070b14';
            }
            ctx.fillRect(win.x, win.y, win.w, win.h);
          }

          // Rooftop water tower
          if (bg.hasWaterTower) {
            const tx = bg.x + 20;
            const ty = bg.y - 30;
            ctx.fillStyle = opticMode === 'THERMAL' ? '#1a243d' : opticMode === 'NIGHT_VISION' ? '#14532d' : '#1e293b';
            ctx.fillRect(tx, ty, 24, 25);
            // Stand legs
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tx + 2, ty + 25);
            ctx.lineTo(tx - 2, bg.y);
            ctx.moveTo(tx + 22, ty + 25);
            ctx.lineTo(tx + 26, bg.y);
            ctx.stroke();
          }
        } else {
          // Foreground layer
          ctx.fillStyle = opticMode === 'THERMAL' ? '#192644' : opticMode === 'NIGHT_VISION' ? '#114a24' : '#0f172a';
          ctx.fillRect(bg.x, bg.y, bg.width, bg.height);

          // Architectural trim
          ctx.strokeStyle = opticMode === 'THERMAL' ? '#2d4375' : opticMode === 'NIGHT_VISION' ? '#15803d' : '#334155';
          ctx.lineWidth = 2;
          ctx.strokeRect(bg.x, bg.y, bg.width, bg.height);

          // Windows
          for (let w = 0; w < bg.windows.length; w++) {
            const win = bg.windows[w];
            if (opticMode === 'THERMAL') {
              ctx.fillStyle = win.lit ? '#00f0ff' : '#090d16';
            } else if (opticMode === 'NIGHT_VISION') {
              ctx.fillStyle = win.lit ? '#86efac' : '#064e3b';
            } else {
              ctx.fillStyle = win.lit ? 'rgba(0, 240, 255, 0.4)' : '#070b14';
            }
            ctx.fillRect(win.x, win.y, win.w, win.h);
          }

          // AC condenser unit
          if (bg.hasAcUnit) {
            const ax = bg.x + bg.width - 45;
            const ay = bg.y - 18;
            ctx.fillStyle = opticMode === 'THERMAL' ? '#293a5e' : opticMode === 'NIGHT_VISION' ? '#166534' : '#1e293b';
            ctx.fillRect(ax, ay, 28, 18);
            // Grill lines
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax + 5, ay + 6);
            ctx.lineTo(ax + 23, ay + 6);
            ctx.moveTo(ax + 5, ay + 12);
            ctx.lineTo(ax + 23, ay + 12);
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // 5. DRAW TARGET ENTITIES (SILHOUETTES)
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.isDead && t.deathTimer > 2.0) continue;

        ctx.save();

        // Calculate opacity if collapsing
        let targetAlpha = 1.0;
        if (t.isDead) {
          targetAlpha = Math.max(0, 1.0 - t.deathTimer / 1.8);
        }
        ctx.globalAlpha = targetAlpha;

        const isCommander = t.type === 'COMMANDER';
        let bodyColor = '#020617'; // Deep dark silhouette
        let headColor = '#020617';

        if (opticMode === 'THERMAL') {
          // Heat signature: bright amber / hot orange / white core
          bodyColor = isCommander ? '#f43f5e' : '#f97316';
          headColor = '#fef08a';
        } else if (opticMode === 'NIGHT_VISION') {
          bodyColor = '#22c55e';
          headColor = '#86efac';
        }

        // Draw shadow on rooftop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 2, t.width * 0.7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Target body collapse / fall animation
        ctx.translate(t.x, t.y);
        if (t.isDead) {
          const slumpAngle = (t.direction || 1) * Math.min(1.4, t.deathTimer * 3.5);
          ctx.rotate(slumpAngle);
        }

        // 1. Torso
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-t.width / 2, -t.height * 0.75, t.width, t.height * 0.75);

        // 2. Head (Headshot target box)
        const headRadius = t.width * 0.4;
        ctx.beginPath();
        ctx.arc(0, -t.height + headRadius, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Rifle in hands (tactical silhouette)
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -t.height * 0.55);
        ctx.lineTo(t.direction * (t.width * 1.1), -t.height * 0.6);
        ctx.stroke();

        // 4. Legs / Running animation
        if (t.type === 'RUNNER' && !t.isDead) {
          const runPhase = Math.sin(bTime * 14);
          ctx.beginPath();
          ctx.moveTo(-t.width * 0.25, 0);
          ctx.lineTo(-t.width * 0.25 + runPhase * 8, 4);
          ctx.moveTo(t.width * 0.25, 0);
          ctx.lineTo(t.width * 0.25 - runPhase * 8, 4);
          ctx.stroke();
        }

        // 5. Thermal core glow
        if (opticMode === 'THERMAL') {
          ctx.shadowColor = '#fb923c';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-t.width * 0.25, -t.height * 0.65, t.width * 0.5, t.height * 0.35);
        }

        ctx.restore();
      }

      // 6. DRAW PARTICLES & SPARK FX
      const particles = particlesRef.current;
      for (let p = particles.length - 1; p >= 0; p--) {
        const pt = particles[p];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          particles.splice(p, 1);
          continue;
        }

        pt.x += pt.vx * 60 * dt;
        pt.y += pt.vy * 60 * dt;
        pt.vy += 9.8 * 12 * dt; // gravity

        const pAlpha = 1.0 - pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = pAlpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 7. DRAW FLOATING COMBAT TEXT
      const floatingTexts = floatingTextsRef.current;
      for (let f = floatingTexts.length - 1; f >= 0; f--) {
        const ft = floatingTexts[f];
        ft.life += dt;
        if (ft.life >= 1.6) {
          floatingTexts.splice(f, 1);
          continue;
        }

        ft.y -= 38 * dt; // float upwards
        ft.alpha = Math.max(0, 1.0 - ft.life / 1.6);

        ctx.save();
        ctx.font = '700 16px "Rajdhani", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = ft.alpha;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // 8. SCOPE MASKING & REALISTIC APERTURE VIGNETTE
      const scopeRadius = Math.min(width, height) * 0.38;

      ctx.save();
      // Cut circular aperture hole in black peripheral vignette
      ctx.fillStyle = 'rgba(4, 7, 13, 0.96)';

      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.arc(scopeX, scopeY, scopeRadius, 0, Math.PI * 2, true);
      ctx.fill();

      // Outer bezel ring of scope
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, scopeRadius + 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, scopeRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner lens chromatic vignette
      const innerVignette = ctx.createRadialGradient(
        scopeX,
        scopeY,
        scopeRadius * 0.65,
        scopeX,
        scopeY,
        scopeRadius
      );
      innerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      innerVignette.addColorStop(0.85, 'rgba(0, 15, 30, 0.2)');
      innerVignette.addColorStop(1, 'rgba(0, 240, 255, 0.25)');
      ctx.fillStyle = innerVignette;
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, scopeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 9. SCOPE RETICLE (MIL-DOT SYSTEM & STADIAMETRIC RANGEFINDER)
      ctx.save();
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, scopeRadius, 0, Math.PI * 2);
      ctx.clip(); // Keep all reticle markings inside lens

      const reticleColor = opticMode === 'THERMAL' ? 'rgba(254, 240, 138, 0.9)' : opticMode === 'NIGHT_VISION' ? 'rgba(74, 222, 128, 0.9)' : 'rgba(0, 240, 255, 0.85)';
      ctx.strokeStyle = reticleColor;
      ctx.fillStyle = reticleColor;
      ctx.lineWidth = 1.2;

      // Center crosshair lines
      // Horizontal bar
      ctx.beginPath();
      ctx.moveTo(scopeX - scopeRadius, scopeY);
      ctx.lineTo(scopeX - 18, scopeY);
      ctx.moveTo(scopeX + 18, scopeY);
      ctx.lineTo(scopeX + scopeRadius, scopeY);

      // Vertical bar
      ctx.moveTo(scopeX, scopeY - scopeRadius);
      ctx.lineTo(scopeX, scopeY - 18);
      ctx.moveTo(scopeX, scopeY + 18);
      ctx.lineTo(scopeX, scopeY + scopeRadius);
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Mil-Dot ticks on horizontal bar (Each dot = 5 km/h wind holdover)
      const milSpacing = 28; // pixels per mil
      for (let m = 1; m <= 6; m++) {
        // Right dots
        ctx.beginPath();
        ctx.arc(scopeX + m * milSpacing, scopeY, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Left dots
        ctx.beginPath();
        ctx.arc(scopeX - m * milSpacing, scopeY, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Vertical mil marks
        ctx.beginPath();
        ctx.arc(scopeX, scopeY + m * milSpacing, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(scopeX, scopeY - m * milSpacing, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wind compensation marker (shows where bullet will hit if wind is active)
      const dist300Factor = 1.0;
      const expectedWindDrift = currentLevel.windSpeed * dist300Factor * 2.2;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scopeX + expectedWindDrift, scopeY - 12);
      ctx.lineTo(scopeX + expectedWindDrift, scopeY + 12);
      ctx.stroke();
      ctx.setLineDash([]);

      // Elevation bullet drop ladder marks on bottom post
      for (let d = 1; d <= 4; d++) {
        const barWidth = 14 + d * 6;
        ctx.beginPath();
        ctx.moveTo(scopeX - barWidth / 2, scopeY + d * 32);
        ctx.lineTo(scopeX + barWidth / 2, scopeY + d * 32);
        ctx.stroke();
      }

      // In-scope Target Recognition Bracket
      if (closestTargetUnderScope) {
        const t = closestTargetUnderScope;
        const tgtDist = Math.hypot(scopeX - t.x, scopeY - (t.y - t.height / 2));
        if (tgtDist < scopeRadius * 0.9) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;

          const boxX = t.x - t.width / 2 - 8;
          const boxY = t.y - t.height - 8;
          const boxW = t.width + 16;
          const boxH = t.height + 14;

          // Corner brackets
          const clen = 6;
          ctx.beginPath();
          // Top-left
          ctx.moveTo(boxX, boxY + clen);
          ctx.lineTo(boxX, boxY);
          ctx.lineTo(boxX + clen, boxY);
          // Top-right
          ctx.moveTo(boxX + boxW - clen, boxY);
          ctx.lineTo(boxX + boxW, boxY);
          ctx.lineTo(boxX + boxW, boxY + clen);
          // Bottom-left
          ctx.moveTo(boxX, boxY + boxH - clen);
          ctx.lineTo(boxX, boxY + boxH);
          ctx.lineTo(boxX + clen, boxY + boxH);
          // Bottom-right
          ctx.moveTo(boxX + boxW - clen, boxY + boxH);
          ctx.lineTo(boxX + boxW, boxY + boxH);
          ctx.lineTo(boxX + boxW, boxY + boxH - clen);
          ctx.stroke();

          // Distance and threat telemetry label
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#ef4444';
          ctx.textAlign = 'left';
          ctx.fillText(`DIST: ${t.distance}m`, boxX, boxY - 4);
          ctx.fillText(`THREAT: ${t.type}`, boxX, boxY + boxH + 13);
        }
      }

      // Hitmarker feedback ticks (X-shape)
      if (hitmarkerRef.current.alpha > 0.01) {
        hitmarkerRef.current.alpha -= dt * 3.5;
        const hmAlpha = hitmarkerRef.current.alpha;
        const hmColor = hitmarkerRef.current.isHeadshot ? `rgba(245, 158, 11, ${hmAlpha})` : `rgba(239, 68, 68, ${hmAlpha})`;
        ctx.strokeStyle = hmColor;
        ctx.lineWidth = hitmarkerRef.current.isHeadshot ? 2.5 : 2;

        const hmSize = hitmarkerRef.current.isHeadshot ? 16 : 12;
        const hmGap = 6;

        ctx.beginPath();
        // Top-left
        ctx.moveTo(scopeX - hmGap, scopeY - hmGap);
        ctx.lineTo(scopeX - hmSize, scopeY - hmSize);
        // Top-right
        ctx.moveTo(scopeX + hmGap, scopeY - hmGap);
        ctx.lineTo(scopeX + hmSize, scopeY - hmSize);
        // Bottom-left
        ctx.moveTo(scopeX - hmGap, scopeY + hmGap);
        ctx.lineTo(scopeX - hmSize, scopeY + hmSize);
        // Bottom-right
        ctx.moveTo(scopeX + hmGap, scopeY + hmGap);
        ctx.lineTo(scopeX + hmSize, scopeY + hmSize);
        ctx.stroke();
      }

      ctx.restore();

      // 10. MUZZLE FLASH OVERLAY
      if (recoilRef.current.flash > 0.02) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 240, 200, ${recoilRef.current.flash * 0.45})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [opticMode, isHoldingBreath, breathStamina, currentLevel]);

  // Total targets eliminated in level calculation
  const eliminatedInLevel = targetsRef.current.filter((t) => t.isDead).length;
  const totalInLevel = currentLevel.targetCount;

  // Accuracy calculation
  const accuracy = totalShots > 0 ? Math.round((totalKills / totalShots) * 100) : 0;

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#070a12] text-slate-100 font-sans">
      {/* 1. MAIN INTERACTIVE CANVAS */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleShoot}
        className="absolute inset-0 w-full h-full cursor-none z-0"
      />

      {/* 2. TOP HUD: MODERN HIGH-TECH GLASS PANELS */}
      <div className="absolute top-4 left-0 right-0 px-6 z-20 pointer-events-none flex justify-between items-start gap-4">
        {/* Left: Sector Codename & Score */}
        <div className="flex items-center gap-3">
          <div className="tactical-glass tactical-corner px-4 py-2.5 rounded-lg flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <div className="text-[10px] tracking-widest text-cyan-400/80 font-mono font-semibold uppercase">
                {currentLevel.sectorName} · {currentLevel.codename}
              </div>
              <div className="text-xl font-bold font-tactical text-slate-100 tracking-wider">
                SCORE <span className="text-cyan-400 font-mono tabular-nums">{score.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Combo Multiplier */}
          {combo > 1 && (
            <div className="tactical-glass-amber tactical-corner px-3.5 py-2 rounded-lg flex items-center gap-2 animate-bounce">
              <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
              <div>
                <div className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">COMBO</div>
                <div className="text-lg font-bold font-tactical text-amber-300 leading-none">
                  {combo}X
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Mission Countdown & Target Status */}
        <div className="flex items-center gap-4">
          {/* Mission Timer */}
          <div className={`tactical-glass tactical-corner px-4 py-2 rounded-lg flex items-center gap-2.5 ${timeLeft <= 10 ? 'border-red-500/50 bg-red-950/40 text-red-400 animate-pulse' : ''}`}>
            <Clock className={`w-4 h-4 ${timeLeft <= 10 ? 'text-red-400' : 'text-cyan-400'}`} />
            <div>
              <div className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">MISSION TIMER</div>
              <div className="text-xl font-bold font-mono tabular-nums tracking-wider">
                00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
              </div>
            </div>
          </div>

          {/* Targets Counter */}
          <div className="tactical-glass tactical-corner px-4 py-2 rounded-lg flex items-center gap-2.5">
            <Target className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">TARGETS DOWN</div>
              <div className="text-lg font-bold font-tactical text-slate-100">
                <span className="text-cyan-400 font-mono tabular-nums">{eliminatedInLevel}</span> / {totalInLevel}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Wind Gauge & Audio Controls */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Wind Gauge Indicator */}
          <div className="tactical-glass tactical-corner px-4 py-2 rounded-lg flex items-center gap-3">
            <Wind className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-[9px] font-mono tracking-widest text-cyan-400/80 uppercase">WIND DEFLECTION</div>
              <div className="text-sm font-bold font-mono tracking-wider flex items-center gap-1.5 text-slate-100">
                <span>{Math.abs(currentLevel.windSpeed)} KM/H</span>
                <span className="text-amber-400 font-bold">
                  {currentLevel.windSpeed > 0 ? '→ (EAST)' : currentLevel.windSpeed < 0 ? '← (WEST)' : 'CALM'}
                </span>
              </div>
            </div>
          </div>

          {/* Optic Mode Switcher */}
          <button
            onClick={() => {
              setOpticMode((prev) => {
                if (prev === 'TACTICAL') return 'THERMAL';
                if (prev === 'THERMAL') return 'NIGHT_VISION';
                return 'TACTICAL';
              });
            }}
            className="tactical-glass px-3 py-2 rounded-lg text-xs font-mono font-medium hover:border-cyan-400/50 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
            title="Toggle Optic Mode [N]"
          >
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">{opticMode}</span>
          </button>

          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className="tactical-glass p-2.5 rounded-lg text-slate-300 hover:text-cyan-400 transition-colors"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Pause Button */}
          <button
            onClick={() => setGameState((prev) => (prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev))}
            className="tactical-glass p-2.5 rounded-lg text-slate-300 hover:text-cyan-400 transition-colors"
            title="Pause [P / ESC]"
          >
            {gameState === 'PAUSED' ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* 3. BOTTOM CONTROL DECK: AMMO STATUS, RELOAD [R], HOLD BREATH STAMINA */}
      <div className="absolute bottom-5 left-0 right-0 px-8 z-20 pointer-events-none flex justify-between items-end gap-6">
        {/* Left: Steady Breath Stamina Gauge */}
        <div className="tactical-glass tactical-corner p-3.5 rounded-lg w-64 pointer-events-auto">
          <div className="flex justify-between items-center mb-1 text-[11px] font-mono">
            <span className="text-slate-400">HOLD BREATH [SHIFT]</span>
            <span className={`font-bold ${isHoldingBreath ? 'text-amber-400' : 'text-cyan-400'}`}>
              {Math.round(breathStamina)}%
            </span>
          </div>
          <div className="w-full bg-slate-900/80 rounded h-2 overflow-hidden p-0.5 border border-slate-700/60">
            <div
              className={`h-full rounded transition-all duration-75 ${
                isHoldingBreath
                  ? 'bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-r from-cyan-600 to-cyan-400'
              }`}
              style={{ width: `${breathStamina}%` }}
            />
          </div>
          <div className="mt-1.5 text-[9px] text-slate-400 font-mono tracking-tight flex items-center justify-between">
            <span>STABILIZES RETICLE SWAY</span>
            <span>{isHoldingBreath ? 'FOCUSED' : 'READY'}</span>
          </div>
        </div>

        {/* Center: Progress & Mil-dot Wind Guidance Note */}
        <div className="hidden md:flex flex-col items-center text-center">
          <div className="text-[10px] font-mono tracking-widest text-slate-400 bg-slate-900/70 px-3 py-1 rounded border border-slate-800/80 mb-2">
            TACTICAL NOTE: EACH MIL-DOT = 5 KM/H WIND COMPENSATION
          </div>
          {/* Target Progress Dots */}
          <div className="flex gap-2">
            {targetsRef.current.map((t, idx) => (
              <div
                key={t.id}
                className={`w-3 h-3 rounded-full border transition-all ${
                  t.isDead
                    ? 'bg-red-500 border-red-400 shadow-[0_0_6px_rgba(239,68,68,0.7)]'
                    : 'bg-slate-800 border-slate-600'
                }`}
                title={`Target #${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Right: Ammo Cartridges & Reload Button */}
        <div className="tactical-glass tactical-corner p-3.5 rounded-lg flex items-center gap-5 pointer-events-auto">
          {/* Cartridges Visual */}
          <div>
            <div className="text-[10px] font-mono tracking-widest text-slate-400 mb-1 flex justify-between">
              <span>MAGAZINE</span>
              <span className="font-bold text-cyan-400">{ammo} / 5</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => {
                const isLoaded = i < ammo;
                return (
                  <div
                    key={i}
                    className={`w-3.5 h-8 rounded-sm border transition-all ${
                      isLoaded
                        ? 'bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-slate-900/60 border-slate-700/50 opacity-40'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Reload Action Button */}
          <button
            onClick={triggerReload}
            disabled={isReloading || ammo === 5}
            className={`px-4 py-2.5 rounded-md font-mono text-xs font-bold tracking-wider transition-all flex items-center gap-2 border ${
              isReloading
                ? 'bg-amber-950/50 border-amber-500/50 text-amber-300 cursor-wait'
                : ammo === 0
                ? 'bg-red-900/60 border-red-500 text-red-200 animate-pulse hover:bg-red-800'
                : ammo === 5
                ? 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 hover:border-cyan-400'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
            <span>{isReloading ? `RELOADING ${reloadProgress}%` : 'RELOAD [R]'}</span>
          </button>
        </div>
      </div>

      {/* 4. TITLE / MISSION BRIEFING MODAL */}
      {gameState === 'BRIEFING' && (
        <div className="absolute inset-0 bg-[#060913]/90 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="tactical-glass tactical-corner max-w-xl w-full p-8 rounded-xl border border-cyan-500/30 text-left relative overflow-hidden shadow-2xl">
            {/* Top banner */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                <Crosshair className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs font-mono font-semibold tracking-widest text-cyan-400 uppercase">
                  CLASSIFIED TACTICAL ENGAGEMENT
                </div>
                <h1 className="text-3xl font-extrabold font-tactical tracking-wide text-white">
                  STRIKEPOINT: TACTICAL SNIPER
                </h1>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Take the perch as an elite black-ops sniper operative. Neutralize syndicate targets across five high-threat urban rooftops using precision mil-dot scope optics and wind deflection calculations.
            </p>

            {/* Mechanics briefing cards */}
            <div className="grid grid-cols-2 gap-3 mb-6 text-xs font-mono">
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5" /> WIND DEFLECTION
                </div>
                <div className="text-slate-400 text-[11px] leading-tight">
                  Bullets drift in crosswind. Offset aim using the scope mil-dots (each dot ≈ 5 km/h).
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" /> STEADY AIM
                </div>
                <div className="text-slate-400 text-[11px] leading-tight">
                  Press [SHIFT] or [SPACE] to hold breath and stabilize reticle breathing sway.
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> BOLT RELOAD [R]
                </div>
                <div className="text-slate-400 text-[11px] leading-tight">
                  5 rounds per magazine. Press R to rack the bolt when low or empty.
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" /> HEADSHOT & COMBO
                </div>
                <div className="text-slate-400 text-[11px] leading-tight">
                  Instant headshot kills award 2.5x score and boost your active combo multiplier!
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={() => startLevel(0)}
              className="w-full py-3.5 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-tactical font-bold text-lg tracking-widest transition-all shadow-[0_0_24px_rgba(0,240,255,0.4)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>COMMENCE MISSION</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 5. LEVEL COMPLETE MODAL */}
      {gameState === 'LEVEL_COMPLETE' && (
        <div className="absolute inset-0 bg-[#060913]/90 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="tactical-glass tactical-corner max-w-md w-full p-8 rounded-xl border border-cyan-500/40 text-center relative shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center mx-auto mb-3 text-cyan-400">
              <Award className="w-8 h-8" />
            </div>

            <div className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
              SECTOR CLEARED
            </div>
            <h2 className="text-2xl font-bold font-tactical text-white mb-4">
              {currentLevel.codename}
            </h2>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2.5 mb-6 text-center">
              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded">
                <div className="text-[10px] text-slate-400 font-mono">ACCURACY</div>
                <div className="text-lg font-bold font-mono text-cyan-400">{accuracy}%</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded">
                <div className="text-[10px] text-slate-400 font-mono">HEADSHOTS</div>
                <div className="text-lg font-bold font-mono text-amber-400">{totalHeadshots}</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded">
                <div className="text-[10px] text-slate-400 font-mono">TOTAL SCORE</div>
                <div className="text-lg font-bold font-mono text-white">{score.toLocaleString()}</div>
              </div>
            </div>

            <button
              onClick={() => startLevel(currentLevelIndex + 1)}
              className="w-full py-3 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-tactical font-bold text-base tracking-wider transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>ADVANCE TO NEXT SECTOR</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 6. CAMPAIGN VICTORY MODAL */}
      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 bg-[#060913]/95 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="tactical-glass tactical-corner max-w-lg w-full p-8 rounded-xl border border-amber-500/40 text-center relative shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto mb-3 text-amber-400">
              <Award className="w-10 h-10 animate-bounce" />
            </div>

            <div className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
              CAMPAIGN ACCOMPLISHED
            </div>
            <h2 className="text-3xl font-extrabold font-tactical text-white mb-2">
              ALL SECTORS SECURED
            </h2>
            <p className="text-xs text-slate-300 font-mono mb-6">
              Syndicate command neutralized. You have proven elite sniper marksmanship.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 text-left font-mono text-xs">
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-slate-400">FINAL CAMPAIGN SCORE</div>
                <div className="text-2xl font-bold text-amber-400 font-mono">{score.toLocaleString()}</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-slate-400">ALL-TIME HIGH SCORE</div>
                <div className="text-2xl font-bold text-cyan-400 font-mono">{highScore.toLocaleString()}</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-slate-400">BALLISTIC ACCURACY</div>
                <div className="text-xl font-bold text-white font-mono">{accuracy}%</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded">
                <div className="text-slate-400">TOTAL HEADSHOTS</div>
                <div className="text-xl font-bold text-amber-300 font-mono">{totalHeadshots}</div>
              </div>
            </div>

            <button
              onClick={() => {
                setScore(0);
                setTotalKills(0);
                setTotalHeadshots(0);
                setTotalShots(0);
                startLevel(0);
              }}
              className="w-full py-3.5 px-6 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-tactical font-bold text-lg tracking-widest transition-all shadow-[0_0_24px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>REPLAY CAMPAIGN</span>
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 7. GAME OVER / MISSION FAILED MODAL */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 bg-[#060913]/90 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="tactical-glass tactical-corner max-w-md w-full p-8 rounded-xl border border-red-500/40 text-center relative shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-950/80 border border-red-500/50 flex items-center justify-center mx-auto mb-3 text-red-400">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>

            <div className="text-xs font-mono font-bold tracking-widest text-red-400 uppercase">
              MISSION COMPROMISED
            </div>
            <h2 className="text-2xl font-bold font-tactical text-white mb-2">
              HOSTILES ESCAPED
            </h2>
            <p className="text-xs text-slate-400 font-mono mb-6">
              {timeLeft <= 0 ? 'Mission clock expired before all targets were eliminated.' : 'Ammunition depleted or objective failed.'}
            </p>

            <button
              onClick={() => startLevel(currentLevelIndex)}
              className="w-full py-3 px-6 rounded-lg bg-red-600 hover:bg-red-500 text-white font-tactical font-bold text-base tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
              <span>RETRY SECTOR</span>
            </button>
          </div>
        </div>
      )}

      {/* 8. PAUSED MODAL */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 bg-[#060913]/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="tactical-glass tactical-corner max-w-sm w-full p-6 rounded-xl border border-cyan-500/30 text-center shadow-2xl">
            <h2 className="text-2xl font-bold font-tactical text-white mb-2">TACTICAL PAUSE</h2>
            <p className="text-xs text-slate-400 font-mono mb-6">Simulation halted. Adjust optic or resume.</p>

            <div className="space-y-3">
              <button
                onClick={() => setGameState('PLAYING')}
                className="w-full py-2.5 px-4 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-tactical tracking-wider cursor-pointer"
              >
                RESUME MISSION
              </button>
              <button
                onClick={() => startLevel(currentLevelIndex)}
                className="w-full py-2.5 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs cursor-pointer"
              >
                RESTART SECTOR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
