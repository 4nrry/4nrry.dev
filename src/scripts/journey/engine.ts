import { MeasureBatch, type DocRect } from './geometry';
import { drawPacket } from './sprites';

export type JourneyMode = 'full' | 'static';

export interface Viewport {
  w: number;
  h: number;
  contentLeft: number;
  spineX: number;
  mode: 'gutter' | 'edge';
}

export interface FrameContext {
  ctx: CanvasRenderingContext2D;
  scrollY: number;
  vp: Viewport;
  packetDocY: number;
  born: boolean;
  colors: JourneyColors;
  debug: boolean;
  toViewportY(docY: number): number;
}

export interface JourneyColors {
  accent: string;
  bright: string;
  faint: string;
  muted: string;
}

export interface Scene {
  id: string;
  resolve(): Element | null;
  span(rect: DocRect, batch: MeasureBatch): { startY: number; endY: number };
  measure(element: Element, rect: DocRect, batch: MeasureBatch): unknown | null;
  /** While the packet is inside this scene, the scene draws the packet itself. */
  ownsPacket?: boolean;
  draw(frame: FrameContext, local: number, geo: unknown, rect: DocRect): void;
}

export interface Segment {
  scene: Scene;
  startY: number;
  endY: number;
  rect: DocRect;
  geo: unknown;
}

export interface JourneyStats {
  frames: number;
  avgDrawMs: number;
  recomputes: number;
}

interface EmitterGeo {
  emitY: number;
}
interface TerminusGeo {
  dockY: number;
}

const LERP = 0.16;
const SETTLE_PX = 0.1;
const PACKET_ANCHOR = 0.55;

export class JourneyEngine {
  readonly stats: JourneyStats = { frames: 0, avgDrawMs: 0, recomputes: 0 };
  segments: Segment[] = [];
  vp: Viewport = { w: 0, h: 0, contentLeft: 0, spineX: 12, mode: 'edge' };

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private colors: JourneyColors = { accent: '#d97706', bright: '#ffb224', faint: '#52525b', muted: '#a1a1aa' };
  private target = 0;
  private displayed = 0;
  private running = false;
  private rafId = 0;
  private recomputeQueued = false;
  private emitY = 0;
  private terminusY = 0;
  private docHeight = 0;
  private staticRedrawQueued = false;

