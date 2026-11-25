import {Component, computed, input} from "@angular/core";
import {LegendData} from "../../types/legend.type";

/** A colour bar with the stop values of one layer's gradient. */
@Component({
    selector: "app-legend",
    templateUrl: "./legend.html",
    styleUrl: "./legend.css",
})
export class LegendComponent {
    readonly legend = input.required<LegendData>();

    /** CSS gradient that matches the layer: blended for "linear", hard bands for "stepped". */
    protected readonly background = computed(() => {
        const {gradient, gradientMode} = this.legend();
        const last = Math.max(1, gradient.length - 1);
        const colors = gradient.map(
            stop => `rgba(${stop.color.slice(0, 3).join(", ")}, ${stop.color[3] / 255})`
        );
        const parts =
            gradientMode === "stepped"
                ? colors.map(
                      (color, i) =>
                          `${color} ${(i / (last + 1)) * 100}% ${((i + 1) / (last + 1)) * 100}%`
                  )
                : colors.map((color, i) => `${color} ${(i / last) * 100}%`);
        return `linear-gradient(to right, ${parts.join(", ")})`;
    });

    /** Stop labels, placed under the colour they belong to. */
    protected readonly labels = computed(() => {
        const {gradient, gradientMode, formatValue} = this.legend();
        const format = formatValue ?? ((value: number) => String(value));
        const last = Math.max(1, gradient.length - 1);
        return gradient.map((stop, i) => ({
            text: format(stop.value),
            left: gradientMode === "stepped" ? (i / (last + 1)) * 100 : (i / last) * 100,
        }));
    });
}
