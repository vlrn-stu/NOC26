import {DatePipe, DecimalPipe} from "@angular/common";
import {Component, computed, input, model, output} from "@angular/core";
import type {PlaceForecast} from "../map/map-layers-helper.service";
import {Place} from "../types/places.type";
import {ForecastHour, GrillWindow, HourRating} from "./bbq-rating";
import {ForecastChartComponent} from "./forecast-chart";

const VERDICTS: Record<HourRating, string> = {
    good: "Grill weather",
    rain: "Rain",
    cold: "Too cold",
    unknown: "No data here",
};

/** Side panel: pick a place, see whether and when it is barbecue weather there. */
@Component({
    selector: "app-forecast-panel",
    templateUrl: "./forecast-panel.html",
    styleUrl: "./forecast-panel.css",
    imports: [DatePipe, DecimalPipe, ForecastChartComponent],
})
export class ForecastPanelComponent {
    readonly places = input.required<Place[]>();
    readonly placeName = input<string>();
    readonly forecast = input<PlaceForecast>();
    readonly hours = input.required<ForecastHour[]>();
    readonly selectedHour = input<ForecastHour>();
    readonly bestWindow = input<GrillWindow>();
    /** Shown instead of `bestWindow` when no hour is warm and dry enough. */
    readonly warmestDryHour = input<ForecastHour>();
    readonly selectedTime = model.required<string>();

    readonly pickPlace = output<Place>();
    readonly closePlace = output<void>();

    protected readonly quickPicks = computed(() => this.places().filter(place => place.quickPick));
    protected readonly verdict = computed(() => VERDICTS[this.selectedHour()?.rating ?? "unknown"]);
    protected readonly goodHours = computed(
        () => this.hours().filter(hour => hour.rating === "good").length
    );

    /** Time one hour after `time`: a window ending with the 15:00 hour lasts until 16:00. */
    protected hourAfter(time: string): number {
        return Date.parse(time) + 60 * 60 * 1000;
    }

    protected isNaN(value: number): boolean {
        return Number.isNaN(value);
    }

    protected celsius(value: number): string {
        const rounded = Math.round(value);
        return String(Object.is(rounded, -0) ? 0 : rounded);
    }
}
