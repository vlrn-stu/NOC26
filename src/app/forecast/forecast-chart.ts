import {DatePipe} from "@angular/common";
import {Component, computed, input, model} from "@angular/core";
import {ForecastHour} from "./bbq-rating";

/** Drawing area in SVG units; the chart is stretched to the width of its box. */
const HOUR_WIDTH = 10;
const TEMPERATURE_TOP = 8;
const TEMPERATURE_BOTTOM = 62;
const RAIN_BOTTOM = 96;
const RAIN_HEIGHT = 30;
const RATING_TOP = 100;
const RATING_HEIGHT = 8;
export const CHART_HEIGHT = RATING_TOP + RATING_HEIGHT;

/** Temperature line, rain bars and the grill rating of every hour; click or drag to pick an hour. */
@Component({
    selector: "app-forecast-chart",
    templateUrl: "./forecast-chart.html",
    styleUrl: "./forecast-chart.css",
    imports: [DatePipe],
})
export class ForecastChartComponent {
    readonly hours = input.required<ForecastHour[]>();
    readonly selectedTime = model.required<string>();

    protected readonly width = computed(() => Math.max(1, this.hours().length) * HOUR_WIDTH);
    protected readonly height = CHART_HEIGHT;
    protected readonly ratingTop = RATING_TOP;
    protected readonly ratingHeight = RATING_HEIGHT;
    protected readonly hourWidth = HOUR_WIDTH;

    /** Temperature range drawn, padded so the line never touches the edges. */
    private readonly range = computed(() => {
        const values = this.hours()
            .map(hour => hour.temperatureC)
            .filter(value => !Number.isNaN(value));
        const min = Math.floor(Math.min(...values, Infinity) - 1);
        const max = Math.ceil(Math.max(...values, -Infinity) + 1);
        return values.length > 0 ? {min, max} : {min: 0, max: 10};
    });

    protected readonly temperaturePath = computed(() => {
        let path = "";
        let drawing = false;
        this.hours().forEach((hour, index) => {
            if (Number.isNaN(hour.temperatureC)) {
                drawing = false;
                return;
            }
            path += `${drawing ? "L" : "M"}${this.x(index)},${this.temperatureY(hour.temperatureC)}`;
            drawing = true;
        });
        return path;
    });

    /** The 0 °C line, when freezing is within the drawn range. */
    protected readonly freezingY = computed(() => {
        const {min, max} = this.range();
        return min < 0 && max > 0 ? this.temperatureY(0) : undefined;
    });

    protected readonly rainBars = computed(() => {
        const rain = this.hours().map(hour => (Number.isNaN(hour.rainMm) ? 0 : hour.rainMm));
        const scale = Math.max(2, ...rain);
        return rain
            .map((mm, index) => ({x: index * HOUR_WIDTH + 1.5, height: (mm / scale) * RAIN_HEIGHT}))
            .filter(bar => bar.height > 0.3)
            .map(bar => ({...bar, y: RAIN_BOTTOM - bar.height}));
    });

    protected readonly selectedIndex = computed(() =>
        this.hours().findIndex(hour => hour.time === this.selectedTime())
    );

    /** Local midnights, as a share of the width, with the day's name. */
    protected readonly days = computed(() => {
        const hours = this.hours();
        return hours
            .map((hour, index) => ({time: hour.time, index, date: new Date(hour.time)}))
            .filter(({date}, index) => index === 0 || date.getHours() === 0)
            .map(({time, index}) => ({time, left: (index / Math.max(1, hours.length)) * 100}));
    });

    protected readonly temperatureLabels = computed(() => {
        const {min, max} = this.range();
        return {
            max: `${max}°`,
            min: `${min}°`,
            maxTop: (TEMPERATURE_TOP / CHART_HEIGHT) * 100,
            minTop: (TEMPERATURE_BOTTOM / CHART_HEIGHT) * 100,
        };
    });

    protected pick(event: PointerEvent): void {
        if (event.type === "pointermove" && event.buttons !== 1) {
            return;
        }
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const hours = this.hours();
        const index = Math.floor(((event.clientX - box.left) / box.width) * hours.length);
        const hour = hours[Math.min(Math.max(index, 0), hours.length - 1)];
        if (hour) {
            this.selectedTime.set(hour.time);
        }
    }

    private x(index: number): number {
        return index * HOUR_WIDTH + HOUR_WIDTH / 2;
    }

    private temperatureY(celsius: number): number {
        const {min, max} = this.range();
        return (
            TEMPERATURE_BOTTOM - ((celsius - min) / (max - min)) * (TEMPERATURE_BOTTOM - TEMPERATURE_TOP)
        );
    }
}