  constructor(
    private scenes: Scene[],
    readonly mode: JourneyMode,
    readonly debug: boolean,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'journey-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.sizeCanvas();

    this.target = this.clampScroll(window.scrollY);
    this.displayed = this.target;

    window.addEventListener(
      'scroll',
      () => {
        this.target = this.clampScroll(window.scrollY);
        if (this.mode === 'static') this.queueStaticRedraw();
        else this.ensureRunning();
      },
      { passive: true },
    );
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.displayed = this.target;
        this.drawFrame();
      }
    });
  }

  get running_(): boolean {
    return this.running;
  }
  get state() {
    return {
      mode: this.mode,
      target: this.target,
      displayed: this.displayed,
      running: this.running,
      emitY: this.emitY,
      terminusY: this.terminusY,
      vp: this.vp,
    };
  }

  packetAt(scrollY: number): number {
    return Math.min(this.clampScroll(scrollY) + PACKET_ANCHOR * this.vp.h, this.terminusY || Infinity);
  }

  private clampScroll(y: number): number {
    const max = Math.max(0, this.docHeight - this.vp.h);
    return Math.min(Math.max(y, 0), max || y);
  }

  sizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  scheduleRecompute(): void {
    if (this.recomputeQueued) return;
    this.recomputeQueued = true;
    const run = () => {
      this.recomputeQueued = false;
      this.recompute();
    };
    // rAF never fires in hidden tabs; fall back to a timer so geometry stays
    // fresh (and the debounce flag can never wedge) while backgrounded.
    if (document.visibilityState === 'hidden') setTimeout(run, 60);
    else requestAnimationFrame(run);
  }

  /** One batched read pass; the only place DOM geometry is touched. */
  recompute(): void {
    const batch = new MeasureBatch();
    this.docHeight = batch.docHeight;

    const root = document.documentElement;
    const style = getComputedStyle(root);
    this.colors = {
      accent: style.getPropertyValue('--color-accent').trim() || '#d97706',
      bright: style.getPropertyValue('--color-accent-bright').trim() || '#ffb224',
      faint: style.getPropertyValue('--color-faint').trim() || '#52525b',
      muted: style.getPropertyValue('--color-muted').trim() || '#a1a1aa',
    };

    const firstSection = this.scenes[0]?.resolve() ?? document.querySelector('main > *');
    const contentLeft = firstSection ? batch.rect(firstSection).left : 0;
    const gutter = contentLeft >= 72;
    this.vp = {
      w: batch.vpW,
      h: batch.vpH,
      contentLeft,
      spineX: gutter ? Math.min(Math.max(contentLeft * 0.5, 12), contentLeft - 24) : 12,
      mode: gutter ? 'gutter' : 'edge',
    };

    const segments: Segment[] = [];
    for (const scene of this.scenes) {
      const element = scene.resolve();
      if (!element) continue;
      const rect = batch.rect(element);
      const geo = scene.measure(element, rect, batch);
      if (geo === null) continue;
      const { startY, endY } = scene.span(rect, batch);
      segments.push({ scene, startY, endY, rect, geo });
    }
    segments.sort((a, b) => a.startY - b.startY);
    this.segments = segments;

    const emitter = segments.find((s) => s.scene.id === 'emitter');
    const terminus = segments.find((s) => s.scene.id === 'terminus');
    this.emitY = (emitter?.geo as EmitterGeo | undefined)?.emitY ?? segments[0]?.endY ?? 0;
    this.terminusY =
      (terminus?.geo as TerminusGeo | undefined)?.dockY ?? segments[segments.length - 1]?.endY ?? batch.docHeight;

    this.stats.recomputes += 1;
    this.target = this.clampScroll(window.scrollY);
    if (this.mode === 'static') this.queueStaticRedraw();
    else {
      this.displayed = this.target;
      this.drawFrame();
    }
  }

  private ensureRunning(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      this.displayed += (this.target - this.displayed) * LERP;
      if (Math.abs(this.target - this.displayed) < SETTLE_PX) {
        this.displayed = this.target;
        this.drawFrame();
        this.running = false;
        return;
      }
      this.drawFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private queueStaticRedraw(): void {
    if (this.staticRedrawQueued) return;
    this.staticRedrawQueued = true;
    const run = () => {
      this.staticRedrawQueued = false;
      this.displayed = this.target;
      this.drawFrame();
    };
    if (document.visibilityState === 'hidden') setTimeout(run, 60);
    else requestAnimationFrame(run);
  }

  private drawFrame(): void {
    const started = performance.now();
    const { ctx } = this;
    const scrollY = this.displayed;
    const vp = this.vp;
    ctx.clearRect(0, 0, vp.w, vp.h);

    const packetDocY =
      this.mode === 'static' ? this.terminusY : Math.min(scrollY + PACKET_ANCHOR * vp.h, this.terminusY);
    const born = this.mode === 'static' ? true : packetDocY >= this.emitY;
    const frame: FrameContext = {
      ctx,
      scrollY,
      vp,
      packetDocY,
      born,
      colors: this.colors,
      debug: this.debug,
      toViewportY: (docY: number) => docY - scrollY,
    };

    this.drawSpine(frame);

    const viewTop = scrollY - 100;
    const viewBottom = scrollY + vp.h + 100;
    let packetOwned = false;
    for (const segment of this.segments) {
      if (segment.rect.bottom < viewTop || segment.rect.top > viewBottom) continue;
      const local = Math.min(Math.max((packetDocY - segment.startY) / (segment.endY - segment.startY || 1), 0), 1);
      if (this.mode === 'full') {
        segment.scene.draw(frame, local, segment.geo, segment.rect);
        if (segment.scene.ownsPacket && local > 0 && local < 1) packetOwned = true;
      }
      if (this.debug) this.drawDebugSegment(frame, segment, local);
    }

    if (born && !packetOwned) {
      const y = frame.toViewportY(packetDocY);
      if (y > -20 && y < vp.h + 20) {
        drawPacket(ctx, vp.spineX, y, this.colors.accent, this.colors.bright, this.mode === 'static' ? 4 : 6);
      }
    }

    this.stats.frames += 1;
    const elapsed = performance.now() - started;
    this.stats.avgDrawMs = this.stats.avgDrawMs * 0.9 + elapsed * 0.1;
  }

  private drawSpine(frame: FrameContext): void {
    const { ctx, vp, scrollY } = frame;
    const spineTop = Math.max(this.emitY, scrollY - 100);
    const spineBottom = Math.min(this.terminusY, scrollY + vp.h + 100);
    if (spineBottom <= spineTop) return;

    const isStatic = this.mode === 'static';
    const traveledBottom = Math.min(frame.packetDocY, spineBottom);
    if (traveledBottom > spineTop && !isStatic) {
      ctx.strokeStyle = this.colors.accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(vp.spineX, frame.toViewportY(spineTop));
      ctx.lineTo(vp.spineX, frame.toViewportY(traveledBottom));
      ctx.stroke();
    }
    const aheadTop = isStatic ? spineTop : Math.max(traveledBottom, spineTop);
    if (spineBottom > aheadTop) {
      ctx.strokeStyle = this.colors.faint;
      ctx.globalAlpha = isStatic ? 0.25 : 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vp.spineX, frame.toViewportY(aheadTop));
      ctx.lineTo(vp.spineX, frame.toViewportY(spineBottom));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Station ticks.
    for (const segment of this.segments) {
      if (segment.startY < this.emitY) continue;
      const y = frame.toViewportY(segment.startY);
      if (y < -10 || y > vp.h + 10) continue;
      const passed = frame.packetDocY >= segment.startY && !isStatic;
      ctx.strokeStyle = passed ? this.colors.accent : this.colors.faint;
      ctx.globalAlpha = passed ? 0.9 : 0.45;
      ctx.lineWidth = passed ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(vp.spineX - 5, y);
      ctx.lineTo(vp.spineX + 5, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawDebugSegment(frame: FrameContext, segment: Segment, local: number): void {
    const { ctx, vp } = frame;
    const top = frame.toViewportY(segment.startY);
    const bottom = frame.toViewportY(segment.endY);
    ctx.save();
    ctx.strokeStyle = '#e11d48';
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(4, top, vp.w - 8, bottom - top);
    ctx.setLineDash([]);
    ctx.fillStyle = '#e11d48';
    ctx.font = '10px monospace';
    ctx.fillText(`${segment.scene.id} ${local.toFixed(2)} [${Math.round(segment.startY)}..${Math.round(segment.endY)}]`, 8, top + 12);
    ctx.restore();
  }
}
