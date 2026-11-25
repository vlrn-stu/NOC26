import {Gradient, GradientMode} from "./gradients.type";

/** What a layer's legend shows besides its colours. */
export interface LegendOptions {
    /** Title including the unit, e.g. "Temperature [°C]". */
    title: string;
    /** Converts a gradient stop value for display, e.g. Kelvin to °C. Defaults to the value itself. */
    formatValue?: (value: number) => string;
}

/** Everything needed to draw a legend that matches what the layer draws. */
export interface LegendData extends LegendOptions {
    gradient: Gradient;
    gradientMode: GradientMode;
}
