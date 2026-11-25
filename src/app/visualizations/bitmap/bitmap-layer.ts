import Layer, {Options} from "ol/layer/Layer";
import {EdrGridSource} from "../../edr/edr-grid-source";
import {Gradient, GradientMode} from "../../types/gradients.type";
import {LegendData, LegendOptions} from "../../types/legend.type";
import {BitmapLayerRenderer} from "./bitmap-layer-renderer";

export type BitmapLayerOptions = Options<EdrGridSource> & {
    /** Colours for the grid values. */
    gradient: Gradient;
    /** Smooth ("linear", the default) or banded ("stepped") colours between gradient stops. */
    gradientMode?: GradientMode;
    /** Title and value format of the layer's legend; no legend without it. */
    legend?: LegendOptions;
};

/**
 * Shows grid data (e.g. temperature) as a coloured image over the map. The colours are computed
 * per pixel on the GPU by `BitmapLayerRenderer`.
 */
export class BitmapLayer extends Layer<EdrGridSource, BitmapLayerRenderer> {
    private readonly gradient: Gradient;
    private readonly gradientMode: GradientMode;
    private readonly legend?: LegendOptions;

    constructor({gradient, gradientMode = "linear", legend, ...options}: BitmapLayerOptions) {
        super(options);
        this.gradient = gradient;
        this.gradientMode = gradientMode;
        this.legend = legend;
    }

    /** The legend for exactly the colours this layer draws, or `undefined` if it has none. */
    getLegend(): LegendData | undefined {
        if (!this.legend) {
            return undefined;
        }
        return {...this.legend, gradient: this.gradient, gradientMode: this.gradientMode};
    }

    /** Called by OpenLayers when the layer is first rendered. */
    override createRenderer(): BitmapLayerRenderer {
        return new BitmapLayerRenderer(this, this.gradient, this.gradientMode);
    }
}
