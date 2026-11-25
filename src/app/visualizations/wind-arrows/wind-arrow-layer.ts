import Layer, {Options} from "ol/layer/Layer";
import {EdrGridSource} from "../../edr/edr-grid-source";
import {Gradient} from "../../types/gradients.type";
import {LegendData, LegendOptions} from "../../types/legend.type";
import {WindArrowLayerRenderer} from "./wind-arrow-layer-renderer";

export type WindArrowLayerOptions = Options<EdrGridSource> & {
    /** Arrow colours by vector length (e.g. wind speed). */
    gradient: Gradient;
    /** Distance between arrows on screen, in CSS pixels. */
    spacing?: number;
    /** Title and value format of the layer's legend; no legend without it. */
    legend?: LegendOptions;
};

/**
 * Arrows showing a vector parameter (e.g. wind) from an `EdrGridSource` whose parameter has
 * `components`: each arrow points where the wind blows to, longer and warmer-coloured when stronger.
 */
export class WindArrowLayer extends Layer<EdrGridSource, WindArrowLayerRenderer> {
    private readonly gradient: Gradient;
    private readonly spacing: number;
    private readonly legend?: LegendOptions;

    constructor({gradient, spacing = 46, legend, ...options}: WindArrowLayerOptions) {
        super(options);
        this.gradient = gradient;
        this.spacing = spacing;
        this.legend = legend;
    }

    /** The legend for exactly the colours this layer draws, or `undefined` if it has none. */
    getLegend(): LegendData | undefined {
        if (!this.legend) {
            return undefined;
        }
        return {...this.legend, gradient: this.gradient, gradientMode: "linear"};
    }

    /** Called by OpenLayers when the layer is first rendered. */
    override createRenderer(): WindArrowLayerRenderer {
        return new WindArrowLayerRenderer(this, this.gradient, this.spacing);
    }
}
