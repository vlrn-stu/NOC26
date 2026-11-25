import {FrameState} from "ol/Map";
import ViewHint from "ol/ViewHint";
import {getTransform} from "ol/proj";
import LayerRenderer from "ol/renderer/Layer";
import {apply as applyTransform} from "ol/transform";
import {Subscription} from "rxjs";
import {GridData} from "../../data-types/grid-data";
import {Gradient} from "../../types/gradients.type";
import type {WindArrowLayer} from "./wind-arrow-layer";

/** Shortest and longest arrow, in CSS pixels, and the speed (m/s) that gets the longest. */
const MIN_LENGTH = 10;
const MAX_LENGTH = 34;
const FULL_LENGTH_SPEED = 15;

/**
 * Draws arrows on a regular screen grid with Canvas 2D, sampling the u and v grids at each point.
 * Fetches new data for the visible area whenever the map stops moving or the time changes.
 */
export class WindArrowLayerRenderer extends LayerRenderer<WindArrowLayer> {
    private readonly canvas = document.createElement("canvas");
    private readonly context: CanvasRenderingContext2D;
    private grids?: {u: GridData; v: GridData};
    private requestedKey?: string;
    private request?: Subscription;

    constructor(
        layer: WindArrowLayer,
        private readonly gradient: Gradient,
        private readonly spacing: number
    ) {
        super(layer);
        this.canvas.style.position = "absolute";
        this.canvas.style.left = "0";
        this.canvas.style.top = "0";
        this.canvas.style.pointerEvents = "none";
        this.context = this.canvas.getContext("2d")!;
    }

    /** Called by OpenLayers before every frame; returns whether there is anything to draw. */
    override prepareFrame(frameState: FrameState): boolean {
        const viewIsMoving =
            frameState.viewHints[ViewHint.ANIMATING] > 0 ||
            frameState.viewHints[ViewHint.INTERACTING] > 0;
        if (!viewIsMoving) {
            this.requestData(frameState);
        }
        return this.grids !== undefined;
    }

    /** Called by OpenLayers to draw the layer; returns the element that shows it. */
    override renderFrame(frameState: FrameState): HTMLElement {
        const [width, height] = frameState.size;
        const ratio = frameState.pixelRatio;
        if (
            this.canvas.width !== Math.round(width * ratio) ||
            this.canvas.height !== Math.round(height * ratio)
        ) {
            this.canvas.width = Math.round(width * ratio);
            this.canvas.height = Math.round(height * ratio);
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }
        this.canvas.style.opacity = String(frameState.layerStatesArray[frameState.layerIndex].opacity);

        const context = this.context;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        if (!this.grids) {
            return this.canvas;
        }
        const {u, v} = this.grids;
        const toLonLat = getTransform(frameState.viewState.projection, "EPSG:4326")!;
        const step = this.spacing;
        context.lineCap = "round";
        context.lineJoin = "round";

        for (let y = step / 2; y < height; y += step) {
            for (let x = step / 2; x < width; x += step) {
                const coordinate = applyTransform(frameState.pixelToCoordinateTransform, [x, y]);
                const [lon, lat] = toLonLat(coordinate);
                const east = u.valueAt(lon, lat);
                const north = v.valueAt(lon, lat);
                const speed = Math.hypot(east, north);
                if (Number.isNaN(speed) || speed < 0.2) {
                    continue;
                }
                // Map coordinates are east/north locally (Web Mercator is conformal), so the
                // pixel transform also turns the arrow with the view's rotation.
                const ahead = applyTransform(frameState.coordinateToPixelTransform, [
                    coordinate[0] + (east / speed) * frameState.viewState.resolution,
                    coordinate[1] + (north / speed) * frameState.viewState.resolution,
                ]);
                const angle = Math.atan2(ahead[1] - y, ahead[0] - x);
                const length =
                    MIN_LENGTH + (MAX_LENGTH - MIN_LENGTH) * Math.min(1, speed / FULL_LENGTH_SPEED);
                this.drawArrow(x, y, angle, length, this.color(speed));
            }
        }
        return this.canvas;
    }

    protected override disposeInternal(): void {
        this.request?.unsubscribe();
        super.disposeInternal();
    }

    /** An arrow centred on (x, y), pointing along `angle`, with a dark outline. */
    private drawArrow(x: number, y: number, angle: number, length: number, color: string): void {
        const context = this.context;
        const dx = Math.cos(angle) * (length / 2);
        const dy = Math.sin(angle) * (length / 2);
        const tipX = x + dx;
        const tipY = y + dy;
        const head = Math.min(8, length * 0.4);
        const path = new Path2D();
        path.moveTo(x - dx, y - dy);
        path.lineTo(tipX, tipY);
        path.moveTo(tipX - Math.cos(angle - 0.5) * head, tipY - Math.sin(angle - 0.5) * head);
        path.lineTo(tipX, tipY);
        path.lineTo(tipX - Math.cos(angle + 0.5) * head, tipY - Math.sin(angle + 0.5) * head);
        context.strokeStyle = "rgba(15, 18, 24, 0.7)";
        context.lineWidth = 4.5;
        context.stroke(path);
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.stroke(path);
    }

    /** Colour of `value` on the gradient, blended between stops. */
    private color(value: number): string {
        const stops = this.gradient;
        let [r, g, b, a] = stops[stops.length - 1].color;
        if (value <= stops[0].value) {
            [r, g, b, a] = stops[0].color;
        } else {
            for (let k = 1; k < stops.length; k++) {
                if (value < stops[k].value) {
                    const t = (value - stops[k - 1].value) / (stops[k].value - stops[k - 1].value);
                    const from = stops[k - 1].color;
                    const to = stops[k].color;
                    [r, g, b, a] = from.map((channel, i) => channel + (to[i] - channel) * t);
                    break;
                }
            }
        }
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a / 255})`;
    }

    private requestData(frameState: FrameState): void {
        const source = this.getLayer().getSource();
        const projection = frameState.viewState.projection;
        const bbox = source?.getRequestBbox(frameState.extent!, projection);
        const time = source?.getTime() ?? "";
        // The old arrows stay until the new data arrives, so changing the time does not flicker.
        const key = bbox ? `${bbox.join(",")}@${time}` : "outside";
        if (key === this.requestedKey) {
            return;
        }
        this.requestedKey = key;
        this.request?.unsubscribe();
        if (!source || !bbox) {
            this.grids = undefined;
            return;
        }
        this.request = source.getVectorData(bbox, time).subscribe({
            next: grids => {
                this.grids = grids;
                this.getLayer().changed();
            },
            error: (error: unknown) => {
                console.error("Failed to load the wind data", error);
                this.requestedKey = undefined;
            },
        });
    }
}
